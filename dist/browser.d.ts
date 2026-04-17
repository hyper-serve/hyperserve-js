import { P as PutVideoToStorageOptions } from './errors-C89laaKB.js';
export { e as HyperserveError, g as HyperserveTimeoutError, h as HyperserveUploadError, k as VideoResolution, m as VideoStatus } from './errors-C89laaKB.js';

/**
 * Browser-only utilities for the Hyperserve SDK.
 *
 * Import from 'hyperserve-sdk/browser' — this entry point contains no API key
 * logic and is safe to bundle into client-side code.
 *
 * Usage:
 *   import { putVideoToStorage } from 'hyperserve-sdk/browser';
 *
 *   // uploadUrl and contentType come from your own backend
 *   await putVideoToStorage({ uploadUrl, contentType, file, onProgress });
 */

/**
 * PUT a video file to the presigned storage URL obtained from your backend.
 * No API key required — this call goes directly to storage, not to the Hyperserve API.
 *
 * @example
 * const { uploadUrl, contentType } = await fetch('/api/create-upload', { ... }).then(r => r.json());
 * await putVideoToStorage({ uploadUrl, contentType, file, onProgress: (p) => console.log(p) });
 * await fetch('/api/complete-upload', { method: 'POST', body: JSON.stringify({ videoId }) });
 */
declare function putVideoToStorage(options: PutVideoToStorageOptions): Promise<void>;

export { PutVideoToStorageOptions, putVideoToStorage };
