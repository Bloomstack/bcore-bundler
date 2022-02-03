import { fileURLToPath } from 'url';
import { dirname, parse, join } from 'path';

/**
 * Returns { __filename, __dirname } object defining a scripts directory and file name.
 * @param {*} meta A script's meta object defining es module meta information
 */
export function getScriptMeta(meta) {
	const __filename = fileURLToPath(meta.url);
	const __dirname = dirname(__filename);
	return { __filename, __dirname };
}

/**
 * Returns true if the provided meta comes from the script that started this process.
 * @param {*} meta The main script meta object usually provided by import.meta
 */
export function isMain(meta) {
	const { __filename, __dirname } = getScriptMeta(meta);
	const loadedScript = join(dirname(process.argv[1]), parse(process.argv[1]).name);
	const match = [ join(__dirname, parse(__filename).name), __dirname ];
	for(const scriptPath of match) {
		if ( scriptPath == loadedScript ) {
			return true;
		}
	}
	return false;
}