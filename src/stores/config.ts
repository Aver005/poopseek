import type { RuntimeConfig } from "@/cli/runtime-config";
import type { ProviderConfig } from "@/providers";

export type ConfigStore = {
    getRuntimeConfig(): RuntimeConfig;
    setRuntimeConfig(c: RuntimeConfig): void;
    getRuntimeConfigPath(): string;
    getUserName(): string | null;
    setUserName(n: string | null): void;
    getConfiguredProviders(): ProviderConfig[];
    setConfiguredProviders(ps: ProviderConfig[]): void;
};

export function createConfigStore(initial: {
    runtimeConfig: RuntimeConfig;
    runtimeConfigPath: string;
    configuredProviders: ProviderConfig[];
}): ConfigStore
{
    let runtimeConfig = initial.runtimeConfig;
    let configuredProviders = initial.configuredProviders;
    return {
        getRuntimeConfig: () => runtimeConfig,
        setRuntimeConfig: (c) => { runtimeConfig = c; },
        getRuntimeConfigPath: () => initial.runtimeConfigPath,
        getUserName: () => runtimeConfig.userName,
        setUserName: (n) => { runtimeConfig = { ...runtimeConfig, userName: n }; },
        getConfiguredProviders: () => configuredProviders,
        setConfiguredProviders: (ps) => { configuredProviders = ps; },
    };
}
