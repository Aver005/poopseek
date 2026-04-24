import { stdout as output } from "node:process";

export function writeLine(text: string): void
{
    output.write(`${text}\n`);
}

export function write(text: string): void
{
    output.write(text);
}
