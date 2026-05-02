import { describe, expect, it } from "vitest";
import { formatPreparedBrief, normalizePreparedBrief } from "@/figma/preprocess";

describe("figma preprocess", () =>
{
    it("normalizes sparse preprocess output into a usable brief", () =>
    {
        const brief = normalizePreparedBrief(
            {
                rewrittenPrompt: "Собери более смелый food delivery home screen",
                platform: "mobile",
                mustHave: ["hero", "primary CTA"],
            },
            "сделай экран доставки еды",
        );

        expect(brief.rewrittenPrompt).toContain("food delivery");
        expect(brief.platform).toBe("mobile");
        expect(brief.mustHave).toEqual(["hero", "primary CTA"]);
        expect(brief.visualDirection.length).toBeGreaterThan(0);
        expect(brief.editStrategy).toBe("edit-existing");
    });

    it("formats brief for stage user messages", () =>
    {
        const text = formatPreparedBrief(normalizePreparedBrief(
            {
                rewrittenPrompt: "Улучши checkout",
                goal: "Сделать checkout чище и понятнее",
                avoid: ["gray mush"],
                successCriteria: ["clear CTA"],
            },
            "улучши checkout",
        ));

        expect(text).toContain("rewrittenPrompt");
        expect(text).toContain("avoid");
        expect(text).toContain("successCriteria");
    });
});
