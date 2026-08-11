# @hyperserve/hyperserve-js

TypeScript SDK for the [Hyperserve](https://hyperserve.io?utm_source=github&utm_medium=readme&utm_campaign=hyperserve-js) video infrastructure API. Works in Node.js, browsers, and React Native.

## Installation

```bash
npm install @hyperserve/hyperserve-js
```

## How it works

Hyperserve uploads are a three-step flow. Your **backend** handles steps 1 and 3 (API key stays on the server). Your **frontend or mobile app** handles step 2 (direct to storage, no API key needed).

```
1. Backend  →  POST /api/video       →  Hyperserve   (get presigned URL)
2. Client   →  PUT file to uploadUrl →  Storage      (upload the bytes)
3. Backend  →  POST complete-upload  →  Hyperserve   (verify + queue transcoding)
```

---

## Quick start

### 1. Backend — create the upload

```typescript
import { HyperserveClient } from '@hyperserve/hyperserve-js';

const hyperserve = new HyperserveClient({ apiKey: process.env.HYPERSERVE_API_KEY });

// In your API route or server action
const upload = await hyperserve.createVideo({
  filename: 'promo.mp4',
  fileSizeBytes: 10_485_760,
  resolutions: ['480p', '1080p'],
  isPublic: true,
});

// Return to your client — uploadUrl and contentType are all it needs
return { videoId: upload.id, uploadUrl: upload.uploadUrl, contentType: upload.contentType };
```

### 2a. Browser — upload the file

```typescript
import { putVideoToStorage } from '@hyperserve/hyperserve-js/browser';

const { videoId, uploadUrl, contentType } = await fetch('/api/create-upload', {
  method: 'POST',
  body: JSON.stringify({ filename: file.name, fileSizeBytes: file.size }),
}).then(r => r.json());

await putVideoToStorage({
  uploadUrl,
  contentType,
  file,                              // File from <input type="file">
  onProgress: (percent) => console.log(`${percent}%`),
});

// Tell your backend the upload is done
await fetch('/api/complete-upload', { method: 'POST', body: JSON.stringify({ videoId }) });
```

### 2b. React Native — upload the file

```typescript
import { putVideoToStorage } from '@hyperserve/hyperserve-js/react-native';

// asset from expo-image-picker, react-native-image-picker, etc.
const { videoId, uploadUrl, contentType } = await fetch('https://your-api.com/create-upload', {
  method: 'POST',
  body: JSON.stringify({ filename: asset.fileName, fileSizeBytes: asset.fileSize }),
}).then(r => r.json());

await putVideoToStorage({
  uploadUrl,
  contentType,
  uri: asset.uri,                    // file:/// URI — SDK handles the rest
  onProgress: (percent) => setProgress(percent),
});

await fetch('https://your-api.com/complete-upload', {
  method: 'POST',
  body: JSON.stringify({ videoId }),
});
```

### 3. Backend — complete the upload

```typescript
const result = await hyperserve.completeUpload(videoId);
// Hyperserve verifies the file and queues transcoding
// result.resolutions — all statuses are now 'processing'
```

---

## Server API

### `new HyperserveClient(options)`

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiKey` | `string` | Yes | — | Your Hyperserve API key |
| `baseUrl` | `string` | No | `https://api.hyperserve.io` | Override for local dev |
| `timeoutMs` | `number` | No | `30000` | Timeout for API calls |
| `retries` | `number` | No | `0` | Retry attempts on 5xx responses and network errors. Uses exponential backoff with full jitter. Does not retry on 4xx or timeouts. |

---

### `createVideo(options)`

Creates a video record and returns a presigned upload URL.

```typescript
const upload = await hyperserve.createVideo({
  filename: 'clip.mp4',          // required — extension determines content type
  fileSizeBytes: 5_242_880,      // required
  resolutions: ['720p', '1080p'],// required — at least one
  isPublic: true,                // required
  thumbnailTimestampsSeconds: [5, 30, 60], // optional
  customMetadata: { campaignId: 'launch' }, // optional
});

upload.id          // video ID for subsequent calls
upload.uploadUrl   // presigned PUT URL — expires shortly, pass to your client
upload.contentType // exact Content-Type to use on the PUT
```

---

### `completeUpload(videoId)`

Notifies Hyperserve that the file has been uploaded. Verifies the object and queues transcoding.

```typescript
const result = await hyperserve.completeUpload(videoId);
result.resolutions // Record<VideoResolution, { status: 'processing' }>
```

---

### `getVideo(videoId, options?)`

Retrieves video status and playback URLs.

```typescript
// Public video
const video = await hyperserve.getVideo(videoId);

// Private video — time-limited signed URLs
const video = await hyperserve.getVideo(videoId, {
  private: true,
  expirationSeconds: 3600, // defaults to 3600
});

video.status                          // 'pending_upload' | 'processing' | 'ready' | 'fail'
video.resolutions['1080p']?.videoUrl  // playback URL (set when status is 'ready')
video.resolutions['1080p']?.thumbnailImageUrls // array of thumbnail URLs
```

---

### `deleteVideo(videoId)`

Deletes a video and all associated resolutions and thumbnails.

```typescript
await hyperserve.deleteVideo(videoId);
```

---

### `deleteResolution(resolutionId)`

Deletes a single resolution.

```typescript
await hyperserve.deleteResolution(resolutionId);
```

---

### `uploadVideo(options)` — convenience

Wraps `createVideo`, the storage PUT, and `completeUpload` into a single call. Intended for scripts and server-to-server use cases where the server holds the file. **Not suitable for the browser proxy pattern.**

```typescript
import { readFileSync, statSync } from 'fs';

const buffer = readFileSync('./promo.mp4');
const { size } = statSync('./promo.mp4');

const result = await hyperserve.uploadVideo({
  file: buffer,                  // Blob | Buffer | ReadableStream
  filename: 'promo.mp4',
  fileSizeBytes: size,           // required for ReadableStream, inferred for Blob/Buffer
  resolutions: ['1080p'],
  isPublic: false,
});
```

---

### `verifyWebhookSignature(options)`

Verifies the `x-hyperserve-signature` header on incoming webhook requests. Returns `Promise<boolean>` — never throws.

```typescript
import { verifyWebhookSignature } from '@hyperserve/hyperserve-js';

const isValid = await verifyWebhookSignature({
  signature: req.headers['x-hyperserve-signature'] ?? '',
  secret: process.env.HYPERSERVE_WEBHOOK_SECRET,
});
if (!isValid) return res.status(401).end();
```

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `signature` | `string` | Yes | — | Value of the `x-hyperserve-signature` header |
| `secret` | `string` | Yes | — | Webhook signing secret from the Hyperserve dashboard |
| `toleranceMs` | `number` | No | `300000` | Max timestamp age in ms (default 5 min) |

---

## Error handling

All errors extend `HyperserveError` and can be caught broadly or narrowly.

```typescript
import {
  HyperserveClient,
  HyperserveError,
  HyperserveValidationError,
  HyperserveNotFoundError,
  HyperserveUploadError,
  HyperserveTimeoutError,
} from '@hyperserve/hyperserve-js';

try {
  await hyperserve.createVideo({ ... });
} catch (err) {
  if (err instanceof HyperserveValidationError) {
    // 4xx — unsupported format, file too large, invalid resolutions, etc.
    console.error(err.message, err.statusCode);
  } else if (err instanceof HyperserveNotFoundError) {
    // 404
  } else if (err instanceof HyperserveTimeoutError) {
    // request exceeded timeoutMs
  } else if (err instanceof HyperserveError) {
    // any other SDK error
  }
}
```

`HyperserveUploadError` and `HyperserveTimeoutError` are also exported from `@hyperserve/hyperserve-js/browser` and `@hyperserve/hyperserve-js/react-native`.

---

## Types

```typescript
import type {
  VideoResolution,             // '144p' | '240p' | '360p' | '480p' | '720p' | '1080p' | '1440p' | '4k' | '8k'
  VideoStatus,                 // 'pending_upload' | 'processing' | 'ready' | 'fail'
  CreateVideoOptions,
  CreateVideoResult,
  CompleteUploadResult,
  VideoResult,
  VideoResolutionResult,
  VerifyWebhookSignatureOptions,
  PutVideoToStorageOptions,    // for @hyperserve/hyperserve-js/browser
  PutVideoToStorageRNOptions,  // for @hyperserve/hyperserve-js/react-native
} from 'hyperserve-js';
```

---

## Requirements

| Environment | Minimum version |
|---|---|
| Node.js | 18+ |
| Modern browsers | Chrome 80+, Firefox 75+, Safari 14+ |
| React Native | 0.60+ |
| Expo | SDK 41+ |
| Bun / Deno | Current stable |

No polyfills required. The SDK uses native `fetch`, `Blob`, and `XMLHttpRequest` — all available in the supported environments without additional setup.
