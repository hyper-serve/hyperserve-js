import { HyperserveTimeoutError, HyperserveUploadError } from "./errors.js";

/**
 * PUT a file to a presigned S3 URL.
 * Used internally by uploadVideo (server) and exported as putVideoToStorage (browser).
 *
 * When onProgress is provided, uses XMLHttpRequest for upload progress events.
 * Falls back to fetch otherwise.
 */
export async function putToStorage(
	uploadUrl: string,
	contentType: string,
	body: Blob | ReadableStream,
	onProgress?: (percent: number) => void,
): Promise<void> {
	// XHR is used for progress reporting but does not support ReadableStream bodies.
	// Fall back to fetch (no progress) when the body is a stream.
	if (
		onProgress !== undefined &&
		typeof XMLHttpRequest !== "undefined" &&
		!(body instanceof ReadableStream)
	) {
		return putWithXhr(uploadUrl, contentType, body, onProgress);
	}
	return putWithFetch(uploadUrl, contentType, body);
}

function putWithFetch(
	uploadUrl: string,
	contentType: string,
	body: Blob | ReadableStream,
): Promise<void> {
	return fetch(uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		// duplex is required for ReadableStream bodies in some runtimes (Node 18)
		...(body instanceof ReadableStream ? { duplex: "half" } : {}),
		body: body as BodyInit,
	}).then((response) => {
		if (!response.ok) {
			throw new HyperserveUploadError(
				`Storage PUT failed with status ${response.status}`,
				response.status,
			);
		}
	});
}

function putWithXhr(
	uploadUrl: string,
	contentType: string,
	body: Blob,
	onProgress: (percent: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		xhr.open("PUT", uploadUrl);
		xhr.setRequestHeader("Content-Type", contentType);

		xhr.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				onProgress(Math.round((event.loaded / event.total) * 100));
			}
		});

		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				onProgress(100);
				resolve();
			} else {
				reject(
					new HyperserveUploadError(`Storage PUT failed with status ${xhr.status}`, xhr.status),
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
