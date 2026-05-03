import type { FigmaStage, FigmaTaskMode, StageConfig } from "./types";

export function getStageConfig(stage: FigmaStage, mode: FigmaTaskMode): StageConfig
{
    if (stage === "tokens")
    {
        return {
            stage,
            allowedTools: ["figma.tokens", "figma.tokens.get", "figma.tokens.list"],
            requiredTools: ["figma.tokens"],
        };
    }

    if (stage === "primitives")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
            ],
            requiredTools: ["figma.primitives.plan", "figma.primitives.jsx"],
        };
    }

    if (stage === "primitives-plan")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
            ],
            requiredTools: ["figma.primitives.plan"],
        };
    }

    if (stage === "primitive-jsx")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
            ],
            requiredTools: ["figma.primitives.jsx"],
        };
    }

    if (stage === "compose")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
                "figma.compose.meta",
                "figma.compose.meta.get",
                "figma.compose.meta.list",
                "figma.compose.jsx",
                "figma.compose.jsx.get",
                "figma.compose.jsx.list",
                "figma.compile",
                "figma.compile.get",
                "figma.compile.list",
                "figma.compile.jsx",
            ],
            requiredTools: ["figma.compose.meta", "figma.compose.jsx", "figma.compile"],
        };
    }

    if (stage === "repair")
    {
        return {
            stage,
            allowedTools: [
                "figma.compose.meta.get",
                "figma.compose.meta.list",
                "figma.compose.jsx",
                "figma.compose.jsx.get",
                "figma.compile",
                "figma.compile.get",
                "figma.compile.list",
                "figma.compile.jsx",
            ],
            requiredTools: ["figma.compile"],
        };
    }

    if (stage === "revision")
    {
        return {
            stage,
            allowedTools: mode === "revision"
                ? [
                    "figma.tokens",
                    "figma.tokens.get",
                    "figma.tokens.list",
                    "figma.primitives.plan",
                    "figma.primitives.plan.get",
                    "figma.primitives.plan.list",
                    "figma.primitives.jsx",
                    "figma.primitives.jsx.get",
                    "figma.primitives.jsx.list",
                    "figma.compose.meta",
                    "figma.compose.meta.get",
                    "figma.compose.meta.list",
                    "figma.compose.jsx",
                    "figma.compose.jsx.get",
                    "figma.compose.jsx.list",
                    "figma.compile",
                    "figma.compile.get",
                    "figma.compile.list",
                    "figma.compile.jsx",
                ]
                : [],
            requiredTools: ["figma.compile"],
        };
    }

    return {
        stage: "idle",
        allowedTools: [],
        requiredTools: [],
    };
}

export function summarizeStageSuccess(stage: FigmaStage): string
{
    if (stage === "tokens") return "Тема и токены подготовлены.";
    if (stage === "primitives") return "Primitive library подготовлена.";
    if (stage === "primitives-plan") return "Primitive plan подготовлен.";
    if (stage === "primitive-jsx") return "Primitive JSX подготовлен.";
    if (stage === "compose") return "Экран собран и скомпилирован.";
    if (stage === "repair") return "Ошибки исправлены и компиляция завершена.";
    if (stage === "revision") return "Доработки применены.";
    return "Этап завершён.";
}
