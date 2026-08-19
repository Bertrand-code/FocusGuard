import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("..", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  absWorkingDir: root.pathname,
  entryPoints: {
    background: "src/background.ts",
    popup: "src/popup.ts",
    block: "src/block.ts",
  },
  bundle: true,
  format: "esm",
  outdir: dist.pathname,
  target: "chrome120",
  sourcemap: false,
  minify: false,
  legalComments: "none",
});
await cp(new URL("../static/", import.meta.url), dist, { recursive: true });
