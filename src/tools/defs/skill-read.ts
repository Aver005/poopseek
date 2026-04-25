import type { ToolHandler } from "../types";

export const name = "skill.read";

export const handler: ToolHandler = async (args, context) =>
{
    const skillName = typeof args.name === "string" ? args.name.trim() : "";
    if (!skillName)
    {
        return {
            ok: false,
            output: 'Missing required argument "name"',
            error: 'Missing required argument "name"',
        };
    }

    if (!context.getSkillContent)
    {
        return { ok: false, output: "skill.read not available", error: "not available" };
    }

    const content = context.getSkillContent(skillName);
    if (content === null)
    {
        return {
            ok: false,
            output: `Skill "${skillName}" not found`,
            error: `Skill "${skillName}" not found`,
        };
    }

    return { ok: true, output: content };
};
