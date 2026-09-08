import { describe, expect, it } from "vitest";
import { MAX_BUFFERED_STREAM_BYTES, normalizeFile } from "../normalize.js";

describe("normalizeFile — Blob", () => {
	it("uses blob.size when fileSizeBytes is not provided", async () => {
		const blob = new Blob(["hello"], { type: "video/mp4" });
		const result = await normalizeFile(blob, "clip.mp4");
		expect(result.size).toBe(blob.size);
		expect(result.body).toBe(blob);
	});

	it("uses provided fileSizeBytes over blob.size", async () => {
		const blob = new Blob(["hello"]);
		const result = await normalizeFile(blob, "clip.mp4", 9999);
		expect(result.size).toBe(9999);
	});
});

describe("normalizeFile — Buffer", () => {
	it("infers size from byteLength", async () => {
		const buf = Buffer.from("video data");
		const result = await normalizeFile(buf, "clip.mp4");
		expect(result.size).toBe(buf.byteLength);
	});

	it("uses provided fileSizeBytes over byteLength", async () => {
		const buf = Buffer.from("video data");
		const result = await normalizeFile(buf, "clip.mp4", 1234);
		expect(result.size).toBe(1234);
	});

	it("wraps Buffer in a Blob so body is a Blob", async () => {
		const buf = Buffer.from("video data");
		const result = await normalizeFile(buf, "clip.mp4");
		expect(result.body).toBeInstanceOf(Blob);
	});

	it("assigns content type hint from filename extension", async () => {
		const buf = Buffer.from("x");
		const result = await normalizeFile(buf, "clip.mp4");
		expect((result.body as Blob).type).toBe("video/mp4");
	});

	it("uses application/octet-stream for unknown extension", async () => {
		const buf = Buffer.from("x");
		const result = await normalizeFile(buf, "video.xyz");
		expect((result.body as Blob).type).toBe("application/octet-stream");
	});

	it("preserves buffer contents after wrapping", async () => {
		const original = Buffer.from("test content");
		const result = await normalizeFile(original, "clip.mp4");
		const text = await (result.body as Blob).text();
		expect(text).toBe("test content");
	});
});

function streamOf(text: string): ReadableStream {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

describe("normalizeFile — ReadableStream", () => {
	it("passes the stream through untouched when fileSizeBytes is provided", async () => {
		const stream = new ReadableStream();
		const result = await normalizeFile(stream, "clip.mp4", 5000);
		expect(result.body).toBe(stream);
		expect(result.size).toBe(5000);
	});

	it("buffers the stream to derive size when fileSizeBytes is not provided", async () => {
		const result = await normalizeFile(streamOf("video data"), "clip.mp4");
		expect(result.size).toBe(10);
	});

	it("replays buffered chunks as a stream rather than copying into a Blob", async () => {
		// A Blob copy would double peak memory for the whole file.
		const result = await normalizeFile(streamOf("video data"), "clip.mp4");
		expect(result.body).toBeInstanceOf(ReadableStream);
	});

	it("preserves stream contents when buffering", async () => {
		const result = await normalizeFile(streamOf("test content"), "clip.mp4");
		const text = await new Response(result.body as ReadableStream).text();
		expect(text).toBe("test content");
	});

	it("copies chunks so a producer reusing its buffer cannot corrupt the replay", async () => {
		// Some producers enqueue the same Uint8Array repeatedly, refilling it between
		// pulls. Retaining those references would replay the final chunk N times.
		const shared = new Uint8Array(4);
		let pulls = 0;
		const reusing = new ReadableStream({
			pull(controller) {
				if (pulls >= 3) return controller.close();
				shared.fill(65 + pulls); // "AAAA", then "BBBB", then "CCCC"
				controller.enqueue(shared);
				pulls += 1;
			},
		});

		const result = await normalizeFile(reusing, "clip.mp4");
		const text = await new Response(result.body as ReadableStream).text();

		expect(text).toBe("AAAABBBBCCCC");
	});

	it("throws a TypeError naming fileSizeBytes when the stream exceeds the buffer limit", async () => {
		const oversized = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(MAX_BUFFERED_STREAM_BYTES + 1));
				controller.close();
			},
		});

		await expect(normalizeFile(oversized, "clip.mp4")).rejects.toThrow(TypeError);
	});

	it("names fileSizeBytes as the fix when the buffer limit is exceeded", async () => {
		const oversized = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(MAX_BUFFERED_STREAM_BYTES + 1));
				controller.close();
			},
		});

		await expect(normalizeFile(oversized, "clip.mp4")).rejects.toThrow(/fileSizeBytes/);
	});

	it("stops reading the source stream once the limit is exceeded", async () => {
		let chunksPulled = 0;
		const endless = new ReadableStream({
			pull(controller) {
				chunksPulled += 1;
				controller.enqueue(new Uint8Array(16 * 1024 * 1024));
			},
		});

		await expect(normalizeFile(endless, "clip.mp4")).rejects.toThrow(TypeError);
		// Bounded: it must not keep pulling the whole (infinite) stream into memory.
		expect(chunksPulled).toBeLessThanOrEqual(MAX_BUFFERED_STREAM_BYTES / (16 * 1024 * 1024) + 1);
	});
});

describe("normalizeFile — filename extension hints", () => {
	it.each([
		["clip.mov", "video/quicktime"],
		["clip.webm", "video/webm"],
		["clip.avi", "video/x-msvideo"],
		["clip.mkv", "video/x-matroska"],
		["clip.m4v", "video/x-m4v"],
	])("maps %s → %s", async (filename, expectedType) => {
		const buf = Buffer.from("x");
		const result = await normalizeFile(buf, filename);
		expect((result.body as Blob).type).toBe(expectedType);
	});
});
