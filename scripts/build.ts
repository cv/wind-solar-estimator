// Bundles src/ into dist/ for GitHub Pages: hashed JS and CSS (so browsers never mix
// cached files from different releases) and an index.html that points at them.
//
//   node scripts/build.ts            production build into dist/
//   node scripts/build.ts --watch    rebuild on change (serve dist/ with any static server)

import * as esbuild from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const watch = process.argv.includes("--watch");
const OUT = "dist";
const PLACEHOLDER = "<!-- build: assets -->";

/** Writes dist/index.html with the hashed asset names from this build. */
const writeIndex: esbuild.Plugin = {
  name: "index-html",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length || !result.metafile) return;
      const outputs = Object.entries(result.metafile.outputs);
      const find = (entry: string) => outputs.find(([, o]) => o.entryPoint === entry)?.[0];
      const js = find("src/main.ts");
      const css = outputs.find(([file]) => file.endsWith(".css") && !file.endsWith(".map"))?.[0];
      if (!js || !css) throw new Error("build: missing JS or CSS output");
      const template = await readFile("index.html", "utf8");
      if (!template.includes(PLACEHOLDER)) throw new Error(`index.html has no ${PLACEHOLDER}`);
      const tags = [
        `<link rel="stylesheet" href="assets/${basename(css)}">`,
        `<script type="module" src="assets/${basename(js)}"></script>`,
      ].join("\n  ");
      await writeFile(`${OUT}/index.html`, template.replace(PLACEHOLDER, tags));
      console.log(`built ${basename(js)}, ${basename(css)}`);
    });
  },
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const options: esbuild.BuildOptions = {
  entryPoints: ["src/main.ts", "src/styles/style.css"],
  outdir: `${OUT}/assets`,
  entryNames: "[name]-[hash]",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: !watch,
  sourcemap: true,
  metafile: true,
  logLevel: "warning",
  plugins: [writeIndex],
};
if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ ...");
} else {
  await esbuild.build(options);
}
