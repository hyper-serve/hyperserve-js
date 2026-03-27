/**
 * React Native utilities for the Hyperserve SDK.
 *
 * Import from 'hyperserve-sdk/react-native' — this entry point contains no
 * API key logic and is safe to bundle into your React Native app.
 *
 * Usage:
 *   import { putVideoToStorage } from 'hyperserve-sdk/react-native';
 *
 *   // uri comes from expo-image-picker, react-native-image-picker, etc.
 *   await putVideoToStorage({ uploadUrl, contentType, uri: asset.uri, onProgress });
 *
 * Note: your backend (not this utility) should hold the API key and call
 * createVideo / completeUpload on your app's behalf.
 */

export { HyperserveError, HyperserveTimeoutError, HyperserveUploadError } from "./errors.js";
export type { PutVideoToStorageRNOptions, VideoResolution, VideoStatus } from "./types.js";

import { putToStorage } from "./storage.js";
import type { PutVideoToStorageRNOptions } from "./types.js";

/**
 * PUT a video file to the presigned storage URL obtained from your backend.
 * Accepts a local file URI from a React Native video/image picker.
 * No API key required — this call goes directly to storage, not to the Hyperserve API.
 *
 * @example
 * const { uploadUrl, contentType } = await fetch('https://your-api.com/create-upload', {
 *   method: 'POST',
 *   body: JSON.stringify({ filename: asset.fileName, fileSizeBytes: asset.fileSize }),
 * }).then(r => r.json());
 *
 * await putVideoToStorage({ uploadUrl, contentType, uri: asset.uri, onProgress: (p) => setProgress(p) });
 *
 * await fetch('https://your-api.com/complete-upload', {
 *   method: 'POST',
 *   body: JSON.stringify({ videoId }),
 * });
 */
export async function putVideoToStorage(options: PutVideoToStorageRNOptions): Promise<void> {
	const { uploadUrl, contentType, uri, onProgress } = options;

	// Fetch the local file URI to obtain a Blob. React Native's fetch implementation
	// supports file:// URIs, allowing us to read local files from the device.
	const localResponse = await fetch(uri);
	const blob = await localResponse.blob();

	return putToStorage(uploadUrl, contentType, blob, onProgress);
}
