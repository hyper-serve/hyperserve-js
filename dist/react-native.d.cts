import { j as PutVideoToStorageRNOptions } from './errors-C89laaKB.cjs';
export { e as HyperserveError, g as HyperserveTimeoutError, h as HyperserveUploadError, k as VideoResolution, m as VideoStatus } from './errors-C89laaKB.cjs';

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
declare function putVideoToStorage(options: PutVideoToStorageRNOptions): Promise<void>;

export { PutVideoToStorageRNOptions, putVideoToStorage };
