import fs from "node:fs/promises";
import path from "node:path";

const pluginDir = import.meta.dir;
const outDir = path.resolve(pluginDir, "../../build/plugins/figma");

await fs.mkdir(outDir, { recursive: true });

const proc = Bun.spawn({
    cmd: [
        "bunx", "esbuild",
        "src/code.ts",
        "--bundle",
        `--outfile=${path.join(outDir, "code.js")}`,
        "--target=es2015",
        "--platform=browser",
    ],
    stdout: "inherit",
    stderr: "inherit",
    cwd: pluginDir,
});

const code = await proc.exited;
if (code !== 0) process.exit(code ?? 1);

await fs.copyFile(
    path.join(pluginDir, "manifest.json"),
    path.join(outDir, "manifest.json"),
);
await fs.copyFile(
    path.join(pluginDir, "ui.html"),
    path.join(outDir, "ui.html"),
);

console.log("✅ build/plugins/figma/ (code.js + manifest.json + ui.html)");
