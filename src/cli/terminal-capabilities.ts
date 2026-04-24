export type ShellKind =
    | "powershell"
    | "cmd"
    | "bash"
    | "zsh"
    | "fish"
    | "wsl"
    | "unknown";

export type TerminalKind =
    | "windows-terminal"
    | "vscode"
    | "git-bash"
    | "mintty"
    | "conemu"
    | "xterm"
    | "unknown";

export type ColorSupport = "none" | "basic" | "truecolor";

export type TerminalCapabilities = {
    shell: ShellKind;
    terminal: TerminalKind;
    colorSupport: ColorSupport;
    emoji: boolean;
};

const EMOJI_REGEX = /[\p{Extended_Pictographic}\u200D\uFE0F]/gu;

function getEnvValue(name: string): string
{
    return process.env[name]?.toLowerCase().trim() ?? "";
}

function isColorDisabled(): boolean
{
    const noColor = getEnvValue("NO_COLOR");
    if (!noColor) return false;
    return noColor === "1" || noColor === "true" || noColor === "yes";
}

function detectShell(): ShellKind
{
    const explicitShell = getEnvValue("POOPSEEK_SHELL");
    const scriptShell = getEnvValue("npm_config_script_shell");
    const shell = getEnvValue("SHELL");
    const msystem = getEnvValue("MSYSTEM");
    const powerShellChannel = getEnvValue("POWERSHELL_DISTRIBUTION_CHANNEL");
    const powerShellPolicy = getEnvValue("PSExecutionPolicyPreference");
    const wslDistro = getEnvValue("WSL_DISTRO_NAME");
    const comSpec = getEnvValue("ComSpec");

    const candidates = [explicitShell, scriptShell, shell];
    for (const candidate of candidates)
    {
        if (!candidate) continue;
        if (candidate.includes("pwsh") || candidate.includes("powershell")) return "powershell";
        if (candidate.includes("bash")) return "bash";
        if (candidate.includes("zsh")) return "zsh";
        if (candidate.includes("fish")) return "fish";
        if (candidate.includes("cmd")) return "cmd";
    }

    if (wslDistro) return "wsl";
    if (msystem) return "bash";
    if (powerShellChannel || powerShellPolicy) return "powershell";
    if (comSpec.includes("cmd.exe")) return "cmd";
    return "unknown";
}

function detectTerminal(): TerminalKind
{
    const termProgram = getEnvValue("TERM_PROGRAM");
    const term = getEnvValue("TERM");
    const msystem = getEnvValue("MSYSTEM");
    const wtSession = getEnvValue("WT_SESSION");
    const conEmuPid = getEnvValue("ConEmuPID");

    if (wtSession) return "windows-terminal";
    if (termProgram.includes("vscode")) return "vscode";
    if (msystem) return "git-bash";
    if (term.includes("mintty")) return "mintty";
    if (conEmuPid) return "conemu";
    if (term.includes("xterm")) return "xterm";
    return "unknown";
}

function detectColorSupport(shell: ShellKind, terminal: TerminalKind): ColorSupport
{
    if (isColorDisabled()) return "none";

    const colorTerm = getEnvValue("COLORTERM");
    const term = getEnvValue("TERM");

    if (colorTerm.includes("truecolor") || colorTerm.includes("24bit")) return "truecolor";

    const truecolorTerminals: TerminalKind[] = ["windows-terminal", "vscode"];
    if (truecolorTerminals.includes(terminal)) return "truecolor";
    if (term.includes("truecolor")) return "truecolor";

    const reducedShells: ShellKind[] = ["cmd", "bash", "wsl", "unknown"];
    if (reducedShells.includes(shell) && process.platform === "win32") return "basic";

    return "truecolor";
}

function detectEmojiSupport(shell: ShellKind, terminal: TerminalKind): boolean
{
    if (process.platform !== "win32")
    {
        return true;
    }

    const weakEmojiShells: ShellKind[] = ["bash", "cmd", "wsl", "unknown"];
    if (weakEmojiShells.includes(shell)) return false;
    if (terminal === "git-bash" || terminal === "mintty") return false;
    return true;
}

let cachedCapabilities: TerminalCapabilities | null = null;

export function getTerminalCapabilities(): TerminalCapabilities
{
    if (cachedCapabilities !== null) return cachedCapabilities;

    const shell = detectShell();
    const terminal = detectTerminal();

    cachedCapabilities = {
        shell,
        terminal,
        colorSupport: detectColorSupport(shell, terminal),
        emoji: detectEmojiSupport(shell, terminal),
    };

    return cachedCapabilities;
}

export function adaptTextToTerminal(text: string): string
{
    if (getTerminalCapabilities().emoji) return text;
    return text
        .replace(EMOJI_REGEX, "")
        .replace(/\s{2,}/g, " ")
        .trimEnd();
}
