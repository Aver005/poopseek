import type { ILLMProvider } from "@/providers";
import type { ChatImage } from "@/providers/types";
import type { ComponentDefinition } from "@/figma/engine/theme/theme-state";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { validateJsxTree, formatJsxValidationErrors } from "@/figma/engine/jsx/jsx-validator";

type Message = { role: "user" | "assistant"; content: string };

export interface UikitBuilderSuccess
{
    ok: true;
    jsx: string;
    /** Component names successfully declared in the JSX (PascalCase, no
     *  variants suffix). Used by the screen builder to gate `<Instance>`
     *  usage — only emit Instance for names that landed here. */
    registered: string[];
}

export interface UikitBuilderFailure
{
    ok: false;
    error: string;
}

export type UikitBuilderResult = UikitBuilderSuccess | UikitBuilderFailure;

function extractJsx(text: string): string
{
    const fences = [...text.matchAll(/```(?:jsx|tsx)?\s*([\s\S]*?)```/g)];
    if (fences.length > 0) return fences[fences.length - 1]![1]!.trim();
    return text.trim();
}

/** Walk the parsed JSX tree and return the set of component names this
 *  uikit will register. Sources: `<ComponentSet name=>` and bare-top-level
 *  `<Component name=>`. Variant attrs on inner `<Component>` are ignored
 *  here — registry key is the bare name. */
function collectRegisteredNames(nodes: ReturnType<typeof parseJsx>): string[]
{
    const out = new Set<string>();
    for (const n of nodes)
    {
        if (n.type === "ComponentSet")
        {
            const name = typeof n.props.name === "string" ? n.props.name : null;
            if (name) out.add(name);
        }
        else if (n.type === "Component")
        {
            const name = typeof n.props.name === "string" ? n.props.name : null;
            if (name) out.add(name);
        }
    }
    return [...out];
}

// DESIGN.md vocabulary → JSX prop names. Translated server-side so the
// uikit-builder LLM never has to do this remap (otherwise it copy-pastes
// "rounded" / "backgroundColor" verbatim → validator rejects).
const VOCAB_REMAP: Record<string, string> = {
    backgroundColor: "fill",
    background: "fill",
    bg: "fill",
    textColor: "fill",
    color: "fill",
    rounded: "radius",
    cornerRadius: "radius",
    paddingX: "padX",
    paddingY: "padY",
    paddingLeft: "padLeft",
    paddingRight: "padRight",
    paddingTop: "padTop",
    paddingBottom: "padBottom",
    direction: "flow",
};

function remapKeys(bag: Record<string, string | number> | undefined): Record<string, string | number> | undefined
{
    if (!bag) return bag;
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(bag))
        out[VOCAB_REMAP[k] ?? k] = v;
    return out;
}

function buildComponentsJson(components: ComponentDefinition[]): string
{
    return JSON.stringify(
        components.map((c) => ({
            name: c.name,
            type: c.semanticType ?? "frame",
            layout: remapKeys(c.layout) ?? {},
            variants: c.variants ?? null,
            overrides: c.overrides
                ? Object.fromEntries(
                    Object.entries(c.overrides).map(([k, v]) => [k, remapKeys(v) ?? {}]),
                )
                : null,
            slots: c.slots ?? null,
            // Keep `props` as-is (it's the legacy `as=` bundle, separate vocab).
            props: c.props,
        })),
        null,
        2,
    );
}

export async function runUikitBuilder(
    getProvider: () => ILLMProvider,
    promptContent: string,
    components: ComponentDefinition[],
    tokensTable: string,
    designDoc: string,
    maxRetries = 3,
    images?: ChatImage[],
): Promise<UikitBuilderResult>
{
    console.log(`[uikit] input: ${components.length} component(s) — ${components.map((c) => c.name).join(", ") || "(none)"}`);

    if (components.length === 0)
    {
        console.log(`[uikit] skipping — designer returned 0 components`);
        return { ok: true, jsx: "", registered: [] };
    }

    const prompt = promptContent
        .replace("{{COMPONENTS_JSON}}", buildComponentsJson(components))
        .replace("{{TOKENS_TABLE}}", tokensTable || "(no tokens)")
        .replace("{{DESIGN_DOC}}", designDoc || "(no DESIGN.md prose)");

    const root = getProvider();
    const provider = images?.length && root.withImages
        ? await root.withImages(images)
        : await root.clone();

    const messages: Message[] = [{ role: "user", content: prompt }];
    let lastError = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const t0 = Date.now();
        try
        {
            const chunks: string[] = [];
            for await (const chunk of provider.complete(messages, ""))
                chunks.push(chunk);

            const raw = chunks.join("");
            const jsx = extractJsx(raw);
            console.log(`[uikit] attempt ${attempt}: response in ${Date.now() - t0}ms, raw=${raw.length} chars, jsx=${jsx.length} chars`);

            if (!jsx.includes("<") || !jsx.includes(">"))
            {
                lastError = "No JSX in response";
                console.warn(`[uikit] attempt ${attempt}: no JSX in response. Raw[:300]=${raw.slice(0, 300)}`);
                if (attempt < maxRetries)
                {
                    messages.push({ role: "assistant", content: raw });
                    messages.push({ role: "user", content: "Output only the JSX inside one ```jsx block." });
                }
                continue;
            }

            const parsedNodes = parseJsx(jsx);
            const errors = validateJsxTree(parsedNodes);

            // Soft-validate roots: every top-level node should be Component or ComponentSet.
            const badRoots = parsedNodes
                .filter((n) => n.type !== "Component" && n.type !== "ComponentSet")
                .map((n) => n.type);

            if (errors.length === 0 && badRoots.length === 0)
            {
                const registered = collectRegisteredNames(parsedNodes);
                console.log(`[uikit] ✓ ok — registered: ${registered.join(", ") || "(none)"}`);
                return { ok: true, jsx, registered };
            }

            lastError = badRoots.length > 0
                ? `Top-level nodes must be <Component> or <ComponentSet>. Got: [${badRoots.join(", ")}]`
                : formatJsxValidationErrors(errors);
            console.warn(`[uikit] attempt ${attempt}: validation failed — ${lastError.slice(0, 200)}`);

            if (attempt < maxRetries)
            {
                messages.push({ role: "assistant", content: raw });
                messages.push({
                    role: "user",
                    content: [
                        "JSX validation failed. Fix and re-output ONE ```jsx block.",
                        "",
                        lastError,
                        "",
                        "Common mistakes to check:",
                        "- `<Frame>` uses `radius=` (NOT `rounded=`, NOT `cornerRadius=`).",
                        "- `<Frame>` uses `fill=` for background colour (NOT `backgroundColor=`, NOT `background=`).",
                        "- Direction is `flow=\"row\"` / `flow=\"column\"` (NOT `direction=`).",
                        "- Padding axes are `padX=` / `padY=` (NOT `paddingX=` / `paddingY=`).",
                    ].join("\n"),
                });
            }
        }
        catch (err)
        {
            lastError = err instanceof Error ? err.message : String(err);
            console.error(`[uikit] attempt ${attempt} threw: ${lastError}`);
        }
    }

    console.error(`[uikit] ✗ failed after ${maxRetries} attempts. Last: ${lastError.slice(0, 200)}`);
    return {
        ok: false,
        error: `UI Kit builder failed after ${maxRetries} attempts. Last error:\n${lastError.slice(0, 400)}`,
    };
}
