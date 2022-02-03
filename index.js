import path, { sep } from "path";
import { emptyDir, copy } from 'fs-extra';
import glob from 'fast-glob';
import { build, analyzeMetafile } from 'esbuild';
import vuePlugin from 'esbuild-vue';
import { skypackPlugin } from './plugins/skypack.js';
import { htmlTemplatePlugin } from './plugins/htmlTemplate.js';
import { ignoreAssets } from './plugins/assets.js';
import { pathResolve } from './plugins/pathResolve.js';
import { sassPlugin } from 'esbuild-sass-plugin';
import { lessLoader } from 'esbuild-plugin-less';
import { getScriptMeta } from './utils.js';
import { readFile } from "fs/promises";
import { createServer } from "http";

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

export function buildNodeModulePaths(stack) {
	const nodePaths = [
		path.resolve(`${stack}/node_modules`)
	];
	return nodePaths;
}

/**
 * @typedef {object} BundleConfig
 * @property {string} stackPath The stack path
 * @property {boolean} watch Wether to watch for file changes and automatically rebuild bundles.
 * @property {boolean} production When true, will minify and prepare bundles for production
 * @property {string} format Enables bundling in different formats. Supports esm and cjs.
 * 														Defaults to cjs
 * @property {boolean} analyze Outputs bundle sizes and reports on internal package size
 * 														that make up the bundle.
 * @property {boolean} minify When true, minifies the bundle.
 * @property {function} configure When provided the build will pass the configuration
 * 											object before start bundling to allow modifying the configuration.
 */

/**
 * Builds all bundles from the provided stack path
 * @param {BundleConfig} config Bundle configuration object.
 * @returns Promise<void>
 */
export async function bundle({stackPath, watch=false, production=false, format="cjs", analyze=false, minify=false, configure}) {
	const { __dirname } = getScriptMeta(import.meta);
	const packages = JSON.parse((await readFile(path.resolve(stackPath, "package.json"))).toString());
	const entryPoints = await glob(buildIncludePatterns(stackPath));
	const distribute_packages = (packages.bcore || {}).distribute || [];
	const nodePaths = buildNodeModulePaths(stackPath);
	const outdir = path.resolve(`${stackPath}/${production ? 'dist' : 'build'}`);
	const external = distribute_packages;
	const clients = [];

	const reloadBrowser = (error, result) => {
		clients.forEach((res) => res.write(`data: ${JSON.stringify(data)}\n\n`));
		clients.length = 0;
		if ( error ) {
			for(const msg in error.errors) {
				console.log(msg.text);
			}
		}	
	}

	console.log(`- Building: ${format} ${outdir}`);

	await emptyDir(outdir);

	const copyPromises = [];
	for (const pkg of distribute_packages) {
		const copyPath = path.resolve(stackPath, "node_modules", pkg);
		const dest = path.join(outdir, "thirdparty", pkg);
		console.log(`- [COPY]: ${copyPath} => ${dest}`);
		copyPromises.push(copy(copyPath, dest));
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
			external,
			inject: [
				path.resolve(path.join(__dirname, 'shims', 'react-shim.js')),
				path.resolve(path.join(__dirname, 'shims', 'vue-shim.js')),
			],
			outdir,
			outbase: stackPath,
			sourcemap: "external",
			metafile: true,
			minify: minify || production,
			nodePaths,
			format: format,
			legalComments: "linked",
			logLevel: "info",
			plugins: [
				pathResolve(stackPath),
				htmlTemplatePlugin(),
				ignoreAssets(),
				...((format == "esm" && [
						skypackPlugin({
							stack: stackPath
						})
					]) || []
				),
				vuePlugin(),
				sassPlugin({
					filter: /\.bundle\.scss$/,
					type: "css",
					sourceMap: production
				}),
				sassPlugin({
					type: "css-text",
					sourceMap: production
				}),
				lessLoader({
					sourceMap: production
				})
			],
			define: {
				"process.env.NODE_ENV": JSON.stringify(production?"production":"development"),
			},
			...( (watch && {
					watch: {
						onRebuild: reloadBrowser,
					}
				}) || {}
			)
		};

		// allow apps to modify builder configuration
		if ( typeof configure === "function" ) {
			config = configure(config);
		}

		// start bundling
		const result = await build(config);

		// when we are watching for changes start the reload server trigger
		if ( watch ) {
			reloadBrowser(null, result)

			createServer((req, res) => {
				return clients.push(
					res.writeHead(200, {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"Access-Control-Allow-Origin": "*",
						Connection: "keep-alive",
					}),
				);
			}).listen(7000);
		}

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