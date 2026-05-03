export type AgentScope = "chat" | "figma";

export class ScopeManager
{
    private _scope: AgentScope = "chat";
    private _jamId: string | null = null;

    get scope(): AgentScope { return this._scope; }
    get jamId(): string | null { return this._jamId; }

    isFigma(): boolean { return this._scope === "figma"; }

    enter(jamId: string): void
    {
        this._scope = "figma";
        this._jamId = jamId;
    }

    exit(): void
    {
        this._scope = "chat";
        this._jamId = null;
    }
}
