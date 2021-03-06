#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path, { sep } from "path";
import { isMain } from './utils.js';
import { bundle } from "./index.js";

/**
 * Invokes the bcore cli parser to handle terminal commands.
 * @param {*} meta The current import.meta where this function is invoked from.
 * @param {function} configure A callback function that is called just before bundling to allow configuration overrides.
 * @param {object} externalMap An externals to globals maping object. Internally passed to the esbuild-plugin-external-global plugin.
 */
export async function cli(meta, configure, externalMap) {
	return yargs(hideBin(process.argv))
		.command('bundle [path]', 'Bundle a stack', (yargs) => {
			return yargs
				.positional("path", {
					type: "string",
					desc: "One or more stack paths to create bundles from",
					default: "."
				})
				.option("production", {
					type: "boolean",
					desc: "Creates all bundles in ./dict path. Otherwise all bundles will be put in ./build",
					default: false
				})
				.option("format", {
					alias: "f",
					type: "string",
					desc: "Sets the compilation format. Options: esm, cjs",
					default: "esm"
				})
				.option("minify", {
					alias: "m",
					type: "boolean",
					desc: "When true minifies bundles"
				})
				.option("analyze", {
					alias: "a",
					type: "boolean",
					desc: "Outputs human readable bundle analysis. Displaying which packages were bundled and how much space they take.",
				});
		}, async (argv) => {
			if (argv.verbose) console.info(`[Bundling] ${argv.path}`)
			try {
				await bundle({ 
					stackPath: path.resolve(argv.path), 
					watch: false, 
					production: argv.production,
					format: argv.format,
					analyze: argv.analyze,
					minify: argv.minify,
					configure: configure,
					externalMap
				});
			} catch(err) {
				console.error(err);
				process.exit(1)
			}
		})
		.command('watch [path]', 'Watches and bundles a stack', (yargs) => {
			return yargs
				.positional("path", {
					type: "string",
					desc: "One or more stack paths to create bundles from",
					default: "."
				})
				.option("production", {
					type: "boolean",
					desc: "Creates all bundles in ./dict path. Otherwise all bundles will be put in ./build",
					default: false
				})
				.option("minify", {
					alias: "m",
					type: "boolean",
					desc: "When true minifies bundles"
				})
				.option("format", {
					alias: "f",
					type: "string",
					desc: "Sets the compilation format. Options: esm, cjs",
					default: "esm"
				})
		}, async (argv) => {
			if (argv.verbose) console.info(`[Watching] ${argv.path}`)
			try {
				await bundle({
					stackPath: path.resolve(argv.path),
					watch: true,
					production: argv.production,
					format: argv.format,
					analyze: false,
					minify: argv.minify,
					configure: configure,
					externalMap
				});
			} catch(err) {
				console.error(err);
				process.exit(1)
			}
		})
		.option('verbose', {
			alias: 'v',
			type: 'boolean',
			description: 'Run with verbose logging'
		})
		.parse();
}

// only trigger cli if we are explicitly the main app running.
if (isMain(import.meta)) {
	await cli();
}