// src/errors.ts
var HyperserveError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HyperserveError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HyperserveValidationError = class extends HyperserveError {
  constructor(message, statusCode, detail) {
    super(message, statusCode);
    this.detail = detail;
    this.name = "HyperserveValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HyperserveNotFoundError = class extends HyperserveError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "HyperserveNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HyperserveApiError = class extends HyperserveError {
  constructor(message, statusCode) {
    super(message, statusCode);
    this.name = "HyperserveApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HyperserveUploadError = class extends HyperserveError {
  constructor(message, uploadStatus) {
    super(message);
    this.uploadStatus = uploadStatus;
    this.name = "HyperserveUploadError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HyperserveTimeoutError = class extends HyperserveError {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "HyperserveTimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/http.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryable(err) {
  if (err instanceof HyperserveApiError && err.statusCode !== void 0 && err.statusCode >= 500)
    return true;
  if (err instanceof Error && !(err instanceof HyperserveError)) return true;
  return false;
}
async function apiRequest(options) {
  const { retries = 0 } = options;
  let attempt = 0;
  while (true) {
    try {
      return await attemptRequest(options);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) {
        throw err;
      }
      const delay = Math.random() * Math.min(1e4, 100 * 2 ** attempt);
      await sleep(delay);
      attempt++;
    }
  }
}
async function attemptRequest(options) {
  const { method, url, apiKey, timeoutMs, body } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": apiKey,
        ...body !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      // Omit body entirely when not present — passing body: null on DELETE requests
      // can be treated differently by some proxies and intermediaries.
      ...body !== void 0 ? { body: JSON.stringify(body) } : {},
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HyperserveTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) {
    if (response.status === 204) {
      return void 0;
    }
    try {
      return await response.json();
    } catch {
      throw new HyperserveApiError(`Failed to parse response from ${url}`, response.status);
    }
  }
  let errorBody = {};
  try {
    errorBody = await response.json();
  } catch {
  }
  const message = errorBody.message ?? response.statusText;
  if (response.status === 404) {
    throw new HyperserveNotFoundError(message);
  }
  if (response.status >= 400 && response.status < 500) {
    throw new HyperserveValidationError(message, response.status, errorBody);
  }
  throw new HyperserveApiError(message, response.status);
}

// src/normalize.ts
function normalizeFile(file, filename, fileSizeBytes) {
  if (file instanceof ReadableStream) {
    if (fileSizeBytes === void 0) {
      throw new TypeError(
        "fileSizeBytes is required when file is a ReadableStream (size cannot be inferred)"
      );
    }
    return { body: file, size: fileSizeBytes };
  }
  if (Buffer.isBuffer(file)) {
    const size2 = fileSizeBytes ?? file.byteLength;
    const blob = new Blob([new Uint8Array(file)], { type: deriveTypeHint(filename) });
    return { body: blob, size: size2 };
  }
  const size = fileSizeBytes ?? file.size;
  return { body: file, size };
}
function deriveTypeHint(filename) {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const map = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    m4v: "video/x-m4v"
  };
  return map[ext] ?? "application/octet-stream";
}

// src/storage.ts
async function putToStorage(uploadUrl, contentType, body, onProgress) {
  return putWithFetch(uploadUrl, contentType, body);
}
function putWithFetch(uploadUrl, contentType, body) {
  return fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    // duplex is required for ReadableStream bodies in some runtimes (Node 18)
    ...body instanceof ReadableStream ? { duplex: "half" } : {},
    body
  }).then((response) => {
    if (!response.ok) {
      throw new HyperserveUploadError(
        `Storage PUT failed with status ${response.status}`,
        response.status
      );
    }
  });
}

// src/client.ts
var DEFAULT_BASE_URL = "https://api.hyperserve.io/api";
var DEFAULT_TIMEOUT_MS = 3e4;
var HyperserveClient = class {
  constructor(options) {
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
  async createVideo(options) {
    return apiRequest({
      method: "POST",
      url: `${this.baseUrl}/video`,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      body: {
        filename: options.filename,
        fileSizeBytes: options.fileSizeBytes,
        resolutions: options.resolutions,
        isPublic: options.isPublic,
        ...options.thumbnailTimestampsSeconds !== void 0 && {
          thumbnail_timestamps_seconds: options.thumbnailTimestampsSeconds
        },
        ...options.customMetadata !== void 0 && {
          custom_user_metadata: options.customMetadata
        }
      }
    });
  }
  /**
   * Notifies Hyperserve that the file has been uploaded to the presigned URL.
   * Hyperserve verifies the object and queues transcoding.
   * Call this after your frontend confirms the storage PUT is complete.
   */
  async completeUpload(videoId) {
    return apiRequest({
      method: "POST",
      url: `${this.baseUrl}/video/${videoId}/complete-upload`,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      retries: this.retries
    });
  }
  /**
   * Retrieves the current state of a video, including per-resolution status and playback URLs.
   *
   * @param videoId - The video ID returned by createVideo or uploadVideo.
   * @param options.private - Return time-limited signed URLs instead of public URLs.
   * @param options.expirationSeconds - Signed URL TTL when private is true. Defaults to 3600.
   */
  async getVideo(videoId, options) {
    const isPrivate = options?.private === true;
    const expiration = options?.expirationSeconds ?? 3600;
    const url = isPrivate ? `${this.baseUrl}/video/${videoId}/private/${expiration}` : `${this.baseUrl}/video/${videoId}/public`;
    return apiRequest({
      method: "GET",
      url,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      retries: this.retries
    });
  }
  /**
   * Deletes a video and all associated resolutions and thumbnails.
   */
  async deleteVideo(videoId) {
    return apiRequest({
      method: "DELETE",
      url: `${this.baseUrl}/video/${videoId}`,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      retries: this.retries
    });
  }
  /**
   * Deletes a single resolution for a video.
   */
  async deleteResolution(resolutionId) {
    return apiRequest({
      method: "DELETE",
      url: `${this.baseUrl}/video/resolution/${resolutionId}`,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      retries: this.retries
    });
  }
  /**
   * Convenience method for server-side / script use cases.
   * Wraps createVideo, the storage PUT, and completeUpload into a single call.
   *
   * Not suitable for the browser proxy pattern — use createVideo + putVideoToStorage
   * from '@hyperserve/hyperserve-js/browser' + completeUpload separately for that flow.
   */
  async uploadVideo(options) {
    const { file, filename, resolutions, isPublic, thumbnailTimestampsSeconds, customMetadata } = options;
    const normalized = normalizeFile(file, filename, options.fileSizeBytes);
    const upload = await this.createVideo({
      filename,
      fileSizeBytes: normalized.size,
      resolutions,
      isPublic,
      ...thumbnailTimestampsSeconds !== void 0 && { thumbnailTimestampsSeconds },
      ...customMetadata !== void 0 && { customMetadata }
    });
    await putToStorage(upload.uploadUrl, upload.contentType, normalized.body);
    return this.completeUpload(upload.id);
  }
};

// src/webhook.ts
var DEFAULT_TOLERANCE_MS = 3e5;
async function verifyWebhookSignature(options) {
  const { signature, secret, body, toleranceMs = DEFAULT_TOLERANCE_MS } = options;
  const dotIndex = signature.indexOf(".");
  if (dotIndex === -1) return false;
  const timestampStr = signature.slice(0, dotIndex);
  const receivedHex = signature.slice(dotIndex + 1);
  const timestamp = Number(timestampStr);
  if (!Number.isInteger(timestamp) || timestamp < 0) return false;
  if (Math.abs(Date.now() - timestamp) > toleranceMs) return false;
  const receivedBytes = hexToBytes(receivedHex);
  if (receivedBytes === null) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    receivedBytes,
    encoder.encode(`${timestampStr}.${body}`)
  );
}
function hexToBytes(hex) {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < hex.length; i += 2) {
    const value = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(value)) return null;
    bytes[i / 2] = value;
  }
  return bytes;
}

export { HyperserveApiError, HyperserveClient, HyperserveError, HyperserveNotFoundError, HyperserveTimeoutError, HyperserveUploadError, HyperserveValidationError, verifyWebhookSignature };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map