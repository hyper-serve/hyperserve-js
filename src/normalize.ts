/**
 * Normalizes the various accepted file input types into a { body, size } pair
 * suitable for use as a fetch/XHR request body. The size is only consumed for a
 * ReadableStream body, where it becomes the Content-Length header on the storage
 * PUT — S3-compatible storage rejects a chunked PUT with 411. Blob bodies carry
 * their own length, so the size is ignored for them.
 *
 * Size inference rules:
 *   Blob / File    → blob.size
 *   Buffer         → buffer.byteLength
 *   ReadableStream → fileSizeBytes when given, otherwise the stream is read
 *                    into memory and measured
 */
export interface NormalizedFile {
	body: Blob | ReadableStream;
	size: number;
}

/**
 * Ceiling on how much of a size-less ReadableStream will be held in memory.
 * Buffering costs roughly the file's own size in RSS, so this bounds a call
 * that would otherwise grow until the process is killed. Passing fileSizeBytes
 * skips buffering entirely and has no size ceiling.
 */
export const MAX_BUFFERED_STREAM_BYTES = 256 * 1024 * 1024;

export async function normalizeFile(
	file: Blob | Buffer | ReadableStream,
	filename: string,
	fileSizeBytes?: number,
): Promise<NormalizedFile> {
	if (file instanceof ReadableStream) {
		// With a known size the stream goes straight to the network, so the file
		// is never held in memory. Without one there is no way to measure it
		// short of reading it, so buffer rather than forcing the caller to
		// supply a number they may not have.
		if (fileSizeBytes === undefined) {
			return collectStream(file);
		}
		return { body: file, size: fileSizeBytes };
	}

	// Node.js Buffer. `Buffer` is a Node global; all explicitly supported edge runtimes
	// (Cloudflare Workers, Vercel Edge) ship a Buffer compatibility layer, so this is safe
	// for the stated server targets. Pure browser or RN bundles never reach this branch
	// because normalize.ts is not imported by the browser or react-native entry points.
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

/**
 * Reads a stream into memory to measure it, then hands back an equivalent stream
 * replaying the same chunks. Replaying rather than wrapping the chunks in a Blob
 * matters: a Blob copies, which would put two full copies of the file in memory
 * at once.
 */
async function collectStream(stream: ReadableStream): Promise<NormalizedFile> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined) continue;

			const chunk = value as Uint8Array;
			size += chunk.byteLength;

			if (size > MAX_BUFFERED_STREAM_BYTES) {
				throw new TypeError(
					`Cannot buffer a ReadableStream larger than ${formatMiB(MAX_BUFFERED_STREAM_BYTES)} to measure it. ` +
						"Pass fileSizeBytes to upload the stream without holding it in memory.",
				);
			}

			// Copy: a producer may reuse and refill the same buffer between pulls,
			// and retaining its reference would replay the last chunk N times.
			// Copying per chunk keeps peak memory at one copy of the file, unlike
			// wrapping the collected chunks in a Blob, which copies all of it again.
			chunks.push(new Uint8Array(chunk));
		}
	} finally {
		// Releases the source on the oversize path so it stops producing.
		await reader.cancel().catch(() => {});
	}

	return {
		body: new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			},
		}),
		size,
	};
}

function formatMiB(bytes: number): string {
	return `${bytes / (1024 * 1024)} MiB`;
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
