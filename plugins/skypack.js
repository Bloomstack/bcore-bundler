import { join, resolve } from 'path';
import { mkdirSync, readFileSync } from 'fs';
import { getScriptMeta } from '../utils.js';

const { __dirname } = getScriptMeta(import.meta);

function loadPackages() {
	const rawJson = readFileSync(resolve(join(__dirname, "..", "..", "package.json")));
	return JSON.parse(rawJson);
}




export const skypackPlugin = (options) => {
	if ( options.stack == undefined ) {
		throw Error("Missing stack option!");
	}

	const { dependencies } = loadPackages();

	const skypack_cache_path = join(options.stack, ".skypack");
	try {
		mkdirSync(skypack_cache_path, {
			recursive: true
		});
	} catch(err) {
		// Ignore if path already exists
	}

	return {
		name: 'skypack-import-plugin',
		setup(build) {
			build.onResolve({
				filter: /.*/,
				namespace: "file"
			}, args => {

				if ( args.kind != 'entry-point' ) {
					const [pkg, prest] = args.path.split('/', 1);

					if ( dependencies[pkg] != undefined ) {
						const version = dependencies[pkg];
						return {
							path: `https://cdn.skypack.dev/${pkg}@${version}${prest?'/'+prest:''}`,
							namespace: "skypack",
							external: true
						}
					}
				}
			});

			// build.onLoad({
			//   filter: /.*/,
			//   namespace: "skypack"
			// }, async args => {

			//   console.log(args.path);

			//   if ( args.namespace != "skypack" ) {
			//     return;
			//   }
        
			//   const package_hash = createHash("sha256").update(args.path).digest('hex');
			//   const package_path = join(skypack_cache_path, package_hash)
			//   console.log(`- Fetching from skypack: ${args.path}`);
			//   try {
			//     await fsfsPromise.stat(package_path)
			//     const cache_file = await open(package_path, "r");
			//     const contents = await cache_file.readFile();
			//     cache_file.close();
			//       return {
			//       contents: contents.toString('utf-8'),
			//       resolveDir: skypack_cache_path
			//     }
			//   } catch (err) {
			//     // Ignore
			//   }
        
			//   const content = await fetch(args.path);
			//   const out_cache = createWriteStream(package_path);
			//   const pipePromise = new Promise((resolve, reject) => {
			//     content.body.on("finish", resolve);
			//     content.body.on("error", reject);
			//   })
			//   const writable = content.body.pipe(out_cache);
			//   await pipePromise;
			//   writable.close();
			//   out_cache.close();
			//   content.body.close();

			//   const cache_file = await open(package_path, "r");
			//   const contents = await cache_file.readFile();
			//   cache_file.close();

			//   return {
			//     contents: contents.toString('utf-8'),
			//     resolveDir: "https://cdn.skypack.dev"
			//   }
        
			// });


		},
	};
}