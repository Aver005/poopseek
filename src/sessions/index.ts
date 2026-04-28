import { loadStoredSession, listStoredSessions, deriveSessionTitle } from "@/cli/session-store";
import type ContextManager from "@/agent/context-manager";

export interface RemoteSessionImporter
{
    import(
        sessionId: string,
        signal: AbortSignal,
    ): Promise<{
        title: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        parentMessageId: number | null;
    } | null>;
    apply(sessionId: string, parentMessageId: number | null): void;
}

export interface SessionResolution
{
    type: "local" | "global";
    title: string;
    messageCount?: number;
    load: () => Promise<{ error?: string }>;
}

export type SessionResolverDeps = {
    sessionsDir: string;
    contextManager: ContextManager;
    getCurrentLocalSession: () => { id: string; createdAt: string };
    setCurrentLocalSession: (s: { id: string; createdAt: string }) => void;
    getModelVariant: () => string;
    setModelVariant: (v: string) => void;
    resetMainProvider: () => Promise<void>;
    saveCurrentLocalSession: () => Promise<void>;
    startNewLocalSession: () => void;
    activeInterruptControllerRef: { current: AbortController | null };
    getRemoteImporter?: () => RemoteSessionImporter | undefined;
};

export function createSessionResolver(
    deps: SessionResolverDeps,
): (id: string) => Promise<SessionResolution | null>
{
    return async (id) =>
    {
        const localSnapshot = await loadStoredSession(deps.sessionsDir, id);
        if (localSnapshot)
        {
            const title = deriveSessionTitle(localSnapshot.context);
            const messageCount = localSnapshot.context.messages.length;
            return {
                type: "local",
                title,
                messageCount,
                load: async () =>
                {
                    deps.setCurrentLocalSession({
                        id: localSnapshot.id,
                        createdAt: localSnapshot.createdAt,
                    });
                    deps.setModelVariant(localSnapshot.modelType);
                    deps.contextManager.restoreState(localSnapshot.context);
                    await deps.resetMainProvider();
                    await deps.saveCurrentLocalSession();
                    return {};
                },
            };
        }

        const remoteImporter = deps.getRemoteImporter?.();
        if (!remoteImporter) return null;

        const abortController = new AbortController();
        deps.activeInterruptControllerRef.current = abortController;
        try
        {
            const imported = await remoteImporter.import(id, abortController.signal);
            if (!imported) return null;

            return {
                type: "global",
                title: imported.title || id,
                messageCount: imported.messages.length,
                load: async () =>
                {
                    if (imported.messages.length === 0)
                    {
                        return { error: "история пуста или не содержит завершённых сообщений" };
                    }
                    deps.contextManager.restoreState(
                        { messages: imported.messages },
                        { includeLocalMemoryOnBootstrap: false },
                    );
                    remoteImporter.apply(id, imported.parentMessageId);
                    deps.startNewLocalSession();
                    await deps.saveCurrentLocalSession();
                    return {};
                },
            };
        }
        finally
        {
            deps.activeInterruptControllerRef.current = null;
        }
    };
}

export { listStoredSessions };
