import fs from "node:fs/promises";
import path from "node:path";

function getVersionArg(argv: readonly string[]): string | null
{
    for (let i = 0; i < argv.length; i += 1)
    {
        const arg = argv[i];
        if (arg !== "--version" && arg !== "-v") continue;
        const value = argv[i + 1]?.trim() ?? "";
        if (value.length === 0)
            throw new Error("Передай версию: --version 1.2.3");
        return value;
    }
    return null;
}

async function copyDirectory(src: string, dest: string): Promise<void>
{
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest, { recursive: true, force: true });
}

async function main(): Promise<void>
{
    const rootPath = path.resolve(import.meta.dir, "..");
    const outDir = path.join(rootPath, "build", "windows");
    const exePath = path.join(outDir, "poopseek.exe");
    const version = getVersionArg(Bun.argv.slice(2));
    const define: Record<string, string> = {};

    if (version) define.__APP_VERSION__ = JSON.stringify(version);

    const result = await Bun.build({
        entrypoints: [path.join(rootPath, "src/index.ts")],
        compile: {
            outfile: exePath,
            autoloadTsconfig: true,
            autoloadPackageJson: true,
            windows: version ? { version } : undefined,
        },
        define,
    });

    if (!result.success)
    {
        for (const log of result.logs) console.error(log.message);
        process.exit(1);
    }

    await fs.mkdir(outDir, { recursive: true });
    await copyDirectory(path.join(rootPath, "assets"), path.join(outDir, "assets"));
    await copyDirectory(path.join(rootPath, "docs", "tools"), path.join(outDir, "docs", "tools"));

    console.log(`✅ build/windows/poopseek.exe${version ? ` v${version}` : ""}`);
}

await main();
