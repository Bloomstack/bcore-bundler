import { join, basename } from "path";
import { readFile } from "fs/promises";

export const htmlTemplatePlugin = () => {
	return {
		name: 'html-template-plugin',
		setup(build) {
			// tag .html files as html templates
			build.onResolve({ filter: /\.html$/ }, args => ({
				namespace: "html-template",
				path: join(args.resolveDir, args.path),
			}));

			// inject html templates into bcore.templates object
			build.onLoad({ filter: /.*/, namespace: "html-template" }, args => {
				const filename = basename(args.path, ".html");
  
				return readFile(args.path, "utf-8")
					.then(content => {
						// clean up
						content = content.replace(/`/g, "\\`");
						return {
							contents: `\n\tbcore.templates['${filename}'] = \`${content}\`;\n`
						};
					})
					.catch(() => ({
						contents: "",
						warnings: [{ text: `Error importing ${args.path}` }]
					}));
			});
		}
	}
}