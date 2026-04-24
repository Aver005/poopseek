export interface VariableContext
{
    workspaceRoot: string;
}

export type VariableResolver = (context: VariableContext) => string;

export interface VariableModule
{
    key: string;
    resolve: VariableResolver;
}

export interface VariableProcessor
{
    process: (input: string) => string;
}
