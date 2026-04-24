export class EncodingUtils 
{
    static encodeUTF8(text: string): Uint8Array 
{
        return new TextEncoder().encode(text);
    }

    static decodeUTF8(bytes: Uint8Array): string 
{
        return new TextDecoder().decode(bytes);
    }

    static encodeBase64(data: string): string 
{
        return Buffer.from(data, "utf8").toString("base64");
    }

    static decodeBase64(base64: string): string 
{
        return Buffer.from(base64, "base64").toString("utf8");
    }

    static encodeJSONToBase64<T extends object>(data: T): string 
{
        const jsonString = JSON.stringify(data);
        return EncodingUtils.encodeBase64(jsonString);
    }

    static decodeBase64ToJSON<T>(base64: string): T 
{
        const jsonString = EncodingUtils.decodeBase64(base64);
        return JSON.parse(jsonString) as T;
    }

    static stringToBytes(
        text: string,
        encoding: "utf8" | "utf-8" | "base64" = "utf8",
    ): Uint8Array 
{
        if (encoding === "base64") 
{
            const decoded = EncodingUtils.decodeBase64(text);
            return EncodingUtils.encodeUTF8(decoded);
        }

        return EncodingUtils.encodeUTF8(text);
    }
}
