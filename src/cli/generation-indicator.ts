import { colors } from "@/cli/colors";

const FRAMES = ["|", "/", "-", "\\"];
const TICK_MS = 120;

export interface GenerationIndicator
{
    start: (label?: string) => void;
    stop: () => void;
    pause: () => void;
    resume: () => void;
}

export function createGenerationIndicator(
    writer: { write: (value: string) => void },
): GenerationIndicator
{
    let timer: ReturnType<typeof setInterval> | null = null;
    let frameIndex = 0;
    let activeLabel = "Генерация ответа...";
    let paused = false;
    let displayed = false;

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

            if (paused)
            {
                if (!displayed) writer.write("\n");
                render();
                displayed = true;
                return;
            }

            if (timer !== null) return;

            writer.write("\n");
            displayed = true;
            render();
            timer = setInterval(render, TICK_MS);
        },

        stop: (): void =>
        {
            displayed = false;
            if (timer !== null)
            {
                clearInterval(timer);
                timer = null;
            }
            writer.write("\r\x1b[K");
        },

        pause: (): void =>
        {
            if (paused) return;
            paused = true;
            if (timer !== null)
            {
                clearInterval(timer);
                timer = null;
            }
        },

        resume: (): void =>
        {
            if (!paused) return;
            paused = false;
            if (!displayed) return;
            render();
            timer = setInterval(render, TICK_MS);
        },
    };
}
