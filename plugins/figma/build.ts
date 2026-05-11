import fs from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

const pluginDir = import.meta.dir;
const outDir = path.resolve(pluginDir, "../../build/plugins/figma");

await fs.mkdir(outDir, { recursive: true });

// esbuild is used (NOT Bun.build) because Figma's plugin sandbox runs an
// older JavaScript engine that doesn't support ES2020 syntax like `??`
// (nullish coalescing) or `?.` (optional chaining). We need target=es2015
// to downlevel that syntax. Bun.build emits modern ES — Figma chokes with
// "Unexpected token ?" at runtime. esbuild handles the transpilation
// cleanly. It's installed as a local devDependency so there's no flaky
// `bunx esbuild@latest` download per run.
const result = await esbuild.build({
    entryPoints: [path.join(pluginDir, "src/code.ts")],
    outfile: path.join(outDir, "code.js"),
    bundle: true,
    target: "es2015",
    platform: "browser",
    format: "iife",
    logLevel: "info",
});

if (result.errors.length > 0)
{
    console.error("✗ esbuild errors:");
    for (const err of result.errors) console.error(err);
    process.exit(1);
}

await fs.copyFile(
    path.join(pluginDir, "manifest.json"),
    path.join(outDir, "manifest.json"),
);
// Inline ui.css into ui.html
const css = await fs.readFile(path.join(pluginDir, "ui.css"), "utf-8");
let html = await fs.readFile(path.join(pluginDir, "ui.html"), "utf-8");
html = html.replace("/* CSS_INLINE */", css);
await fs.writeFile(path.join(outDir, "ui.html"), html, "utf-8");

console.log("✅ build/plugins/figma/ (code.js + manifest.json + ui.html)");
