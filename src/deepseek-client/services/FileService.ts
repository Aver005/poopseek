import { createHash } from "node:crypto";
import { API_ENDPOINTS, FILE_CONFIG } from "../config/constants";
import { HeadersBuilder } from "../config/headers";
import type { DeepseekFileStatus } from "../types";
import { getRecord, getString, isRecord } from "../utils/record";
import FileCacheService from "./FileCacheService";
import type PowService from "./PowService";

export default class FileService
{
    private readonly fileCache: FileCacheService;

    constructor(
        private readonly token: string,
        private readonly powService: PowService,
    )
    {
        this.fileCache = new FileCacheService();
    }

    async uploadFile(filePath: string, signal?: AbortSignal): Promise<string>
    {
        const file = Bun.file(filePath);
        const buffer = await file.arrayBuffer();

        const md5 = createHash("md5").update(Buffer.from(buffer)).digest("hex");
        const cached = this.fileCache.get(md5);
        if (cached) return cached;

        const powDataB64 = await this.powService.getPowResponse(this.token, API_ENDPOINTS.FILE_TARGET_PATH);
        const headers = HeadersBuilder.getUploadHeaders(this.token, powDataB64);

        const fileName = filePath.split(/[\\/]/).pop() ?? "file";
        const mimeType = file.type || "application/octet-stream";
        const blob = new Blob([buffer], { type: mimeType });

        const formData = new FormData();
        formData.append("file", blob, fileName);

        const response = await fetch(API_ENDPOINTS.UPLOAD_FILE, {
            method: "POST",
            headers,
            body: formData,
            signal,
        });

        if (!response.ok)
        {
            const text = await response.text();
            throw new Error(`File upload failed: ${response.status} ${text}`);
        }

        const json = (await response.json()) as unknown;
        const fileId = this.extractFileId(json);
        const readyId = await this.pollUntilReady(fileId, signal);

        this.fileCache.set(md5, readyId);
        return readyId;
    }

    private extractFileId(data: unknown): string
    {
        const dataNode = getRecord(data, "data");
        const bizData = getRecord(dataNode, "biz_data");
        const id = getString(bizData, "id");
        if (!id) throw new Error("Upload response missing file id");
        return id;
    }

    private async pollUntilReady(fileId: string, signal?: AbortSignal): Promise<string>
    {
        const url = `${API_ENDPOINTS.FETCH_FILES}?file_ids=${encodeURIComponent(fileId)}`;
        const headers = HeadersBuilder.getAuthHeaders(this.token);
        const deadline = Date.now() + FILE_CONFIG.POLL_TIMEOUT_MS;

        while (Date.now() < deadline)
        {
            if (signal?.aborted) throw new Error("File upload aborted");

            const response = await fetch(url, { method: "GET", headers, signal });
            if (!response.ok)
            {
                const text = await response.text();
                throw new Error(`File status check failed: ${response.status} ${text}`);
            }

            const json = (await response.json()) as unknown;
            const status = this.extractFileStatus(json, fileId);

            if (status === "SUCCESS") return fileId;
            if (status === "FAILED") throw new Error(`File processing failed: ${fileId}`);

            await Bun.sleep(FILE_CONFIG.POLL_INTERVAL_MS);
        }

        throw new Error(`File processing timeout: ${fileId}`);
    }

    private extractFileStatus(data: unknown, fileId: string): DeepseekFileStatus
    {
        const dataNode = getRecord(data, "data");
        const bizData = getRecord(dataNode, "biz_data");
        const files = isRecord(bizData) && Array.isArray(bizData.files) ? bizData.files : [];
        const file = files.find((f: unknown) => isRecord(f) && f.id === fileId);
        if (!isRecord(file) || typeof file.status !== "string")
        {
            throw new Error(`File ${fileId} not found in fetch response`);
        }
        return file.status as DeepseekFileStatus;
    }
}
