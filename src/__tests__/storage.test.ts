import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperserveTimeoutError, HyperserveUploadError } from "../errors.js";
import { putToStorage } from "../storage.js";

// ---------------------------------------------------------------------------
// XHR mock — simulates the event-based XMLHttpRequest upload API
// ---------------------------------------------------------------------------

class MockXhr {
	open = vi.fn();
	setRequestHeader = vi.fn();
	send = vi.fn();
	status = 200;
	upload = { addEventListener: vi.fn() };

	private listeners = new Map<string, () => void>();

	addEventListener(event: string, cb: () => void) {
		this.listeners.set(event, cb);
	}

	/** Trigger upload progress event */
	triggerUploadProgress(loaded: number, total: number) {
		const listeners = this.upload.addEventListener.mock.calls;
		for (const [event, cb] of listeners as [string, (e: ProgressEvent) => void][]) {
			if (event === "progress") {
				cb({ lengthComputable: true, loaded, total } as ProgressEvent);
			}
		}
	}

	/** Trigger the load event (request complete) */
	triggerLoad() {
		this.listeners.get("load")?.();
	}

	/** Trigger the timeout event */
	triggerTimeout() {
		this.listeners.get("timeout")?.();
	}

	/** Trigger the error event */
	triggerError() {
		this.listeners.get("error")?.();
	}
}

let mockXhr: MockXhr;

describe("putToStorage — fetch path (no onProgress)", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
		// Ensure XMLHttpRequest is not defined so the fetch path is always taken
		vi.stubGlobal("XMLHttpRequest", undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sends PUT with correct URL and Content-Type", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		await putToStorage("https://s3.example.com/put", "video/mp4", new Blob(["x"]));

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://s3.example.com/put");
		expect((init.headers as Record<string, string>)["Content-Type"]).toBe("video/mp4");
		expect(init.method).toBe("PUT");
	});

	it("adds duplex: half for ReadableStream body", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		const stream = new ReadableStream();
		await putToStorage("https://s3.example.com/put", "video/mp4", stream);

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit & { duplex?: string }];
		expect(init.duplex).toBe("half");
	});

	it("does not add duplex for Blob body", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

		await putToStorage("https://s3.example.com/put", "video/mp4", new Blob(["x"]));

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit & { duplex?: string }];
		expect(init.duplex).toBeUndefined();
	});

	it("resolves on 200", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
		await expect(
			putToStorage("https://s3.example.com/put", "video/mp4", new Blob(["x"])),
		).resolves.toBeUndefined();
	});

	it("throws HyperserveUploadError on non-2xx status", async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

		const err = await putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
		).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(HyperserveUploadError);
		expect((err as HyperserveUploadError).uploadStatus).toBe(403);
	});
});

describe("putToStorage — XHR path (onProgress provided)", () => {
	beforeEach(() => {
		mockXhr = new MockXhr();
		// Use a regular function (not arrow) so `new XMLHttpRequest()` works.
		// Returning an object from a constructor causes JS to use the returned
		// object instead of `this`, giving us the shared mockXhr instance.
		vi.stubGlobal("XMLHttpRequest", function XHRMock() {
			return mockXhr;
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("opens PUT request with the correct URL", async () => {
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerLoad();
		await promise;
		expect(mockXhr.open).toHaveBeenCalledWith("PUT", "https://s3.example.com/put");
	});

	it("sets Content-Type header", async () => {
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/webm",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerLoad();
		await promise;
		expect(mockXhr.setRequestHeader).toHaveBeenCalledWith("Content-Type", "video/webm");
	});

	it("calls onProgress with computed percentage", async () => {
		const onProgress = vi.fn();
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			onProgress,
		);

		mockXhr.triggerUploadProgress(500_000, 1_000_000);
		mockXhr.triggerLoad();
		await promise;

		expect(onProgress).toHaveBeenCalledWith(50);
	});

	it("calls onProgress(100) on successful load", async () => {
		const onProgress = vi.fn();
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			onProgress,
		);
		mockXhr.triggerLoad();
		await promise;
		expect(onProgress).toHaveBeenLastCalledWith(100);
	});

	it("resolves when xhr load fires with 2xx status", async () => {
		mockXhr.status = 200;
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerLoad();
		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects with HyperserveUploadError when load fires with non-2xx", async () => {
		mockXhr.status = 403;
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerLoad();

		const err = await promise.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(HyperserveUploadError);
		expect((err as HyperserveUploadError).uploadStatus).toBe(403);
	});

	it("rejects with HyperserveTimeoutError on xhr timeout", async () => {
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerTimeout();

		await expect(promise).rejects.toBeInstanceOf(HyperserveTimeoutError);
	});

	it("rejects with HyperserveUploadError on xhr error", async () => {
		const promise = putToStorage(
			"https://s3.example.com/put",
			"video/mp4",
			new Blob(["x"]),
			vi.fn(),
		);
		mockXhr.triggerError();

		await expect(promise).rejects.toBeInstanceOf(HyperserveUploadError);
	});

	it("sends the blob body via xhr.send", async () => {
		const blob = new Blob(["video bytes"]);
		const promise = putToStorage("https://s3.example.com/put", "video/mp4", blob, vi.fn());
		mockXhr.triggerLoad();
		await promise;
		expect(mockXhr.send).toHaveBeenCalledWith(blob);
	});
});
