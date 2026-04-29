const proc = Bun.spawn({
    cmd: [
        "bunx", "esbuild",
        "src/code.ts",
        "--bundle",
        "--outfile=dist/code.js",
        "--target=es2018",
        "--platform=browser",
    ],
    stdout: "inherit",
    stderr: "inherit",
    cwd: import.meta.dir,
});

const code = await proc.exited;
if (code !== 0) process.exit(code ?? 1);
console.log("Built: plugins/figma/dist/code.js");
