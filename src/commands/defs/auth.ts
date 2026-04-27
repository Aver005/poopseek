import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";
import { createProvider, PROVIDER_IDS, type ILLMProvider, type ProviderConfig } from "@/providers";
import { buildConfig, PROVIDER_LABELS, type ProviderId } from "./provider";

function parseProviderSelection(input: string): ProviderId[]
{
    const nums = input
        .split(/[\s,]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= PROVIDER_IDS.length);
    return [...new Set(nums)].map((n) => PROVIDER_IDS[n - 1]!);
}

export function createAuthCommand(context: CommandsContext): Command
{
    return {
        name: "/auth",
        description: "Настроить провайдеры и имя пользователя",
        execute: async () =>
        {
            const { waitForInput, getUserName, getConfiguredProviders, saveUserConfig, setProvider, getCurrentProvider, getToken } = context;

            if (!waitForInput || !saveUserConfig)
            {
                writeLine("");
                writeLine("Команда /auth недоступна.");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("── Настройка аккаунта ──");
            writeLine("");

            // Step 1: Username
            const currentName = getUserName?.() ?? null;
            const nameHint = currentName ? ` (Enter = ${currentName})` : "";
            writeLine(`Как вас называть?${nameHint}`);
            const rawName = (await waitForInput()).trim();
            const userName = rawName.length > 0 ? rawName : currentName;

            // Step 2: Provider selection
            writeLine("");
            writeLine("Доступные провайдеры:");
            writeLine("");
            PROVIDER_IDS.forEach((id, i) =>
            {
                writeLine(`  ${i + 1}. ${id.padEnd(14)} ${PROVIDER_LABELS[id]}`);
            });
            writeLine("");

            const existing = getConfiguredProviders?.() ?? [];
            const defaultNums = existing.length > 0
                ? existing
                    .map((p) => PROVIDER_IDS.indexOf(p.id as ProviderId) + 1)
                    .filter((n) => n > 0)
                    .join(" ")
                : "1";

            writeLine(`Номера через пробел (0 = без провайдеров, Enter = ${defaultNums}):`);
            const selRaw = (await waitForInput()).trim();

            const selectedIds = selRaw === "0"
                ? []
                : parseProviderSelection(selRaw || defaultNums);

            // Step 3: Collect credentials
            const configuredProviders: ProviderConfig[] = [];
            let activeProvider: ILLMProvider | null = null;
            let activeConfig: ProviderConfig | null = null;

            for (const id of selectedIds)
            {
                writeLine("");
                writeLine(`── ${PROVIDER_LABELS[id]} ──`);
                const config = await buildConfig(id, waitForInput);
                if (!config) { writeLine("Пропущено."); continue; }
                configuredProviders.push(config);
            }

            // Create active provider from first config
            if (configuredProviders.length > 0)
            {
                const firstConfig = configuredProviders[0]!;
                try
                {
                    writeLine("");
                    writeLine("Подключение...");

                    if (firstConfig.id === "deepseek-web" && getCurrentProvider?.()?.info.id === "deepseek-web")
                    {
                        activeProvider = getCurrentProvider!();
                    }
                    else
                    {
                        activeProvider = await createProvider(firstConfig, getToken?.() ?? "");
                    }
                    activeConfig = firstConfig;
                }
                catch (error)
                {
                    const message = error instanceof Error ? error.message : String(error);
                    writeLine(`Ошибка подключения: ${message}`);
                }
            }

            // Save userName + configuredProviders
            await saveUserConfig({ userName, configuredProviders });

            // Switch active provider (also saves provider to config)
            if (activeProvider && activeConfig && setProvider)
            {
                await setProvider(activeProvider, activeConfig);
            }

            // Summary
            writeLine("");
            writeLine("─".repeat(42));
            writeLine("");
            if (configuredProviders.length > 0)
            {
                writeLine(`✓ Настроено провайдеров: ${configuredProviders.length}`);
                if (activeConfig)
                    writeLine(`  Активный: ${PROVIDER_LABELS[activeConfig.id as ProviderId] ?? activeConfig.id}`);
            }
            else
            {
                writeLine("! Провайдеры не настроены.");
            }
            if (userName) writeLine(`  Обращение: ${userName}`);
            writeLine("");

            return true;
        },
    };
}
