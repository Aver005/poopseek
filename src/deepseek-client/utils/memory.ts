export class MemoryUtils 
{
    static writeToMemory(
        view: DataView,
        offset: number,
        data: Uint8Array,
    ): void 
{
        for (const [index, byte] of data.entries()) 
{
            view.setUint8(offset + index, byte);
        }
    }

    static readFromMemory(
        view: DataView,
        offset: number,
        size: number,
    ): Uint8Array 
{
        const bytes = new Uint8Array(size);
        for (let index = 0; index < size; index += 1) 
{
            bytes[index] = view.getUint8(offset + index);
        }
        return bytes;
    }

    static readInt32(
        view: DataView,
        offset: number,
        littleEndian = true,
    ): number 
{
        return view.getInt32(offset, littleEndian);
    }

    static readFloat64(
        view: DataView,
        offset: number,
        littleEndian = true,
    ): number 
{
        return view.getFloat64(offset, littleEndian);
    }

    static createMemoryView(memory: WebAssembly.Memory): DataView 
{
        return new DataView(memory.buffer);
    }
}
