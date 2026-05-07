import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { applyDiff } from "@/figma/engine/jsx/jsx-diff-applier";

export interface HandymanSuccess
{
    ok: true;
    assistantText: string;
}

export interface HandymanFailure
{
    ok: false;
    error: string;
}

export type HandymanResult = HandymanSuccess | HandymanFailure;

function parseResponse(text: string): { removedKeys: string[]; diffJsx: string }
{
    const removedRaw = text.match(/##\s+REMOVED[^\n]*\n([\s\S]*?)(?=\n##|\s*$)/i)?.[1]?.trim() ?? "";
    const diffRaw = text.match(/##\s+DIFF\b[^\n]*\n([\s\S]*?)(?=\n##|\s*$)/i)?.[1]?.trim() ?? "";

    const removedKeys = removedRaw
        ? removedRaw.split(/[\n,]+/).map(s => s.replace(/^[-*]\s*/, "").trim()).filter(s => s && s !== "(none)")
        : [];

    const diffJsx = diffRaw.match(/```(?:jsx)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? diffRaw;

    return { removedKeys, diffJsx };
}

export async function runHandymanEdit(
    getProvider: () => ILLMProvider,
    systemPrompt: string,
    userMessage: string,
    buffer: JsxBuffer,
    callOptions?: ProviderCallOptions,
): Promise<HandymanResult>
{
    const provider = await getProvider().clone();

    const chunks: string[] = [];
    for await (const chunk of provider.complete([{ role: "user", content: userMessage }], systemPrompt, callOptions))
        chunks.push(chunk);

    const raw = chunks.join("");
    const { removedKeys, diffJsx } = parseResponse(raw);

    applyDiff(buffer, diffJsx, removedKeys);

    return { ok: true, assistantText: raw };
}
