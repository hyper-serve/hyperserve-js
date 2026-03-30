# Hyperserve SDK — Specification

## Overview

A TypeScript-first, isomorphic SDK for the Hyperserve API. Published to npm as `hyperserve-sdk`.

Hyperserve is a video infrastructure API for app developers. The SDK consumer is always a developer building an application — not an end user. The SDK surfaces three distinct concerns that map to where code runs in a typical app architecture:

- **Server client** — authenticated with an API key, runs on the server (Node.js, server actions, backend services, scripts). Handles all Hyperserve API calls.
- **Browser utilities** — no API key, runs in the browser. Handles the file PUT to the presigned storage URL that the server obtained.
- **React Native utilities** — no API key, runs in a React Native app. Accepts a local file URI from a video picker and handles the PUT to the presigned storage URL.

The API key must never be used in client-side or mobile app code.

---

## Architecture

A typical integration looks like this:

```
App backend                          Hyperserve API
──────────────────────────────────────────────────────
1. POST /api/video (SDK)     ──────► creates record
                             ◄────── { id, uploadUrl, contentType }
2. Return uploadUrl +
   contentType to frontend

App frontend / mobile app            Storage (S3)
──────────────────────────────────────────────────────
3. PUT file to uploadUrl     ──────► file stored
   (SDK browser or RN utility)

App backend
──────────────────────────────────────────────────────
4. POST complete-upload (SDK) ─────► verifies file, queues transcoding
                              ◄───── { id, isPublic, resolutions }
```

Step 3 can be triggered by the frontend notifying the backend after the PUT completes, or the backend can initiate the complete-upload call after a webhook/callback from the frontend. The SDK does not prescribe this coordination — that is app-level logic.

---

## Target environments

### Server client
| Environment | Min version |
|---|---|
| Node.js | 18+ |
| Bun | 1.0+ |
| Deno | 1.28+ |
| Next.js server actions / API routes | 13+ |
| Edge runtime (Cloudflare Workers, Vercel Edge) | Supported — no Node-specific APIs used |

### Browser utilities
| Environment | Notes |
|---|---|
| Modern browsers | Chrome 80+, Firefox 75+, Safari 14+, Edge 80+ |

### React Native utilities
| Environment | Min version | Notes |
|---|---|---|
| React Native | 0.60+ | Built-in `fetch` and `XMLHttpRequest` |
| Expo | SDK 41+ | Full support |

No polyfills required for any entry point. `Buffer` and `ReadableStream` are not used in the React Native entry — only `fetch`, `Blob`, and `XMLHttpRequest`, all of which are built into React Native.

---

## Target use cases

### 1. Server — create video record and return upload details to frontend

The most common server-side path. The backend creates the video record and hands the presigned URL back to its own frontend or mobile app.

```typescript
import { HyperserveClient } from 'hyperserve-sdk';

const hyperserve = new HyperserveClient({ apiKey: process.env.HYPERSERVE_API_KEY });

// In your API route / server action
export async function createUploadHandler(req: Request) {
  const { filename, fileSizeBytes } = await req.json();

  const upload = await hyperserve.createVideo({
    filename,
    fileSizeBytes,
    resolutions: ['480p', '1080p'],
    isPublic: true,
  });

  // Return to frontend — no API key included
  return Response.json({
    videoId: upload.id,
    uploadUrl: upload.uploadUrl,
    contentType: upload.contentType,
  });
}
```

### 2. Browser — PUT file to presigned URL

The frontend receives the upload details from its own backend and sends the file directly to storage.

```typescript
import { putVideoToStorage } from 'hyperserve-sdk/browser';

// uploadUrl and contentType come from your own backend
await putVideoToStorage({
  uploadUrl,
  contentType,
  file,                          // File from <input type="file">
  onProgress: (percent) => {
    progressBar.style.width = `${percent}%`;
  },
});

// Notify your backend the upload is done so it can call complete-upload
await fetch('/api/complete-upload', {
  method: 'POST',
  body: JSON.stringify({ videoId }),
});
```

### 3. React Native — PUT file to presigned URL

A React Native app receives a local file URI from a video picker and sends the file directly to storage. The API key never touches the mobile app.

```typescript
import { putVideoToStorage } from 'hyperserve-sdk/react-native';
import { launchImageLibrary } from 'react-native-image-picker';
// or: import * as ImagePicker from 'expo-image-picker';

const result = await launchImageLibrary({ mediaType: 'video' });
const asset = result.assets[0];

// uploadUrl and contentType come from your own backend
const { videoId, uploadUrl, contentType } = await fetch('https://your-api.com/create-upload', {
  method: 'POST',
  body: JSON.stringify({ filename: asset.fileName, fileSizeBytes: asset.fileSize }),
}).then(r => r.json());

await putVideoToStorage({
  uploadUrl,
  contentType,
  uri: asset.uri,               // file:///var/mobile/... — SDK handles URI → Blob conversion
  onProgress: (percent) => setProgress(percent),
});

// Notify your backend to call complete-upload
await fetch('https://your-api.com/complete-upload', {
  method: 'POST',
  body: JSON.stringify({ videoId }),
});
```

### 4. Server — complete upload and queue transcoding

After the frontend or mobile app confirms the PUT is done, the backend calls complete-upload.

```typescript
const result = await hyperserve.completeUpload(videoId);
// result.resolutions — all statuses are now 'processing'
```

### 5. Server — retrieve video for playback

Poll or retrieve on demand to get playback URLs once processing is complete.

```typescript
// Public video
const video = await hyperserve.getVideo(videoId);
const url = video.resolutions['1080p']?.videoUrl; // ready when status === 'ready'

// Private video — signed URL with expiry
const video = await hyperserve.getVideo(videoId, {
  private: true,
  expirationSeconds: 3600,
});
```

### 6. Server — script / bulk upload

An internal tool or CI pipeline uploading assets programmatically.

```typescript
import { createReadStream, statSync } from 'fs';
import { HyperserveClient } from 'hyperserve-sdk';

const hyperserve = new HyperserveClient({ apiKey: process.env.HYPERSERVE_API_KEY });

const filePath = './assets/product-demo.mp4';
const { size } = statSync(filePath);

const upload = await hyperserve.createVideo({
  filename: 'product-demo.mp4',
  fileSizeBytes: size,
  resolutions: ['720p', '1080p'],
  isPublic: false,
});

await fetch(upload.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': upload.contentType },
  body: createReadStream(filePath),
  duplex: 'half',
});

const result = await hyperserve.completeUpload(upload.id);
```

> For script use cases the SDK also provides an `uploadVideo` convenience method that wraps all three steps.

### 7. Server — convenience upload (scripts / server-to-server)

For non-browser environments where the server controls both the file and the Hyperserve API calls.

```typescript
import { readFileSync, statSync } from 'fs';

const buffer = readFileSync('./promo.mp4');
const { size } = statSync('./promo.mp4');

const result = await hyperserve.uploadVideo({
  file: buffer,
  filename: 'promo.mp4',
  fileSizeBytes: size,
  resolutions: ['1080p'],
  isPublic: false,
});
// result.id — transcoding is now queued
```

---

## API surface

### Server client instantiation

```typescript
import { HyperserveClient } from 'hyperserve-sdk';

const hyperserve = new HyperserveClient({ apiKey: 'hs_...' });
```

The API key is sent as the `X-API-KEY` request header on every API call.

#### `HyperserveClientOptions`

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiKey` | `string` | Yes | — | Hyperserve API key |
| `baseUrl` | `string` | No | `'https://api.hyperserve.io'` | Override for local dev |
| `timeoutMs` | `number` | No | `30_000` | Timeout for API calls (not the storage PUT) |
| `retries` | `number` | No | `0` | Additional retry attempts on transient failures: 5xx responses and raw network errors (e.g. `TypeError: Failed to fetch`). Uses exponential backoff with full jitter (random delay up to `min(10s, 100ms × 2^attempt)`). Does not retry on 4xx errors or timeouts. |

---

### `createVideo(options)` — server only

Creates the video record and returns the presigned upload URL and expected content type.

#### Options

| Option | Type | Required | Notes |
|---|---|---|---|
| `filename` | `string` | Yes | Used server-side to derive content type from extension |
| `fileSizeBytes` | `number` | Yes | |
| `resolutions` | `VideoResolution[]` | Yes | At least one required |
| `isPublic` | `boolean` | Yes | |
| `thumbnailTimestampsSeconds` | `number[]` | No | |
| `customMetadata` | `Record<string, unknown>` | No | |

#### Returns `Promise<CreateVideoResult>`

```typescript
interface CreateVideoResult {
  id: string;
  uploadUrl: string;       // presigned PUT URL — pass to frontend/app, expires shortly
  contentType: string;     // pass alongside uploadUrl
  isPublic: boolean;
  resolutions: Record<VideoResolution, { status: 'pending_upload' }>;
}
```

---

### `completeUpload(videoId)` — server only

Notifies Hyperserve that the file has been PUT to storage. Hyperserve verifies the object and queues transcoding. Call this after your frontend or mobile app confirms the PUT is complete.

```typescript
const result = await hyperserve.completeUpload(videoId);
```

#### Returns `Promise<CompleteUploadResult>`

```typescript
interface CompleteUploadResult {
  id: string;
  isPublic: boolean;
  resolutions: Record<VideoResolution, { status: VideoStatus }>;
}
```

---

### `uploadVideo(options)` — server only (convenience)

Wraps `createVideo`, the storage PUT, and `completeUpload` into a single call. Intended for scripts and server-to-server use cases where the server controls the file. Not suitable for the browser proxy pattern.

#### Options

| Option | Type | Required | Notes |
|---|---|---|---|
| `file` | `Blob \| Buffer \| ReadableStream` | Yes | |
| `filename` | `string` | Yes | |
| `fileSizeBytes` | `number` | Conditional | Required for `ReadableStream`. Inferred for `Blob`/`Buffer`. |
| `resolutions` | `VideoResolution[]` | Yes | |
| `isPublic` | `boolean` | Yes | |
| `thumbnailTimestampsSeconds` | `number[]` | No | |
| `customMetadata` | `Record<string, unknown>` | No | |

#### Returns `Promise<CompleteUploadResult>`

---

### `getVideo(id, options?)` — server only

#### Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `private` | `boolean` | No | `false` | Return signed URLs instead of public URLs |
| `expirationSeconds` | `number` | No | `3600` | Signed URL TTL when `private: true` |

#### Returns `Promise<VideoResult>`

```typescript
interface VideoResult {
  id: string;
  status: VideoStatus;
  isPublic: boolean;
  resolutions: Partial<Record<VideoResolution, VideoResolutionResult>>;
}

interface VideoResolutionResult {
  id: string;
  status: VideoStatus;
  videoUrl: string;
  thumbnailImageUrls: string[];
}
```

---

### `deleteVideo(id)` — server only

Deletes the video, all resolutions, and all thumbnails. Returns `Promise<void>`.

---

### `deleteResolution(resolutionId)` — server only

Deletes a single resolution. Returns `Promise<void>`.

---

### `verifyWebhookSignature(options)` — server only

Verifies the `x-hyperserve-signature` header on an incoming webhook request. Returns `Promise<boolean>`.

The header value has the format `{timestampMs}.{hmac-sha256-hex}`, where the HMAC is computed over the timestamp string using your webhook signing secret. The timestamp is checked for freshness to prevent replay attacks.

Uses the Web Crypto API for constant-time comparison — no Node-specific imports, safe on all supported server environments.

```typescript
import { verifyWebhookSignature } from 'hyperserve-sdk';

// In your webhook handler (Express, Next.js API route, Hono, etc.)
const isValid = await verifyWebhookSignature({
  signature: req.headers['x-hyperserve-signature'] ?? '',
  secret: process.env.HYPERSERVE_WEBHOOK_SECRET,
});
if (!isValid) return res.status(401).end();
```

#### Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `signature` | `string` | Yes | — | Value of the `x-hyperserve-signature` header |
| `secret` | `string` | Yes | — | Webhook signing secret from the Hyperserve dashboard |
| `toleranceMs` | `number` | No | `300_000` | Maximum age of the timestamp in ms. Defaults to 5 minutes, matching server-side enforcement. |

#### Returns `Promise<boolean>`

Returns `false` (never throws) if the header is missing, malformed, the timestamp is expired, or the signature does not match.

---

### `putVideoToStorage(options)` — browser utility

Standalone export for browser use. No API key. Sends the file to the presigned URL returned by your backend.

```typescript
import { putVideoToStorage } from 'hyperserve-sdk/browser';
```

#### Options

| Option | Type | Required | Notes |
|---|---|---|---|
| `uploadUrl` | `string` | Yes | Presigned PUT URL from your backend |
| `contentType` | `string` | Yes | Exact value from your backend |
| `file` | `File \| Blob` | Yes | |
| `onProgress` | `(percent: number) => void` | No | Upload progress 0–100. Uses XHR when provided. |

#### Returns `Promise<void>`

---

### `putVideoToStorage(options)` — React Native utility

Standalone export for React Native use. No API key. Accepts a local file URI from a video/image picker, converts it to a Blob internally, and PUTs to the presigned URL.

```typescript
import { putVideoToStorage } from 'hyperserve-sdk/react-native';
```

#### Options

| Option | Type | Required | Notes |
|---|---|---|---|
| `uploadUrl` | `string` | Yes | Presigned PUT URL from your backend |
| `contentType` | `string` | Yes | Exact value from your backend |
| `uri` | `string` | Yes | Local file URI from a video picker (e.g. `file:///...`) |
| `onProgress` | `(percent: number) => void` | No | Upload progress 0–100. Uses XHR. |

#### Returns `Promise<void>`

Internally calls `fetch(uri)` to read the local file into a Blob, then PUTs to the presigned URL. React Native's `fetch` supports `file://` URIs natively.

---

## Types

```typescript
type VideoResolution =
  | '144p' | '240p' | '360p' | '480p'
  | '720p' | '1080p' | '1440p' | '4k' | '8k';

type VideoStatus = 'pending_upload' | 'processing' | 'ready' | 'fail';
```

All types and error classes are exported as named exports from the package root.

---

## Error hierarchy

```
HyperserveError                  (base — message, statusCode?)
├── HyperserveApiError           (5xx responses)
├── HyperserveValidationError    (4xx — unsupported format, file too large, etc.)
├── HyperserveNotFoundError      (404)
├── HyperserveUploadError        (storage PUT failed)
└── HyperserveTimeoutError       (request exceeded timeoutMs)
```

`HyperserveError`, `HyperserveUploadError`, and `HyperserveTimeoutError` are also exported from `hyperserve-sdk/browser` and `hyperserve-sdk/react-native` so consumers can catch errors without importing from the server entry.

```typescript
import { HyperserveClient, HyperserveValidationError, HyperserveError } from 'hyperserve-sdk';

try {
  await hyperserve.createVideo({ ... });
} catch (err) {
  if (err instanceof HyperserveValidationError) {
    // unsupported file format, file too large, bad resolutions, etc.
  } else if (err instanceof HyperserveError) {
    // any other SDK error
  }
}
```

---

## Package exports

```
hyperserve-sdk              → server client, verifyWebhookSignature, all types, all errors
hyperserve-sdk/browser      → putVideoToStorage (File | Blob), safe for browser bundles
hyperserve-sdk/react-native → putVideoToStorage (URI string), safe for RN bundles
```

The `/browser` and `/react-native` exports contain no API key logic. The `react-native` condition in `package.json` exports ensures Metro bundler resolves the correct entry automatically.

---

## Package structure

```
hyperserve-sdk/
├── src/
│   ├── client.ts          # HyperserveClient — createVideo, completeUpload, uploadVideo, getVideo, delete*
│   ├── browser.ts         # putVideoToStorage (File | Blob)
│   ├── react-native.ts    # putVideoToStorage (URI string) — URI → Blob → PUT
│   ├── types.ts           # VideoResolution, VideoStatus, all option/result interfaces
│   ├── errors.ts          # error hierarchy
│   ├── normalize.ts       # Blob/Buffer/Stream → BodyInit + size inference (server only)
│   ├── storage.ts         # presigned PUT via fetch or XHR (shared)
│   └── index.ts           # re-exports client, types, errors
├── docs/
│   └── specification.md
├── tsconfig.json
├── package.json
└── README.md
```

Built with `tsup`. Outputs CJS + ESM + `.d.ts` for all three entry points. No runtime dependencies.

---

## What the SDK does not do

- **Polling** — does not poll for transcoding completion. Use webhooks or call `getVideo` in your own logic.
- **API key in client code** — the SDK does not support using an API key in the browser or React Native. Use the backend proxy pattern.
- **Retry on storage PUT** — the `retries` option on `HyperserveClient` applies to API calls only, not the storage PUT (`uploadVideo` / `putVideoToStorage`).
- **Chunked / multipart upload** — single-part PUT only. Reserved for files approaching the 5 GB limit.
- **Token refresh** — API keys are long-lived; no OAuth flow.
