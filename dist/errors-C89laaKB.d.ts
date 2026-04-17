type VideoResolution = "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "4k" | "8k";
type VideoStatus = "pending_upload" | "processing" | "ready" | "fail";
interface HyperserveClientOptions {
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
interface VerifyWebhookSignatureOptions {
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
interface CreateVideoOptions {
    /** Original filename including extension (e.g. "promo.mp4"). Used server-side to derive content type. */
    filename: string;
    /** File size in bytes. */
    fileSizeBytes: number;
    /** At least one resolution is required. */
    resolutions: [VideoResolution, ...VideoResolution[]];
    /** Controls whether playback URLs are public or time-limited signed URLs. */
    isPublic: boolean;
    /** Timestamps (seconds) at which to generate thumbnail images. */
    thumbnailTimestampsSeconds?: number[];
    /** Arbitrary key/value stored against the video. */
    customMetadata?: Record<string, unknown>;
}
interface CreateVideoResult {
    /** Video ID — use in completeUpload and all subsequent calls. */
    id: string;
    /** Presigned PUT URL for the original file. Pass to your frontend. Expires shortly. */
    uploadUrl: string;
    /** Exact Content-Type to send on the presigned PUT. Pass to your frontend alongside uploadUrl. */
    contentType: string;
    isPublic: boolean;
    resolutions: Record<VideoResolution, {
        status: "pending_upload";
    }>;
}
interface CompleteUploadResult {
    id: string;
    isPublic: boolean;
    resolutions: Record<VideoResolution, {
        status: VideoStatus;
    }>;
}
interface UploadVideoOptions {
    /** The video file. Use File/Blob in browser contexts, Buffer or ReadableStream in Node. */
    file: Blob | Buffer | ReadableStream;
    /** Filename including extension (e.g. "clip.mp4"). */
    filename: string;
    /** Required when file is a ReadableStream (cannot be inferred). Inferred automatically for Blob/Buffer. */
    fileSizeBytes?: number;
    resolutions: [VideoResolution, ...VideoResolution[]];
    isPublic: boolean;
    thumbnailTimestampsSeconds?: number[];
    customMetadata?: Record<string, unknown>;
}
interface GetVideoOptions {
    /** Return time-limited signed URLs instead of public URLs. */
    private?: boolean;
    /** Signed URL TTL in seconds when private is true. Defaults to 3600. */
    expirationSeconds?: number;
}
interface VideoResolutionResult {
    id: string;
    status: VideoStatus;
    videoUrl: string;
    thumbnailImageUrls: string[];
}
interface VideoResult {
    id: string;
    status: VideoStatus;
    isPublic: boolean;
    resolutions: Partial<Record<VideoResolution, VideoResolutionResult>>;
}
interface PutVideoToStorageOptions {
    /** Presigned PUT URL obtained from your backend (which called createVideo). */
    uploadUrl: string;
    /** Content-Type obtained from your backend alongside uploadUrl. */
    contentType: string;
    /** The video file from a browser file picker or drag-and-drop. */
    file: File | Blob;
    /** Called during the upload with progress 0–100. Uses XHR when provided. */
    onProgress?: (percent: number) => void;
}
interface PutVideoToStorageRNOptions {
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

/**
 * Base class for all Hyperserve SDK errors.
 */
declare class HyperserveError extends Error {
    readonly statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined);
}
/**
 * The Hyperserve API returned a 4xx response.
 * Typically indicates a validation problem: unsupported file format,
 * file too large, invalid resolutions, video not in expected state, etc.
 */
declare class HyperserveValidationError extends HyperserveError {
    readonly detail?: unknown | undefined;
    constructor(message: string, statusCode: number, detail?: unknown | undefined);
}
/**
 * The Hyperserve API returned a 404 response.
 */
declare class HyperserveNotFoundError extends HyperserveError {
    constructor(message?: string);
}
/**
 * The Hyperserve API returned a 5xx response.
 */
declare class HyperserveApiError extends HyperserveError {
    constructor(message: string, statusCode: number);
}
/**
 * The storage PUT request failed.
 */
declare class HyperserveUploadError extends HyperserveError {
    readonly uploadStatus?: number | undefined;
    constructor(message: string, uploadStatus?: number | undefined);
}
/**
 * A request exceeded the configured timeoutMs.
 */
declare class HyperserveTimeoutError extends HyperserveError {
    constructor(message?: string);
}

export { type CreateVideoOptions as C, type GetVideoOptions as G, type HyperserveClientOptions as H, type PutVideoToStorageOptions as P, type UploadVideoOptions as U, type VideoResult as V, type CreateVideoResult as a, type CompleteUploadResult as b, type VerifyWebhookSignatureOptions as c, HyperserveApiError as d, HyperserveError as e, HyperserveNotFoundError as f, HyperserveTimeoutError as g, HyperserveUploadError as h, HyperserveValidationError as i, type PutVideoToStorageRNOptions as j, type VideoResolution as k, type VideoResolutionResult as l, type VideoStatus as m };
