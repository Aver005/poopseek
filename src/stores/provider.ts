import type { ILLMProvider } from "@/providers";

export type ProviderStore = {
    getProvider(): ILLMProvider;
    setProvider(p: ILLMProvider): void;
    getToken(): string;
    setToken(t: string): void;
};

export function createProviderStore(initial: {
    provider: ILLMProvider;
    token: string;
}): ProviderStore
{
    let provider = initial.provider;
    let token = initial.token;
    return {
        getProvider: () => provider,
        setProvider: (p) => { provider = p; },
        getToken: () => token,
        setToken: (t) => { token = t; },
    };
}
