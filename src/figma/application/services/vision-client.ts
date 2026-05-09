import type { ChatImage } from "@/figma/domain/image-analysis";

export interface VisionConfig
{
    apiKey: string;
    model: string;
}

export interface VisionMessage
{
    role: "user" | "assistant";
    content: VisionContentBlock[];
}

export type VisionContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export async function callVision(
    config: VisionConfig,
    system: string,
    images: ChatImage[],
    userText: string,
): Promise<string>
{
    const content: VisionContentBlock[] = images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
    }));
    content.push({ type: "text", text: userText });

    const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content }],
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok)
    {
        const err = await response.text().catch(() => response.statusText);
        throw new Error(`Vision API error ${response.status}: ${err}`);
    }

    const data = await response.json() as { content: { type: string; text: string }[] };
    return data.content.find((b) => b.type === "text")?.text ?? "";
}
