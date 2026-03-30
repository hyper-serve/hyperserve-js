'use strict';

// src/errors.ts
var HyperserveError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HyperserveError";
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

// src/storage.ts
async function putToStorage(uploadUrl, contentType, body, onProgress) {
  if (onProgress !== void 0 && typeof XMLHttpRequest !== "undefined") {
    return putWithXhr(uploadUrl, contentType, body, onProgress);
  }
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
function putWithXhr(uploadUrl, contentType, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round(event.loaded / event.total * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(
          new HyperserveUploadError(`Storage PUT failed with status ${xhr.status}`, xhr.status)
        );
      }
    });
    xhr.addEventListener("timeout", () => {
      reject(new HyperserveTimeoutError("Storage PUT timed out"));
    });
    xhr.addEventListener("error", () => {
      reject(new HyperserveUploadError("Storage PUT failed due to a network error"));
    });
    xhr.send(body);
  });
}

// src/react-native.ts
async function putVideoToStorage(options) {
  const { uploadUrl, contentType, uri, onProgress } = options;
  const localResponse = await fetch(uri);
  if (!localResponse.ok) {
    throw new HyperserveUploadError(`Failed to read local file: ${uri}`);
  }
  const blob = await localResponse.blob();
  return putToStorage(uploadUrl, contentType, blob, onProgress);
}

exports.HyperserveError = HyperserveError;
exports.HyperserveTimeoutError = HyperserveTimeoutError;
exports.HyperserveUploadError = HyperserveUploadError;
exports.putVideoToStorage = putVideoToStorage;
//# sourceMappingURL=react-native.cjs.map
//# sourceMappingURL=react-native.cjs.map