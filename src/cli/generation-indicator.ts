import { colors } from "@/cli/colors";

const FRAMES = ["|", "/", "-", "\\"];
const TICK_MS = 120;

export interface GenerationIndicator
{
    start: (label?: string) => void;
    stop: () => void;
}

export function createGenerationIndicator(
    writer: { write: (value: string) => void },
): GenerationIndicator
{
    let timer: ReturnType<typeof setInterval> | null = null;
    let frameIndex = 0;
    let activeLabel = "Генерация ответа...";

    const render = (): void =>
    {
        const frame = FRAMES[frameIndex % FRAMES.length];
        frameIndex += 1;
        writer.write(`\r${colors.dim(`[gen] ${frame} ${activeLabel}`)}`);
    };

    return {
        start: (label = "Генерация ответа..."): void =>
        {
            activeLabel = label;
            if (timer !== null) return;
            writer.write("\n");
            render();
            timer = setInterval(render, TICK_MS);
        },
        stop: (): void =>
        {
            if (timer === null) return;
            clearInterval(timer);
            timer = null;
            writer.write("\r\x1b[K");
        },
    };
}
