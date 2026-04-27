import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 70,
                statements: 70,
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            $: path.resolve(__dirname, "./assets"),
            "#": path.resolve(__dirname, "./src/deepseek-client"),
        },
    },
});
