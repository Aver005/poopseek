import { API_ENDPOINTS, FILE_CONFIG } from "../config/constants";
import { HeadersBuilder } from "../config/headers";
import type { DeepseekFileStatus } from "../types";
import { getRecord, getString, isRecord } from "../utils/record";
import type PowService from "./PowService";

export default class FileService
{
    constructor(
        private readonly token: string,
        private readonly powService: PowService,
    ) {}

    async uploadFile(filePath: string, signal?: AbortSignal): Promise<string>
    {
        const powDataB64 = await this.powService.getPowResponse(this.token, API_ENDPOINTS.FILE_TARGET_PATH);
        const headers = HeadersBuilder.getUploadHeaders(this.token, powDataB64);

        const file = Bun.file(filePath);
        const fileName = filePath.split(/[\\/]/).pop() ?? "file";
        const mimeType = file.type || "application/octet-stream";
        const blob = new Blob([await file.arrayBuffer()], { type: mimeType });

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
        return await this.pollUntilReady(fileId, signal);
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
