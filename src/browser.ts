/**
 * Browser-only utilities for the Hyperserve SDK.
 *
 * Import from '@hyperserve/hyperserve-js/browser' — this entry point contains no API key
 * logic and is safe to bundle into client-side code.
 *
 * Usage:
 *   import { putVideoToStorage } from '@hyperserve/hyperserve-js/browser';
 *
 *   // uploadUrl and contentType come from your own backend
 *   await putVideoToStorage({ uploadUrl, contentType, file, onProgress });
 */

export { HyperserveError, HyperserveTimeoutError, HyperserveUploadError } from "./errors.js";
export type { PutVideoToStorageOptions, VideoResolution, VideoStatus } from "./types.js";

import { putToStorage } from "./storage.js";
import type { PutVideoToStorageOptions } from "./types.js";

/**
 * PUT a video file to the presigned storage URL obtained from your backend.
 * No API key required — this call goes directly to storage, not to the Hyperserve API.
 *
 * @example
 * const { uploadUrl, contentType } = await fetch('/api/create-upload', { ... }).then(r => r.json());
 * await putVideoToStorage({ uploadUrl, contentType, file, onProgress: (p) => console.log(p) });
 * await fetch('/api/complete-upload', { method: 'POST', body: JSON.stringify({ videoId }) });
 */
export async function putVideoToStorage(options: PutVideoToStorageOptions): Promise<void> {
	return putToStorage(options.uploadUrl, options.contentType, options.file, options.onProgress);
}
