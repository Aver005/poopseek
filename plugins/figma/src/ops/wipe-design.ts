import type { OpHandler } from "./types";
import {
    componentRegistry,
    themeCollectionRef,
    textStyleCache,
    collectionCache,
    colorVariableCache,
    numberVariableCache,
} from "../cache";
import { dlog, derr } from "../debug";

const UI_KIT_PAGE_NAME = "🧩 UI Kit";

// Typography token keys we generate via ensure_text_styles. The set is
// open (designer can invent variants), so the regex is intentionally
// permissive — we own ANY style whose name matches a single-segment
// design-system slug. Refined in two ways: (1) it's a strict slug (no
// slashes / namespaces), (2) descriptions written by Figma users are
// usually multi-word.
const OWNED_TEXT_STYLE_RE = /^[a-z][a-z0-9-]{0,32}$/;

export const handler: OpHandler = {
    type: "wipe_design",
    async execute(_op, nodeMap): Promise<number>
    {
        // Local caches — drop all in-memory bindings first so subsequent
        // ops in the SAME batch (if any) re-create from scratch.
        nodeMap.clear();
        componentRegistry.clear();
        textStyleCache.clear();
        collectionCache.clear();
        colorVariableCache.clear();
        numberVariableCache.clear();

        await figma.loadAllPagesAsync();

        // 1. Delete every top-level node on the current page (frames, etc.)
        const topLevel = [...figma.currentPage.children];
        let frameCount = 0;
        for (const node of topLevel)
        {
            try { node.remove(); frameCount++; }
            catch (err) { derr("wipe_design", `failed to remove ${node.type}#${node.id}: ${String(err)}`); }
        }

        // 2. Drop our variable collection ("PoopSeek Theme" by default).
        let varCount = 0;
        try
        {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            for (const c of collections)
            {
                if (c.name === themeCollectionRef.collection)
                {
                    c.remove();
                    varCount++;
                }
            }
        }
        catch (err) { derr("wipe_design", `vars cleanup failed: ${String(err)}`); }

        // 3. Drop our text styles. We don't tag styles when creating them
        //    (see ensure_text_styles), so use a name-shape heuristic to
        //    avoid wiping unrelated user styles. Anything matching a
        //    single-token slug like "h1", "body", "button" is fair game.
        let styleCount = 0;
        try
        {
            const styles = await figma.getLocalTextStylesAsync();
            for (const s of styles)
            {
                if (OWNED_TEXT_STYLE_RE.test(s.name))
                {
                    s.remove();
                    styleCount++;
                }
            }
        }
        catch (err) { derr("wipe_design", `styles cleanup failed: ${String(err)}`); }

        // 4. Remove the dedicated UI Kit page.
        try
        {
            const uiKit = figma.root.children.find(
                (p) => p.type === "PAGE" && p.name === UI_KIT_PAGE_NAME,
            );
            if (uiKit && uiKit !== figma.currentPage)
            {
                uiKit.remove();
            }
            else if (uiKit === figma.currentPage)
            {
                derr("wipe_design", "UI Kit is the current page — skipping page removal");
            }
        }
        catch (err) { derr("wipe_design", `UI Kit page cleanup failed: ${String(err)}`); }

        dlog(
            "wipe_design",
            `cleaned: frames=${frameCount}, vars=${varCount}, styles=${styleCount}`,
        );
        return 1;
    },
};
