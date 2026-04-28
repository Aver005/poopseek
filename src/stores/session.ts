export type LocalSession = { id: string; createdAt: string };

export type SessionStore = {
    getSession(): LocalSession;
    setSession(s: LocalSession): void;
    getSessionsDir(): string;
    getModelVariant(): string;
    setModelVariant(v: string): void;
};

export function createSessionStore(initial: {
    session: LocalSession;
    sessionsDir: string;
    modelVariant: string;
}): SessionStore
{
    let session = initial.session;
    let modelVariant = initial.modelVariant;
    return {
        getSession: () => session,
        setSession: (s) => { session = s; },
        getSessionsDir: () => initial.sessionsDir,
        getModelVariant: () => modelVariant,
        setModelVariant: (v) => { modelVariant = v; },
    };
}
