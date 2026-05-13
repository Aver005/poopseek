import type { FigmaSnapshotRequest } from "@/figma/api/contracts";
import type { FigmaSnapshotNode, FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import type { ThemeToken, TypographyValue } from "@/figma/engine/theme/theme-state";
import { replaceActiveTheme } from "@/figma/engine/theme/theme-state";
import { loadHandymanHistory } from "@/figma/application/persistence/session-store";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

function hasFrameNodes(nodes: FigmaSnapshotNode[]): boolean
{
    for (const node of nodes)
    {
        if (node.type === "FRAME") return true;
        if (node.children && hasFrameNodes(node.children)) return true;
    }
    return false;
}

/**
 * Translate the snapshot's token payload into ThemeTokens and push it into
 * the server's in-memory active theme. Figma is the source of truth — the
 * server's theme state used to drift after restarts; this keeps them in
 * sync on every snapshot. Missing/empty tokens leaves the active theme
 * untouched so we don't clobber a freshly-set theme from `create` with an
 * empty snapshot from a still-loading plugin.
 */
function syncThemeFromSnapshot(snapshot: FigmaPluginSnapshot): void
{
    const tokens = snapshot.tokens;
    const textStyles = snapshot.textStyles;
    if ((!tokens || tokens.length === 0) && (!textStyles || textStyles.length === 0))
        return;

    const themeTokens: ThemeToken[] = [];
    for (const t of tokens ?? [])
        themeTokens.push({ kind: t.kind, key: t.key, value: t.value });

    for (const s of textStyles ?? [])
    {
        const v: TypographyValue = {};
        if (s.fontFamily)            v.fontFamily    = s.fontFamily;
        if (s.fontSize !== undefined)      v.fontSize      = s.fontSize;
        if (s.fontWeight)            v.fontWeight    = s.fontWeight;
        if (s.lineHeight !== undefined)    v.lineHeight    = s.lineHeight;
        if (s.letterSpacing !== undefined) v.letterSpacing = s.letterSpacing;
        themeTokens.push({ kind: "typography", key: s.key, value: v });
    }

    replaceActiveTheme({ tokens: themeTokens, name: snapshot.documentName });
    console.log(`[snapshot] theme synced from Figma: ${tokens?.length ?? 0} tokens + ${textStyles?.length ?? 0} text styles`);
}

export async function handlePushSnapshot(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: FigmaSnapshotRequest;
    try
    {
        body = await req.json() as FigmaSnapshotRequest;
    }
    catch
    {
        return invalidJson(context.getCorsHeaders);
    }

    if (!body.snapshot || !Array.isArray(body.snapshot.tree))
        return jsonWithCors({ error: "snapshot is required" }, { status: 400 }, context.getCorsHeaders);

    const session = context.getOrCreateSession(body.sessionId);

    session.lastActivityAt = Date.now();
    session.lastSnapshot = body.snapshot;
    session.mode = hasFrameNodes(body.snapshot.tree) ? "edit" : "create";

    if (body.snapshot.jsx)
        session.lastJsx = body.snapshot.jsx;

    if (body.syncTheme)
        syncThemeFromSnapshot(body.snapshot);

    const documentName = body.snapshot.documentName ?? "";
    if (documentName && documentName !== session.documentName)
    {
        session.documentName = documentName;
        session.historyLoaded = false;
    }

    if (!session.historyLoaded && session.documentName)
    {
        session.historyLoaded = true;
        const saved = await loadHandymanHistory(session.documentName);
        if (saved)
        {
            const handymanCtx = session.roleSessions.designer.contextManager;
            handymanCtx.restoreState(saved);
        }
    }

    return jsonWithCors({ ok: true, sessionId: session.id }, undefined, context.getCorsHeaders);
}
