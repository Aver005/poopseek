import { stdout as output } from "node:process";
import { colors } from "@/cli/colors";
import { adaptTextToTerminal } from "@/cli/terminal-capabilities";
import type { ILLMProvider } from "@/providers";
import type { ThemeName } from "@/cli/colors";
import type { ColorSupport, TerminalCapabilities } from "@/cli/terminal-capabilities";

type ColorMode = {
    enabled: boolean;
    theme: ThemeName;
    support: ColorSupport;
};

export function printWelcome(
    appVersion: string,
    provider: ILLMProvider,
    colorMode: ColorMode,
    caps: TerminalCapabilities,
): void
{
    output.write(`\n${colors.green(adaptTextToTerminal("PoopSeek CLI 💩"))} | v${appVersion}\n\n`);
    output.write(`${colors.yellow("/help")} для списка команд\n`);
    output.write(`${colors.yellow("/tools")} для списка инструментов\n\n`);
    output.write(`Провайдер: ${colors.magenta(provider.info.label)}\n`);
    output.write(`Цвета ${colorMode.enabled ? colors.green("включены") : colors.red("отключены")}\n`);
    output.write(`Профиль терминала: ${colors.cyan(`${caps.shell}/${caps.terminal}`)}\n`);
    output.write(`Рендер: ${colors.cyan(colorMode.support)} | emoji ${caps.emoji ? colors.green("on") : colors.red("off")}\n`);
    output.write(`Тема: ${colors.cyan(colorMode.theme)}\n\n`);
    output.write(`${colors.dim("Многострочный ввод: ") + colors.blue("Shift+Enter") + colors.dim(" или ") + colors.blue("\\n") + colors.dim(" в тексте")}\n`);
    output.write(`${colors.dim("Файлы: ") + colors.blue("@path") + colors.dim(" и ") + colors.blue("Tab") + colors.dim(" для автокомплита")}\n`);
    output.write(`${colors.dim("Очередь: ввод во время генерации добавляется в очередь")}\n\n`);
}
