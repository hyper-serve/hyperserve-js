import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HyperserveError,
	HyperserveTimeoutError,
	HyperserveUploadError,
	putVideoToStorage,
} from "../browser.js";

describe("putVideoToStorage", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
		// No XHR in this suite — use fetch path
		vi.stubGlobal("XMLHttpRequest", undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("PUTs to the provided uploadUrl", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		const file = new Blob(["bytes"], { type: "video/mp4" });
		await putVideoToStorage({
			uploadUrl: "https://s3.example.com/put/abc",
			contentType: "video/mp4",
			file,
		});

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://s3.example.com/put/abc");
		expect(init.method).toBe("PUT");
	});

	it("sets the Content-Type header from options", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		await putVideoToStorage({
			uploadUrl: "https://s3.example.com/put/abc",
			contentType: "video/webm",
			file: new Blob(["bytes"]),
		});

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Content-Type"]).toBe("video/webm");
	});

	it("resolves on success", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		await expect(
			putVideoToStorage({
				uploadUrl: "https://s3.example.com/put/abc",
				contentType: "video/mp4",
				file: new Blob(["bytes"]),
			}),
		).resolves.toBeUndefined();
	});

	it("throws HyperserveUploadError on non-2xx", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

		await expect(
			putVideoToStorage({
				uploadUrl: "https://s3.example.com/put/abc",
				contentType: "video/mp4",
				file: new Blob(["bytes"]),
			}),
		).rejects.toBeInstanceOf(HyperserveUploadError);
	});
});

describe("browser entry — exports", () => {
	it("exports HyperserveError", () => {
		expect(HyperserveError).toBeDefined();
	});

	it("exports HyperserveUploadError", () => {
		expect(HyperserveUploadError).toBeDefined();
		expect(new HyperserveUploadError("test")).toBeInstanceOf(HyperserveError);
	});

	it("exports HyperserveTimeoutError", () => {
		expect(HyperserveTimeoutError).toBeDefined();
		expect(new HyperserveTimeoutError()).toBeInstanceOf(HyperserveError);
	});
});
