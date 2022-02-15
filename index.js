import path, { sep } from "path";
import glob from 'fast-glob';
import { emptyDir, copy } from 'fs-extra';
import { build, analyzeMetafile } from 'esbuild';
import vuePlugin from 'esbuild-vue';
import ExternalGlobalsPlugin from "esbuild-plugin-external-global";
import { skypackPlugin } from './plugins/skypack.js';
import { htmlTemplatePlugin } from './plugins/htmlTemplate.js';
import { ignoreAssets } from './plugins/assets.js';
import { pathResolve } from './plugins/pathResolve.js';
import { bundleMap } from "./plugins/bundleMap.js";
import { sassPlugin } from 'esbuild-sass-plugin';
import { lessLoader } from 'esbuild-plugin-less';
import { getScriptMeta } from './utils.js';
import { readFile } from "fs/promises";
import { createServer } from "http";
import LessPluginImportNodeModules from "less-plugin-import-node-modules";
import postcss from "postcss";
import autoprefixer from "autoprefixer";

/**
 * Builds glob pattern to find all buildable files.
 * @param {string} root_path The root path to prefix glob patterns.
 * @returns Array<string>
 */
export function buildIncludePatterns(root_path) {
	const absPath = path.resolve(root_path).split(sep).join("/");
	return [
		`${absPath}/*/public/*.bundle.+(js|jsx|ts|tsx|less|scss|css)`,
		`${absPath}/**/*.bundle.+(js|jsx|ts|tsx)`,
		`!${absPath}/**/node_modules/**`,
		`!${absPath}/**/__pypackages__/**`
	];
}

export function buildNodeModulePaths(stackPath, libPath) {
	const nodePaths = [
		path.resolve(`${libPath}/node_modules`),
		path.resolve(`${stackPath}/node_modules`)
	];
	return nodePaths;
}

/**
 * @typedef {object} BundleConfig
 * @property {string} stackPath The stack path
 * @property {boolean} watch	Wether to watch for file changes and automatically rebuild bundles.
 * @property {boolean} production When true, will minify and prepare bundles for production
 * @property {string} format	Enables bundling in different formats. Supports esm and cjs.
 * 														Defaults to cjs
 * @property {boolean} analyze	Outputs bundle sizes and reports on internal package size
 * 															that make up the bundle.
 * @property {boolean} minify	When true, minifies the bundle.
 * @property {object} externalMap	An object mapping packages to externalize. Internally this map
 * 																is passed directed to the esbuild-plugin-external-global plugin.
 * @property {function} configure	When provided the build will pass the configuration
 					* 											object before start bundling to allow modifying the configuration.
 */

/**
 * Builds all bundles from the provided stack path
 * @param {BundleConfig} config Bundle configuration object.
 * @returns Promise<void>
 */
export async function bundle({ stackPath, watch = false, production = false, format = "cjs", analyze = false, minify = false, externalMap = {}, configure }) {
	const { __dirname } = getScriptMeta(import.meta);
	const packages = JSON.parse((await readFile(path.resolve(stackPath, "package.json"))).toString());
	const entryPoints = await glob(buildIncludePatterns(stackPath));
	const nodePaths = buildNodeModulePaths(stackPath, __dirname);
	const buildDirName = production ? 'dist' : 'build';
	const outdir = path.resolve(`${stackPath}/${buildDirName}`);
	const clients = [];

	const distribute = (packages.bcore || {}).distribute || {};
	const externals = [];
	const globalExternalsMap = {
		...externalMap
	};

	const reloadBrowser = (error, result) => {
		console.log(`Changes detected, sending reload signal to ${clients.length} clients`);
		const data = {
			success: !!!error,
			errors: error ? error.errors : [],
			warnings: error ? error.warnings : []
		}
		clients.forEach((res) => res.write(`data: ${JSON.stringify(data)}\n\n`));
		if (error) {
			for (const msg in error.errors) {
				console.log(msg.text);
			}
		} else {
			// expecting client to reload...
			clients.length = 0;
		}
	}

	console.log(`- Building: ${format} ${outdir}`);

	await emptyDir(outdir);

	const copyPromises = [];
	for (const [key, map] of Object.entries(distribute)) {
		if (map.files != undefined) {
			const copyPath = path.resolve(stackPath, "node_modules", map.files);
			const dest = path.join(outdir, "thirdparty", map.files);
			console.log(`- [COPY]: ${copyPath} => ${dest}`);
			copyPromises.push(copy(copyPath, dest));
		}

		if (map.global) {
			globalExternalsMap[key] = map.global;
		}

		if (map.external) {
			externals.push(map.external);
		} else {
			externals.push(key);
		}
	}

	Promise.allSettled(copyPromises);

	try {
		let config = {
			entryPoints,
			entryNames: "[dir]/[name].[hash]",
			bundle: true,
			loader: {
				'.png': 'file',
				'.jpg': 'file',
				'.jpeg': 'file',
				'.svg': 'file',
				'.woff': 'file',
				'.woff2': 'file',
				'.eot': 'file',
				'.ttf': 'file'
			},
			inject: [
				path.resolve(path.join(__dirname, 'shims', 'react-shim.js')),
				path.resolve(path.join(__dirname, 'shims', 'vue-shim.js')),
			],
			outdir,
			outbase: stackPath,
			sourcemap: true, 	// link source files
			metafile: true,
			minify: minify || production,
			nodePaths,
			format: format,
			legalComments: "linked",
			logLevel: "info",
			external: externals,
			plugins: [
				bundleMap(),
				pathResolve(stackPath),
				sassPlugin({
					filter: /\.bundle\.scss$/,
					type: "css",
					sourceMap: production,
					async transform(source) {
						const { css } = await postcss([autoprefixer]).process(source);
						return css;
					},
				}),
				sassPlugin({
					type: "css-text",
					sourceMap: production,
					async transform(source) {
						const { css } = await postcss([autoprefixer]).process(source);
						return css;
					},
				}),
				lessLoader({
					filter: /\.bundle\.less$/,
					sourceMap: production,
					plugins: [new LessPluginImportNodeModules()]
				}),
				htmlTemplatePlugin(),
				ignoreAssets(),
				...((format == "esm" && [
					skypackPlugin({
						stack: stackPath
					})
				]) || []
				),
				ExternalGlobalsPlugin.externalGlobalPlugin({
					...globalExternalsMap
				}),
				vuePlugin(),
			],
			define: {
				"process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
			},
			...((watch && {
				watch: {
					onRebuild: reloadBrowser,

				}
			}) || {}
			)
		};

		// allow apps to modify builder configuration
		if (typeof configure === "function") {
			config = configure(config);
		}

		// start bundling
		const buildPromise = build(config);
		buildPromise
			.then((r) => reloadBrowser(null, r))
			.catch((err) => {
				console.error(err);
				process.exit(1);
			});

		// when we are watching for changes start the reload server trigger
		if (watch) {
			// reloadBrowser(null, result);

			console.log("Sending messages at http://localhost:7000");
			createServer((req, res) => {
				console.log("Dev client connected!");
				const dropClient = (res) => {
					const index = clients.indexOf(res);
					if (index > -1) {
						clients.splice(index, 1);
					}
				}

				req.on("close", function () {
					console.warn("Dev client disconnected unexpectedly.");
					dropClient(res);
				});

				req.on("end", function () {
					console.log("Dev client disconnected.");
					dropClient(res);
				});

				res.setHeader('Access-Control-Allow-Origin', '*');
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Access-Control-Allow-Origin": "*",
					Connection: "keep-alive",
				})

				return clients.push(res);
			}).listen(7000);
		}

		const result = await buildPromise;

		if (analyze) {
			let text = await analyzeMetafile(result.metafile, {
				color: true
			})

			console.log(text);
		}
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
}