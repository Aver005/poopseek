import fs from "node:fs";
import path from "node:path";
import { EncodingUtils } from "../utils/encoding";
import { MemoryUtils } from "../utils/memory";

interface WasmExports
{
    memory: WebAssembly.Memory;
    __wbindgen_add_to_stack_pointer: (offset: number) => number;
    __wbindgen_export_0: (length: number, align: number) => number;
    wasm_solve: (
        retptr: number,
        ptrChallenge: number,
        lenChallenge: number,
        ptrPrefix: number,
        lenPrefix: number,
        difficulty: number,
    ) => void;
}

export default class WasmService 
{
    private instance: WebAssembly.Instance | null = null;
    private addToStack: WasmExports["__wbindgen_add_to_stack_pointer"] | null =
        null;
    private alloc: WasmExports["__wbindgen_export_0"] | null = null;
    private wasmSolve: WasmExports["wasm_solve"] | null = null;

    async initialize(wasmPath: string): Promise<void> 
    {
        const finalPath = path.resolve(process.cwd(), wasmPath);
        if (!fs.existsSync(finalPath)) 
        {
            throw new Error(`WASM file not found: ${finalPath}`);
        }

        const wasmBytes = await fs.promises.readFile(finalPath);
        const wasmModule = await WebAssembly.compile(wasmBytes);
        const importObject = {
            env: {
                abort: (): never => 
                {
                    throw new Error("WASM aborted");
                },
            },
        };

        this.instance = await WebAssembly.instantiate(wasmModule, importObject);
        const exports = this.instance.exports as unknown as WasmExports;

        if (
            !exports.memory ||
            !exports.__wbindgen_add_to_stack_pointer ||
            !exports.__wbindgen_export_0 ||
            !exports.wasm_solve
        ) 
        {
            throw new Error("Missing WASM export functions");
        }

        this.addToStack = exports.__wbindgen_add_to_stack_pointer;
        this.alloc = exports.__wbindgen_export_0;
        this.wasmSolve = exports.wasm_solve;
    }

    private getExports(): WasmExports 
    {
        if (!this.instance) 
        {
            throw new Error("WASM not initialized. Call initialize() first.");
        }

        return this.instance.exports as unknown as WasmExports;
    }

    private writeMemory(offset: number, data: Uint8Array): void 
    {
        const view = MemoryUtils.createMemoryView(this.getExports().memory);
        MemoryUtils.writeToMemory(view, offset, data);
    }

    private readMemory(offset: number, size: number): Uint8Array 
    {
        const view = MemoryUtils.createMemoryView(this.getExports().memory);
        return MemoryUtils.readFromMemory(view, offset, size);
    }

    private encodeString(text: string): { ptr: number; length: number } 
    {
        if (!this.alloc) 
        {
            throw new Error("WASM allocator is not initialized");
        }

        const data = EncodingUtils.encodeUTF8(text);
        const length = data.length;
        const ptr = this.alloc(length, 1);
        this.writeMemory(ptr, data);
        return { ptr, length };
    }

    async solve(
        challengeStr: string,
        prefix: string,
        difficulty: string,
    ): Promise<number | null> 
    {
        if (!this.addToStack || !this.wasmSolve) 
        {
            throw new Error("WASM not initialized. Call initialize() first.");
        }

        let retptr: number | null = null;
        try 
        {
            retptr = this.addToStack(-16);
            const { ptr: ptrChallenge, length: lenChallenge } =
                this.encodeString(challengeStr);
            const { ptr: ptrPrefix, length: lenPrefix } =
                this.encodeString(prefix);

            this.wasmSolve(
                retptr,
                ptrChallenge,
                lenChallenge,
                ptrPrefix,
                lenPrefix,
                Number.parseFloat(difficulty),
            );

            const statusBytes = this.readMemory(retptr, 4);
            if (statusBytes.length !== 4) 
            {
                throw new Error("Failed to read status bytes");
            }

            const view = MemoryUtils.createMemoryView(this.getExports().memory);
            const status = MemoryUtils.readInt32(view, retptr);

            const valueBytes = this.readMemory(retptr + 8, 8);
            if (valueBytes.length !== 8) 
            {
                throw new Error("Failed to read result bytes");
            }

            const value = MemoryUtils.readFloat64(view, retptr + 8);
            if (status === 0) 
            {
                return null;
            }

            return Math.floor(value);
        }
        finally 
        {
            if (retptr !== null) 
            {
                this.addToStack(16);
            }
        }
    }
}
