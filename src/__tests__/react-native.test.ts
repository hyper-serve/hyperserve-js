import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HyperserveError,
	HyperserveTimeoutError,
	HyperserveUploadError,
	putVideoToStorage,
} from "../react-native.js";

const UPLOAD_URL = "https://s3.example.com/put/video-uuid";
const CONTENT_TYPE = "video/mp4";
const LOCAL_URI = "file:///var/mobile/Containers/Data/video.mp4";

function makeBlob(content = "video bytes"): Blob {
	return new Blob([content], { type: "video/mp4" });
}

describe("putVideoToStorage (react-native)", () => {
	beforeEach(() => {
		// Stub global fetch — used for both the local file URI read and the storage PUT
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("XMLHttpRequest", undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches the local URI to obtain a Blob before uploading", async () => {
		const blob = makeBlob();

		vi.mocked(fetch)
			// First call: read local file URI
			.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response)
			// Second call: storage PUT
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

		await putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI });

		const [localFetchUrl] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(localFetchUrl).toBe(LOCAL_URI);
	});

	it("PUTs the blob to the uploadUrl with the correct Content-Type", async () => {
		const blob = makeBlob();

		vi.mocked(fetch)
			.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

		await putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI });

		const [putUrl, putInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
		expect(putUrl).toBe(UPLOAD_URL);
		expect(putInit.method).toBe("PUT");
		expect((putInit.headers as Record<string, string>)["Content-Type"]).toBe(CONTENT_TYPE);
	});

	it("resolves on successful upload", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(makeBlob()) } as unknown as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

		await expect(
			putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI }),
		).resolves.toBeUndefined();
	});

	it("throws HyperserveUploadError when the storage PUT fails", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(makeBlob()) } as unknown as Response)
			.mockResolvedValueOnce({ ok: false, status: 403 } as Response);

		await expect(
			putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI }),
		).rejects.toBeInstanceOf(HyperserveUploadError);
	});

	it("propagates errors from the local URI fetch", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Network request failed"));

		await expect(
			putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI }),
		).rejects.toBeInstanceOf(TypeError);
	});

	it("throws HyperserveUploadError when the local URI fetch resolves with ok: false", async () => {
		vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 0 } as unknown as Response);

		await expect(
			putVideoToStorage({ uploadUrl: UPLOAD_URL, contentType: CONTENT_TYPE, uri: LOCAL_URI }),
		).rejects.toBeInstanceOf(HyperserveUploadError);
	});
});

describe("putVideoToStorage (react-native) — onProgress via XHR", () => {
	let mockXhr: {
		open: ReturnType<typeof vi.fn>;
		setRequestHeader: ReturnType<typeof vi.fn>;
		send: ReturnType<typeof vi.fn>;
		status: number;
		upload: { addEventListener: ReturnType<typeof vi.fn> };
		listeners: Map<string, () => void>;
		addEventListener(event: string, cb: () => void): void;
		triggerLoad(): void;
		triggerUploadProgress(loaded: number, total: number): void;
	};

	beforeEach(() => {
		mockXhr = {
			open: vi.fn(),
			setRequestHeader: vi.fn(),
			send: vi.fn(),
			status: 200,
			upload: { addEventListener: vi.fn() },
			listeners: new Map(),
			addEventListener(event: string, cb: () => void) {
				this.listeners.set(event, cb);
			},
			triggerLoad() {
				this.listeners.get("load")?.();
			},
			triggerUploadProgress(loaded: number, total: number) {
				for (const [event, cb] of this.upload.addEventListener.mock.calls as [string, (e: ProgressEvent) => void][]) {
					if (event === "progress") {
						cb({ lengthComputable: true, loaded, total } as ProgressEvent);
					}
				}
			},
		};

		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("XMLHttpRequest", function XHRMock() {
			return mockXhr;
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("calls onProgress with upload percentage", async () => {
		const blob = makeBlob();
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			blob: () => Promise.resolve(blob),
		} as unknown as Response);

		const onProgress = vi.fn();
		const promise = putVideoToStorage({
			uploadUrl: UPLOAD_URL,
			contentType: CONTENT_TYPE,
			uri: LOCAL_URI,
			onProgress,
		});

		// Yield to let fetch(uri) and blob() resolve before the XHR is created
		await new Promise((resolve) => setTimeout(resolve, 0));

		mockXhr.triggerUploadProgress(250_000, 1_000_000);
		mockXhr.triggerLoad();
		await promise;

		expect(onProgress).toHaveBeenCalledWith(25);
		expect(onProgress).toHaveBeenLastCalledWith(100);
	});
});

describe("react-native entry — exports", () => {
	it("exports HyperserveError", () => {
		expect(HyperserveError).toBeDefined();
	});

	it("exports HyperserveUploadError as instanceof HyperserveError", () => {
		expect(new HyperserveUploadError("test")).toBeInstanceOf(HyperserveError);
	});

	it("exports HyperserveTimeoutError as instanceof HyperserveError", () => {
		expect(new HyperserveTimeoutError()).toBeInstanceOf(HyperserveError);
	});
});
