import { stdout as output } from "node:process";
import type ContextManager from "@/agent/context-manager";
import { colors } from "@/cli/colors";
import { promptForToken, saveRuntimeConfig, type RuntimeConfig } from "@/cli/runtime-config";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import { DeepseekWebProvider } from "@/providers";
import type { ILLMProvider } from "@/providers";

export async function ensureValidToken(params: {
    initialToken: string;
    envToken: string | null | undefined;
    savedToken: string | null | undefined;
    runtimeConfigPath: string;
    baseConfig: RuntimeConfig;
}): Promise<string>
{
    const { initialToken, envToken, savedToken, runtimeConfigPath, baseConfig } = params;
    let token = initialToken;

    while (true)
    {
        const validation = await DeepseekClient.validateToken(token);

        if (validation.valid)
        {
            if (savedToken !== token && !envToken)
            {
                await saveRuntimeConfig(runtimeConfigPath, { ...baseConfig, token, provider: null });
            }
            return token;
        }

        if (envToken)
        {
            output.write(`Ошибка: DEEPSEEK_TOKEN из окружения недействителен (${validation.error ?? "неизвестная ошибка"})\n`);
            process.exit(1);
        }

        output.write(`Токен недействителен: ${validation.error ?? "неизвестная ошибка"}\n`);
        token = await promptForToken();
    }
}

export type AuthActionDeps = {
    runtimeConfigPath: string;
    contextManager: ContextManager;
    waitForInput: () => Promise<string>;
    writeOutput: (value: string) => void;
    startNewLocalSession: () => void;
    onReloggedIn: (provider: ILLMProvider) => void;
    getRuntimeConfig: () => import("@/cli/runtime-config").RuntimeConfig;
};

export function createAuthActions(deps: AuthActionDeps): {
    relogin: () => Promise<void>;
    logout: () => Promise<void>;
}
{
    const relogin = async (): Promise<void> =>
    {
        deps.writeOutput(`\n${colors.cyan("?")} Введите новый DEEPSEEK_TOKEN:\n`);

        while (true)
        {
            const rawToken = await deps.waitForInput();
            const trimmed = rawToken.trim();
            if (!trimmed) continue;

            deps.writeOutput(`${colors.dim("Проверяю токен...")}\n`);
            const validation = await DeepseekClient.validateToken(trimmed);

            if (validation.valid)
            {
                await saveRuntimeConfig(deps.runtimeConfigPath, { ...deps.getRuntimeConfig(), token: trimmed, provider: null });
                const newProvider = await DeepseekWebProvider.create(trimmed);
                deps.contextManager.markSessionReset();
                deps.startNewLocalSession();
                deps.onReloggedIn(newProvider);
                const who = validation.email ? `: ${validation.email}` : "";
                deps.writeOutput(`${colors.green("✓")} Авторизован${who}\n\n`);
                return;
            }

            deps.writeOutput(`${colors.red("✗")} Токен недействителен: ${validation.error ?? "неизвестная ошибка"}. Попробуйте ещё раз:\n`);
        }
    };

    const logout = async (): Promise<void> =>
    {
        await saveRuntimeConfig(deps.runtimeConfigPath, { ...deps.getRuntimeConfig(), token: null, provider: null });
        deps.writeOutput(`\n${colors.yellow("Токен сброшен.")} Перезапустите приложение.\n\n`);
        process.exit(0);
    };

    return { relogin, logout };
}
