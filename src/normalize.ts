/**
 * Normalizes the various accepted file input types into a { body, size } pair
 * suitable for use as a fetch/XHR request body.
 *
 * Size inference rules:
 *   Blob / File  → blob.size
 *   Buffer       → buffer.byteLength
 *   ReadableStream → must be provided via fileSizeBytes
 */
export interface NormalizedFile {
	body: Blob | ReadableStream;
	size: number;
}

export function normalizeFile(
	file: Blob | Buffer | ReadableStream,
	filename: string,
	fileSizeBytes?: number,
): NormalizedFile {
	if (file instanceof ReadableStream) {
		if (fileSizeBytes === undefined) {
			throw new TypeError(
				"fileSizeBytes is required when file is a ReadableStream (size cannot be inferred)",
			);
		}
		return { body: file, size: fileSizeBytes };
	}

	// Node.js Buffer
	if (Buffer.isBuffer(file)) {
		const size = fileSizeBytes ?? file.byteLength;
		// Wrap in a Blob so fetch/XHR handle it uniformly
		// Copy into a plain ArrayBuffer to avoid SharedArrayBuffer assignability issues
		const blob = new Blob([new Uint8Array(file)], { type: deriveTypeHint(filename) });
		return { body: blob, size };
	}

	// Blob / File
	const size = fileSizeBytes ?? file.size;
	return { body: file, size };
}

function deriveTypeHint(filename: string): string {
	// Minimal hint — the actual Content-Type for the presigned PUT always
	// comes from the server, not from this inference. This is only used
	// so the Blob is constructed with a reasonable type attribute.
	const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
	const map: Record<string, string> = {
		mp4: "video/mp4",
		mov: "video/quicktime",
		webm: "video/webm",
		avi: "video/x-msvideo",
		mkv: "video/x-matroska",
		m4v: "video/x-m4v",
	};
	return map[ext] ?? "application/octet-stream";
}
