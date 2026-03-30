import { H as HyperserveClientOptions, C as CreateVideoOptions, a as CreateVideoResult, b as CompleteUploadResult, G as GetVideoOptions, V as VideoResult, U as UploadVideoOptions, c as VerifyWebhookSignatureOptions } from './errors-ZQDMm3uM.js';
export { d as HyperserveApiError, e as HyperserveError, f as HyperserveNotFoundError, g as HyperserveTimeoutError, h as HyperserveUploadError, i as HyperserveValidationError, P as PutVideoToStorageOptions, j as PutVideoToStorageRNOptions, k as VideoResolution, l as VideoResolutionResult, m as VideoStatus } from './errors-ZQDMm3uM.js';

declare class HyperserveClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly retries;
    constructor(options: HyperserveClientOptions);
    /**
     * Creates a video record and returns a presigned upload URL.
     * Pass uploadUrl and contentType to your frontend so it can PUT the file directly to storage.
     * Call completeUpload once the frontend confirms the PUT is done.
     */
    createVideo(options: CreateVideoOptions): Promise<CreateVideoResult>;
    /**
     * Notifies Hyperserve that the file has been uploaded to the presigned URL.
     * Hyperserve verifies the object and queues transcoding.
     * Call this after your frontend confirms the storage PUT is complete.
     */
    completeUpload(videoId: string): Promise<CompleteUploadResult>;
    /**
     * Retrieves the current state of a video, including per-resolution status and playback URLs.
     *
     * @param videoId - The video ID returned by createVideo or uploadVideo.
     * @param options.private - Return time-limited signed URLs instead of public URLs.
     * @param options.expirationSeconds - Signed URL TTL when private is true. Defaults to 3600.
     */
    getVideo(videoId: string, options?: GetVideoOptions): Promise<VideoResult>;
    /**
     * Deletes a video and all associated resolutions and thumbnails.
     */
    deleteVideo(videoId: string): Promise<void>;
    /**
     * Deletes a single resolution for a video.
     */
    deleteResolution(resolutionId: string): Promise<void>;
    /**
     * Convenience method for server-side / script use cases.
     * Wraps createVideo, the storage PUT, and completeUpload into a single call.
     *
     * Not suitable for the browser proxy pattern — use createVideo + putVideoToStorage
     * from 'hyperserve-sdk/browser' + completeUpload separately for that flow.
     */
    uploadVideo(options: UploadVideoOptions): Promise<CompleteUploadResult>;
}

/**
 * Verifies the x-hyperserve-signature header on an incoming webhook request.
 *
 * The signature header has the format "{timestampMs}.{hmac-sha256-hex}", where the HMAC
 * is computed over the timestamp string using your webhook signing secret. The timestamp
 * is also checked for freshness to prevent replay attacks.
 *
 * Returns true if the signature is valid and the timestamp is within the tolerance window.
 * Returns false if the signature is invalid, the timestamp has expired, or the header is malformed.
 *
 * Uses the Web Crypto API for a constant-time HMAC comparison — safe on Node 18+, Bun, Deno,
 * Cloudflare Workers, Vercel Edge, and all other supported server environments.
 *
 * @example
 * import { verifyWebhookSignature } from 'hyperserve-sdk';
 *
 * // In your webhook handler (Express, Next.js API route, etc.)
 * const isValid = await verifyWebhookSignature({
 *   signature: req.headers['x-hyperserve-signature'] ?? '',
 *   secret: process.env.HYPERSERVE_WEBHOOK_SECRET,
 * });
 * if (!isValid) return res.status(401).end();
 */
declare function verifyWebhookSignature(options: VerifyWebhookSignatureOptions): Promise<boolean>;

export { CompleteUploadResult, CreateVideoOptions, CreateVideoResult, GetVideoOptions, HyperserveClient, HyperserveClientOptions, UploadVideoOptions, VerifyWebhookSignatureOptions, VideoResult, verifyWebhookSignature };
