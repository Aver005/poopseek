import { colors } from "@/cli/colors";

const FRAMES = ["|", "/", "-", "\\"];
const TICK_MS = 120;

export interface GenerationIndicator
{
    start: (label?: string) => void;
    stop: () => void;
    pause: () => void;
    resume: () => void;
    setTypingText: (text: string) => void;
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
    let typingText = "";

    const renderActive = (): void =>
    {
        const frame = FRAMES[frameIndex % FRAMES.length];
        frameIndex += 1;
        writer.write(`\r${colors.dim(`[gen] ${frame} ${activeLabel}`)}\x1b[K`);
    };

    const renderPaused = (): void =>
    {
        const suffix = typingText
            ? ` ${colors.dim("|")} ${colors.dim("[+]")} ${typingText}`
            : "";
        writer.write(`\r${colors.dim(`[gen] ○ ${activeLabel}`)}${suffix}\x1b[K`);
    };

    return {
        start: (label = "Генерация ответа..."): void =>
        {
            activeLabel = label;

            if (paused)
            {
                if (!displayed) writer.write("\n");
                renderPaused();
                displayed = true;
                return;
            }

            if (timer !== null) return;

            writer.write("\n");
            displayed = true;
            renderActive();
            timer = setInterval(renderActive, TICK_MS);
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
            if (displayed) renderPaused();
        },

        resume: (): void =>
        {
            if (!paused) return;
            paused = false;
            typingText = "";
            if (!displayed) return;
            renderActive();
            timer = setInterval(renderActive, TICK_MS);
        },

        setTypingText: (text: string): void =>
        {
            if (!paused || !displayed) return;
            typingText = text;
            renderPaused();
        },
    };
}
