import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import type { VariableProcessor } from "@/variables";
import type { VisionConfig } from "@/figma/application/services/vision-client";

export interface FigmaServerDeps
{
    getProvider: () => ILLMProvider;
    basePrompt: string;
    toolsPrompt: string;
    figmaPrompt: string;
    variableProcessor: VariableProcessor;
    getCallOptions?: () => ProviderCallOptions;
    getRequestDelay?: () => number;
    getWebToolsDoc?: () => string;
    getAvailableSkillsHint?: () => string;
    getSkillContent?: (name: string) => string | null;
    getVisionConfig?: () => VisionConfig | null;
}
