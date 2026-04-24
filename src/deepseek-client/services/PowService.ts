import { API_ENDPOINTS, WASM_CONFIG } from "../config/constants";
import { HeadersBuilder } from "../config/headers";
import type { PowChallenge } from "../types";
import { EncodingUtils } from "../utils/encoding";
import { getRecord } from "../utils/record";
import WasmService from "./WasmService";

function toFiniteNumber(value: unknown): number | null 
{
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") 
    {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function toStringValue(value: unknown): string | null 
{
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return null;
}

function extractChallenge(
    data: unknown,
    fallbackTargetPath: string,
): Omit<PowChallenge, "answer"> 
{
    const dataNode = getRecord(data, "data");
    const bizData = getRecord(dataNode, "biz_data");
    const challenge = getRecord(bizData, "challenge");

    const algorithm = toStringValue(challenge?.algorithm);
    const challengeToken = toStringValue(challenge?.challenge);
    const difficulty = toStringValue(challenge?.difficulty);
    const salt = toStringValue(challenge?.salt);
    const signature = toStringValue(challenge?.signature);
    const targetPath =
        toStringValue(challenge?.target_path) ?? fallbackTargetPath;
    const expireAtRaw = toFiniteNumber(challenge?.expire_at);

    if (
        !algorithm ||
        !challengeToken ||
        !difficulty ||
        !salt ||
        !signature ||
        expireAtRaw === null
    ) 
    {
        throw new Error("Invalid PoW challenge payload");
    }

    return {
        algorithm,
        challenge: challengeToken,
        difficulty,
        expire_at: expireAtRaw,
        salt,
        signature,
        target_path: targetPath,
    };
}

export default class PowService 
{
    private readonly wasmService: WasmService;

    constructor() 
    {
        this.wasmService = new WasmService();
    }

    async initialize(): Promise<void> 
    {
        await this.wasmService.initialize(WASM_CONFIG.DEFAULT_PATH);
    }

    async getPowResponse(token: string, targetPath: string): Promise<string> 
    {
        const headers = HeadersBuilder.getAuthHeaders(token);
        const payload = { target_path: targetPath };
        const response = await fetch(API_ENDPOINTS.CREATE_POW, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!response.ok) 
        {
            const errorData = await response.text();
            throw new Error(
                `Failed to get PoW challenge: ${response.status} ${errorData}`,
            );
        }

        const data = (await response.json()) as unknown;
        const challenge = extractChallenge(data, targetPath);

        const isSupportedAlgorithm = WASM_CONFIG.SUPPORTED_ALGORITHMS.some(
            (algorithm) => algorithm === challenge.algorithm,
        );
        if (!isSupportedAlgorithm) 
        {
            throw new Error(`Unsupported algorithm: ${challenge.algorithm}`);
        }

        const prefix = `${challenge.salt}_${challenge.expire_at}_`;
        const answer = await this.wasmService.solve(
            challenge.challenge,
            prefix,
            challenge.difficulty,
        );
        const powData: PowChallenge = {
            ...challenge,
            answer,
        };

        return EncodingUtils.encodeJSONToBase64(powData);
    }
}
