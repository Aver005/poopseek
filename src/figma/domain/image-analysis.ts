export interface ChatImage
{
    data: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageAnalysis
{
    semanticDescription: string;
    designStyle: string;
    colorPalette: { name: string; hex: string }[];
    typography: { role: string; description: string }[];
    components: string[];
    layout: string;
    referenceIntent: "redesign" | "reference" | "inspect";
    suggestedActions: string[];
}
