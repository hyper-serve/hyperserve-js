export type VideoResolution =
	| "144p"
	| "240p"
	| "360p"
	| "480p"
	| "720p"
	| "1080p"
	| "1440p"
	| "4k"
	| "8k";

export type VideoStatus = "pending_upload" | "processing" | "ready" | "fail";

export interface HyperserveClientOptions {
	/** Your Hyperserve API key. Must be kept server-side — never expose in browser code. */
	apiKey: string;
	/** Override the base URL (must include the /api prefix). Useful for local development. Defaults to https://api.hyperserve.io/api */
	baseUrl?: string;
	/** Timeout in milliseconds for API calls (not the storage PUT). Defaults to 30000. */
	timeoutMs?: number;
	/**
	 * Number of additional retry attempts on transient failures (5xx responses and network errors).
	 * Uses exponential backoff with full jitter (random delay up to min(10s, 100ms × 2^attempt)).
	 * Does not retry on 4xx errors or timeouts. Defaults to 0 (no retries).
	 */
	retries?: number;
}

// --- webhook payloads ---

/** Events Hyperserve delivers to your webhook endpoint. */
export type WebhookEvent = "video-processing-success" | "video-processing-fail";

/** One rendition inside a `video-processing-success` payload. */
export interface WebhookResolutionResult {
	/** Always "ready" in a success payload — a failed rendition fails the whole video. */
	status: VideoStatus;
	/** Public CDN URL. Absent when the video is private — generate a signed URL with `getVideo`. */
	videoUrl?: string;
	/** Public CDN URLs. Absent when the video is private, or when no thumbnails were requested. */
	thumbnailImageUrls?: string[];
}

interface WebhookPayloadBase {
	/** Name of the webhook in the Hyperserve dashboard that delivered this event. */
	webhookName: string;
	/** ID of the video this event is about. */
	videoId: string;
	/** Metadata supplied at `createVideo`, returned verbatim. Null when none was set. */
	customMetadata: Record<string, unknown> | null;
}

/** Delivered when every requested resolution finished transcoding. */
export interface VideoProcessingSuccessPayload extends WebhookPayloadBase {
	event: "video-processing-success";
	data: {
		id: string;
		isPublic: boolean;
		/** Keyed by the resolutions requested at `createVideo` — not every `VideoResolution`. */
		resolutions: Partial<Record<VideoResolution, WebhookResolutionResult>>;
	};
}

/** Delivered when processing failed. Carries no `data` — the renditions do not exist. */
export interface VideoProcessingFailPayload extends WebhookPayloadBase {
	event: "video-processing-fail";
	/** Human-readable failure reason. Not a stable machine-readable code. */
	error: string;
}

/**
 * A webhook request body. Discriminated on `event`:
 *
 * @example
 * if (payload.event === 'video-processing-success') {
 *   payload.data.resolutions; // narrowed
 * } else {
 *   payload.error;            // narrowed
 * }
 */
export type WebhookPayload = VideoProcessingSuccessPayload | VideoProcessingFailPayload;

// --- verifyWebhookSignature ---

export interface VerifyWebhookSignatureOptions {
	/**
	 * Value of the x-hyperserve-signature header from the incoming webhook request.
	 * Format: "{timestampMs}.{hmac-sha256-hex}"
	 */
	signature: string;
	/** Your webhook signing secret from the Hyperserve dashboard. */
	secret: string;
	/**
	 * The raw request body as a string. Must be the exact bytes received — do not parse
	 * and re-serialize, as any whitespace difference will invalidate the signature.
	 *
	 * @example
	 * // Express
	 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
	 *   const body = req.body.toString();
	 *   ...
	 * });
	 *
	 * // Next.js App Router
	 * const body = await request.text();
	 */
	body: string;
	/**
	 * Maximum age of the timestamp in milliseconds. Defaults to 300000 (5 minutes).
	 * Must match or exceed the server-side tolerance to avoid rejecting valid webhooks.
	 */
	toleranceMs?: number;
}

// --- createVideo ---

export interface CreateVideoOptions {
	/** Original filename including extension (e.g. "promo.mp4"). Used server-side to derive content type. */
	filename: string;
	/** At least one resolution is required. */
	resolutions: [VideoResolution, ...VideoResolution[]];
	/** Controls whether playback URLs are public or time-limited signed URLs. */
	isPublic: boolean;
	/** Timestamps (seconds) at which to generate thumbnail images. */
	thumbnailTimestampsSeconds?: number[];
	/** Arbitrary key/value stored against the video. */
	customMetadata?: Record<string, unknown>;
}

export interface CreateVideoResult {
	/** Video ID — use in completeUpload and all subsequent calls. */
	id: string;
	/** Presigned PUT URL for the original file. Pass to your frontend. Expires shortly. */
	uploadUrl: string;
	/** Exact Content-Type to send on the presigned PUT. Pass to your frontend alongside uploadUrl. */
	contentType: string;
	isPublic: boolean;
	resolutions: Record<VideoResolution, { status: "pending_upload" }>;
}

// --- completeUpload ---

export interface CompleteUploadResult {
	id: string;
	isPublic: boolean;
	resolutions: Record<VideoResolution, { status: VideoStatus }>;
}

// --- uploadVideo ---

export interface UploadVideoOptions {
	/** The video file. Use File/Blob in browser contexts, Buffer or ReadableStream in Node. */
	file: Blob | Buffer | ReadableStream;
	/** Filename including extension (e.g. "clip.mp4"). */
	filename: string;
	/**
	 * Byte length of the file. Required when file is a ReadableStream, where it sets
	 * Content-Length on the storage PUT — a stream body would otherwise be sent chunked,
	 * which storage rejects with 411. Inferred and then ignored for Blob/Buffer, which
	 * carry their own length; supplying it for those has no effect on the request.
	 * Never sent to the Hyperserve API.
	 */
	fileSizeBytes?: number;
	resolutions: [VideoResolution, ...VideoResolution[]];
	isPublic: boolean;
	thumbnailTimestampsSeconds?: number[];
	customMetadata?: Record<string, unknown>;
}

// --- getVideo ---

export interface GetVideoOptions {
	/** Return time-limited signed URLs instead of public URLs. */
	private?: boolean;
	/** Signed URL TTL in seconds when private is true. Defaults to 3600. */
	expirationSeconds?: number;
}

export interface VideoResolutionResult {
	id: string;
	status: VideoStatus;
	videoUrl: string;
	thumbnailImageUrls: string[];
}

export interface VideoResult {
	id: string;
	status: VideoStatus;
	isPublic: boolean;
	/** Arbitrary key/value bag stored against the video at creation. Keys are returned verbatim. Null when none was set. */
	customMetadata?: Record<string, unknown> | null;
	resolutions: Partial<Record<VideoResolution, VideoResolutionResult>>;
}

// --- putVideoToStorage (browser) ---

export interface PutVideoToStorageOptions {
	/** Presigned PUT URL obtained from your backend (which called createVideo). */
	uploadUrl: string;
	/** Content-Type obtained from your backend alongside uploadUrl. */
	contentType: string;
	/** The video file from a browser file picker or drag-and-drop. */
	file: File | Blob;
	/** Called during the upload with progress 0–100. Uses XHR when provided. */
	onProgress?: (percent: number) => void;
}

// --- putVideoToStorage (react-native) ---

export interface PutVideoToStorageRNOptions {
	/** Presigned PUT URL obtained from your backend (which called createVideo). */
	uploadUrl: string;
	/** Content-Type obtained from your backend alongside uploadUrl. */
	contentType: string;
	/**
	 * Local file URI from a React Native video/image picker.
	 * e.g. "file:///var/mobile/Containers/.../video.mp4"
	 * Accepted from expo-image-picker, react-native-image-picker, expo-document-picker, etc.
	 */
	uri: string;
	/** Called during the upload with progress 0–100. Uses XHR when provided. */
	onProgress?: (percent: number) => void;
}
