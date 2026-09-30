import { apiRequest } from "./http.js";
import { normalizeFile } from "./normalize.js";
import { putToStorage } from "./storage.js";
import type {
	CompleteUploadResult,
	CreateVideoOptions,
	CreateVideoResult,
	GetVideoOptions,
	HyperserveClientOptions,
	ListVideosOptions,
	ListVideosResult,
	UploadVideoOptions,
	VideoResult,
	VideoStatusResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.hyperserve.io/api";
const DEFAULT_TIMEOUT_MS = 30_000;

export class HyperserveClient {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly retries: number;

	constructor(options: HyperserveClientOptions) {
		this.apiKey = options.apiKey;
		this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.retries = options.retries ?? 0;
	}

	/**
	 * Creates a video record and returns a presigned upload URL.
	 * Pass uploadUrl and contentType to your frontend so it can PUT the file directly to storage.
	 * Call completeUpload once the frontend confirms the PUT is done.
	 */
	async createVideo(options: CreateVideoOptions): Promise<CreateVideoResult> {
		return apiRequest<CreateVideoResult>({
			method: "POST",
			url: `${this.baseUrl}/video`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
			body: {
				filename: options.filename,
				resolutions: options.resolutions,
				isPublic: options.isPublic,
				...(options.thumbnailTimestampsSeconds !== undefined && {
					thumbnailTimestampsSeconds: options.thumbnailTimestampsSeconds,
				}),
				...(options.customMetadata !== undefined && {
					customMetadata: options.customMetadata,
				}),
			},
		});
	}

	/**
	 * Notifies Hyperserve that the file has been uploaded to the presigned URL.
	 * Hyperserve verifies the object and queues transcoding.
	 * Call this after your frontend confirms the storage PUT is complete.
	 */
	async completeUpload(videoId: string): Promise<CompleteUploadResult> {
		return apiRequest<CompleteUploadResult>({
			method: "POST",
			url: `${this.baseUrl}/video/${videoId}/complete-upload`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Retrieves the current state of a video, including per-resolution status and playback URLs.
	 *
	 * @param videoId - The video ID returned by createVideo or uploadVideo.
	 * @param options.private - Return time-limited signed URLs instead of public URLs.
	 * @param options.expirationSeconds - Signed URL TTL when private is true. Defaults to 3600.
	 */
	async getVideo(videoId: string, options?: GetVideoOptions): Promise<VideoResult> {
		const isPrivate = options?.private === true;
		const expiration = options?.expirationSeconds ?? 3600;

		const url = isPrivate
			? `${this.baseUrl}/video/${videoId}/private/${expiration}`
			: `${this.baseUrl}/video/${videoId}/public`;

		return apiRequest<VideoResult>({
			method: "GET",
			url,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Lists your videos, newest first. Filters are optional.
	 * Thumbnail URLs are public for public videos and signed (1 hour) for private ones.
	 */
	async listVideos(options: ListVideosOptions = {}): Promise<ListVideosResult> {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(options)) {
			if (value !== undefined) params.set(key, String(value));
		}
		const query = params.toString();

		return apiRequest<ListVideosResult>({
			method: "GET",
			url: `${this.baseUrl}/video${query === "" ? "" : `?${query}`}`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Returns a video's processing status per resolution. Unlike getVideo it returns
	 * no playback URLs and is not counted as playback, so it suits polling.
	 */
	async getVideoStatus(videoId: string): Promise<VideoStatusResult> {
		return apiRequest<VideoStatusResult>({
			method: "GET",
			url: `${this.baseUrl}/video/${videoId}/status`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Deletes a video and all associated resolutions and thumbnails.
	 */
	async deleteVideo(videoId: string): Promise<void> {
		return apiRequest<void>({
			method: "DELETE",
			url: `${this.baseUrl}/video/${videoId}`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Deletes a single resolution for a video.
	 */
	async deleteResolution(resolutionId: string): Promise<void> {
		return apiRequest<void>({
			method: "DELETE",
			url: `${this.baseUrl}/video/resolution/${resolutionId}`,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			retries: this.retries,
		});
	}

	/**
	 * Convenience method for server-side / script use cases.
	 * Wraps createVideo, the storage PUT, and completeUpload into a single call.
	 *
	 * Not suitable for the browser proxy pattern — use createVideo + putVideoToStorage
	 * from '@hyperserve/hyperserve-js/browser' + completeUpload separately for that flow.
	 */
	async uploadVideo(options: UploadVideoOptions): Promise<CompleteUploadResult> {
		const { file, filename, resolutions, isPublic, thumbnailTimestampsSeconds, customMetadata } =
			options;

		const normalized = normalizeFile(file, filename, options.fileSizeBytes);

		const upload = await this.createVideo({
			filename,
			resolutions,
			isPublic,
			...(thumbnailTimestampsSeconds !== undefined && { thumbnailTimestampsSeconds }),
			...(customMetadata !== undefined && { customMetadata }),
		});

		await putToStorage(upload.uploadUrl, upload.contentType, normalized.body, {
			contentLength: normalized.size,
		});

		return this.completeUpload(upload.id);
	}
}
