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

    it("removes desktop-width hints when runtime layout is mobile", () =>
    {
        const brief = normalizePreparedBrief(
            {
                rewrittenPrompt: "Сайт в стиле OpenAI",
                platform: "desktop",
                layoutStrategy: "Centered landing page with width limited to 1200-1440px and large desktop sections.",
                avoid: ["loud gradients"],
            },
            "сайт в стиле OpenAI",
            {
                platform: "mobile",
                viewportWidth: 390,
                viewportHeight: 844,
                contentWidthPolicy: "inset",
                maxContentWidth: 390,
                horizontalPadding: 24,
            },
        );

        expect(brief.platform).toBe("mobile");
        expect(brief.layoutStrategy).toContain("Mobile-first single-column layout");
        expect(brief.layoutStrategy).toContain("390x844");
        expect(brief.avoid).toContain("Desktop-width layouts and 1200px+ content assumptions");
    });
});
