import { describe, expect, it } from "vitest";
import { normalizeFile } from "../normalize.js";

describe("normalizeFile — Blob", () => {
	it("uses blob.size when fileSizeBytes is not provided", () => {
		const blob = new Blob(["hello"], { type: "video/mp4" });
		const result = normalizeFile(blob, "clip.mp4");
		expect(result.size).toBe(blob.size);
		expect(result.body).toBe(blob);
	});

	it("uses provided fileSizeBytes over blob.size", () => {
		const blob = new Blob(["hello"]);
		const result = normalizeFile(blob, "clip.mp4", 9999);
		expect(result.size).toBe(9999);
	});
});

describe("normalizeFile — Buffer", () => {
	it("infers size from byteLength", () => {
		const buf = Buffer.from("video data");
		const result = normalizeFile(buf, "clip.mp4");
		expect(result.size).toBe(buf.byteLength);
	});

	it("uses provided fileSizeBytes over byteLength", () => {
		const buf = Buffer.from("video data");
		const result = normalizeFile(buf, "clip.mp4", 1234);
		expect(result.size).toBe(1234);
	});

	it("wraps Buffer in a Blob so body is a Blob", () => {
		const buf = Buffer.from("video data");
		const result = normalizeFile(buf, "clip.mp4");
		expect(result.body).toBeInstanceOf(Blob);
	});

	it("assigns content type hint from filename extension", async () => {
		const buf = Buffer.from("x");
		const result = normalizeFile(buf, "clip.mp4");
		expect((result.body as Blob).type).toBe("video/mp4");
	});

	it("uses application/octet-stream for unknown extension", async () => {
		const buf = Buffer.from("x");
		const result = normalizeFile(buf, "video.xyz");
		expect((result.body as Blob).type).toBe("application/octet-stream");
	});

	it("preserves buffer contents after wrapping", async () => {
		const original = Buffer.from("test content");
		const result = normalizeFile(original, "clip.mp4");
		const text = await (result.body as Blob).text();
		expect(text).toBe("test content");
	});
});

describe("normalizeFile — ReadableStream", () => {
	it("returns the stream as body", () => {
		const stream = new ReadableStream();
		const result = normalizeFile(stream, "clip.mp4", 5000);
		expect(result.body).toBe(stream);
		expect(result.size).toBe(5000);
	});

	it("throws TypeError when fileSizeBytes is not provided", () => {
		const stream = new ReadableStream();
		expect(() => normalizeFile(stream, "clip.mp4")).toThrow(TypeError);
		expect(() => normalizeFile(stream, "clip.mp4")).toThrow(
			"fileSizeBytes is required when file is a ReadableStream",
		);
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
		const result = normalizeFile(buf, filename);
		expect((result.body as Blob).type).toBe(expectedType);
	});
});
