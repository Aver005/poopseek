import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export async function writeTextFile(targetPath: string, content: string): Promise<void>
{
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    const tempPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`,
    );

    const handle = await fs.promises.open(tempPath, "w");

    try
    {
        await handle.writeFile(content, "utf8");
        await handle.sync();
    }
    finally
    {
        await handle.close();
    }

    await fs.promises.rename(tempPath, targetPath);

    const now = new Date();
    await fs.promises.utimes(targetPath, now, now);
}
