import { resolve, join } from 'path';
import fs from 'fs';

export const pathResolve = (stack) => ({
	name: "path-resolve",
	setup(build) {
		// tag .html files as html templates
		build.onResolve({filter: /\.(css|sass|scss|less)$/}, async args => {
			let resolvedPath = resolve(args.path);
			let skip = true;

			if ( args.path.indexOf('~') == 0 ) {
				console.log("----------------------------------");
				console.log(args);
				console.log(args.resolveDir, args.path);
				const relPath = args.path.substring(1)
				resolvedPath = resolve(join(stack, "node_modules", relPath));
				skip = false;
				console.log(resolvedPath);
			}


			if ( !skip ) {
				return {
					path: resolvedPath
				}
			}
		});
	}
})