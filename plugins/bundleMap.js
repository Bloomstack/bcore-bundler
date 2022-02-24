import fs from "fs/promises";
import path from "path";

export const bundleMap = (config) => {
  return {
    name: "bundle-map",
    setup(build) {
      const options = build.initialOptions;
      const buildDirName = options.outdir.substring(options.outbase.length);
      const metaFilePath = path.join(options.outdir, `${config.stackName}.map.json`);

      build.onEnd(async result => {
        if ( result.metafile && result.metafile.outputs ) {
          const map = Object.entries(result.metafile.outputs).reduce((p, [key, value]) => {
            if ( key.substring(key.length - 4) != ".map" ) {
              if ( value.entryPoint ) {
                const entryPoint = '/dist/' + value.entryPoint;
                const filePath = '/dist/' + key.substring(buildDirName.length);
                p[entryPoint] = filePath;
              }
            }
            return p;
          }, {});

          await fs.writeFile(metaFilePath, JSON.stringify(map))
        }
      });
    }
  }
};