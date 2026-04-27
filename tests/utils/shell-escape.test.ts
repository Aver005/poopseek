import { describe, it, expect } from "vitest";
import { escapeShellArg, buildSafeCommand } from "@/utils/shell-escape";

describe("escapeShellArg (bash)", () => {
    it("wraps plain string in single quotes", () => {
        expect(escapeShellArg("hello", "linux")).toBe("'hello'");
    });

    it("escapes single quotes", () => {
        expect(escapeShellArg("it's alive", "linux")).toBe("'it'\\''s alive'");
    });

    it("escapes command injection attempt with semicolon", () => {
        const result = escapeShellArg("; rm -rf /", "linux");
        expect(result).toBe("'; rm -rf /'");
        // Should be treated as literal string, not executable
        expect(result).not.toContain("rm -rf /\"");
    });

    it("handles strings with double quotes", () => {
        expect(escapeShellArg('say "hello"', "linux")).toBe("'say \"hello\"'");
    });

    it("handles dollar signs (no variable expansion)", () => {
        expect(escapeShellArg("$HOME", "linux")).toBe("'$HOME'");
    });

    it("handles backticks (no command substitution)", () => {
        expect(escapeShellArg("`id`", "linux")).toBe("'`id`'");
    });

    it("handles empty string", () => {
        expect(escapeShellArg("", "linux")).toBe("''");
    });

    it("handles newlines", () => {
        expect(escapeShellArg("line1\nline2", "linux")).toBe("'line1\nline2'");
    });
});

describe("escapeShellArg (PowerShell)", () => {
    it("wraps plain string in single quotes", () => {
        expect(escapeShellArg("hello", "win32")).toBe("'hello'");
    });

    it("doubles single quotes for escaping", () => {
        expect(escapeShellArg("it's", "win32")).toBe("'it''s'");
    });

    it("escapes command injection attempt", () => {
        const result = escapeShellArg("; Remove-Item -Recurse /", "win32");
        expect(result).toBe("'; Remove-Item -Recurse /'");
    });

    it("handles backtick (PowerShell escape char)", () => {
        expect(escapeShellArg("hello`world", "win32")).toBe("'hello`world'");
    });

    it("handles empty string", () => {
        expect(escapeShellArg("", "win32")).toBe("''");
    });
});

describe("buildSafeCommand", () => {
    it("joins escaped parts", () => {
        expect(buildSafeCommand(["git", "commit", "-m", "my message"], "linux")).toBe(
            "'git' 'commit' '-m' 'my message'",
        );
    });

    it("escapes injection in any argument", () => {
        const result = buildSafeCommand(["echo", "; evil"], "linux");
        expect(result).toBe("'echo' '; evil'");
    });
});
