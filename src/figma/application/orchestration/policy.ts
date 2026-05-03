import type { FigmaEditIntent, FigmaTaskMode, LayoutConstraints, FigmaPlatform } from "./types";

export function inferTaskMode(hasPresentedResult: boolean): FigmaTaskMode
{
    return hasPresentedResult ? "revision" : "initial";
}

export function inferEditIntent(message: string, hasPresentedResult: boolean): FigmaEditIntent
{
    const normalized = message.toLowerCase();

    if (
        normalized.includes("новый экран")
        || normalized.includes("another screen")
        || normalized.includes("second screen")
        || normalized.includes("ещё экран")
        || normalized.includes("еще экран")
        || normalized.includes("отдельный экран")
    )
        return "new-screen";

    if (
        normalized.includes("вариант")
        || normalized.includes("альтернатив")
        || normalized.includes("alternate")
        || normalized.includes("alternative")
        || normalized.includes("fork")
        || normalized.includes("вторая версия")
        || normalized.includes("ещё версия")
        || normalized.includes("еще версия")
        || normalized.includes("концепт")
    )
        return "fork-variant";

    return hasPresentedResult ? "edit-existing" : "new-screen";
}

export function inferLayoutConstraints(
    message: string,
    previous?: LayoutConstraints,
): LayoutConstraints
{
    const normalized = message.toLowerCase();
    const platform: FigmaPlatform = /\b(desktop|десктоп|web|landing|dashboard)\b/.test(normalized)
        ? "desktop"
        : /\b(tablet|tablet-first|tablet app|планшет)\b/.test(normalized)
            ? "tablet"
            : previous?.platform ?? "mobile";

    if (platform === "desktop")
    {
        return {
            platform,
            viewportWidth: 1440,
            viewportHeight: 1024,
            contentWidthPolicy: "centered",
            maxContentWidth: 1200,
            horizontalPadding: 32,
        };
    }

    if (platform === "tablet")
    {
        return {
            platform,
            viewportWidth: 768,
            viewportHeight: 1024,
            contentWidthPolicy: "inset",
            maxContentWidth: 720,
            horizontalPadding: 24,
        };
    }

    return {
        platform: "mobile",
        viewportWidth: 390,
        viewportHeight: 844,
        contentWidthPolicy: "inset",
        maxContentWidth: 390,
        horizontalPadding: 24,
    };
}
