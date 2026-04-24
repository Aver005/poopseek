import { filesVariable } from "./files";
import { folderVariable } from "./folder";
import {
    isGitAvailableVariable,
    isGitAviabledVariable,
} from "./is-git-aviabled";
import type {
    VariableContext,
    VariableModule,
    VariableProcessor,
    VariableResolver,
} from "./types";
import { userVariable } from "./user";

const VARIABLE_MODULES: VariableModule[] = [
    folderVariable,
    userVariable,
    isGitAviabledVariable,
    isGitAvailableVariable,
    filesVariable,
];

function buildResolverMap(modules: VariableModule[]): Record<string, VariableResolver>
{
    const resolverMap: Record<string, VariableResolver> = {};

    for (const module of modules)
    {
        resolverMap[module.key] = module.resolve;
    }

    return resolverMap;
}

export function createVariableProcessor(context: VariableContext): VariableProcessor
{
    const resolvers = buildResolverMap(VARIABLE_MODULES);

    return {
        process: (input: string): string =>
        {
            if (!input.includes("{{")) return input;

            return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, keyRaw) =>
            {
                const key = String(keyRaw);
                const resolver = resolvers[key];
                if (!resolver) return full;

                try
                {
                    return resolver(context);
                }
                catch
                {
                    return full;
                }
            });
        },
    };
}

export type { VariableContext, VariableModule, VariableProcessor };
