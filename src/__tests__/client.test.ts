import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperserveClient } from "../client.js";
import {
	HyperserveNotFoundError,
	HyperserveUploadError,
	HyperserveValidationError,
} from "../errors.js";
import type { CompleteUploadResult, CreateVideoResult, VideoResult } from "../types.js";

const API_KEY = "hs_test_key";
const BASE = "https://api.hyperserve.io";

function makeClient(overrides?: { baseUrl?: string; timeoutMs?: number }) {
	return new HyperserveClient({ apiKey: API_KEY, ...overrides });
}

function mockFetch(status: number, body?: unknown, ok?: boolean) {
	vi.mocked(fetch).mockResolvedValue({
		ok: ok ?? (status >= 200 && status < 300),
		status,
		statusText: String(status),
		json: () => Promise.resolve(body),
	} as unknown as Response);
}

const createVideoResponse: CreateVideoResult = {
	id: "video-uuid",
	uploadUrl: "https://s3.example.com/put/video-uuid",
	contentType: "video/mp4",
	isPublic: true,
	resolutions: { "1080p": { status: "pending_upload" } } as CreateVideoResult["resolutions"],
};

const completeUploadResponse: CompleteUploadResult = {
	id: "video-uuid",
	isPublic: true,
	resolutions: { "1080p": { status: "processing" } } as CompleteUploadResult["resolutions"],
};

const publicVideoResponse: VideoResult = {
	id: "video-uuid",
	status: "ready",
	isPublic: true,
	resolutions: {
		"1080p": {
			id: "res-uuid",
			status: "ready",
			videoUrl: "https://cdn.example.com/video-uuid/1080p.mp4",
			thumbnailImageUrls: [],
		},
	},
};

describe("HyperserveClient — createVideo", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("POSTs to /api/video with correct JSON body", async () => {
		mockFetch(201, createVideoResponse);
		const client = makeClient();

		await client.createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 1024,
			resolutions: ["1080p"],
			isPublic: true,
		});

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/video`);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			filename: "clip.mp4",
			fileSizeBytes: 1024,
			resolutions: ["1080p"],
			isPublic: true,
		});
	});

	it("includes optional fields when provided", async () => {
		mockFetch(201, createVideoResponse);

		await makeClient().createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 2048,
			resolutions: ["720p"],
			isPublic: false,
			thumbnailTimestampsSeconds: [5, 10],
			customMetadata: { campaign: "launch" },
		});

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.thumbnail_timestamps_seconds).toEqual([5, 10]);
		expect(body.custom_user_metadata).toEqual({ campaign: "launch" });
	});

	it("omits optional fields when not provided", async () => {
		mockFetch(201, createVideoResponse);

		await makeClient().createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 512,
			resolutions: ["480p"],
			isPublic: true,
		});

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body).not.toHaveProperty("thumbnail_timestamps_seconds");
		expect(body).not.toHaveProperty("custom_user_metadata");
	});

	it("returns the parsed response", async () => {
		mockFetch(201, createVideoResponse);

		const result = await makeClient().createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 1024,
			resolutions: ["1080p"],
			isPublic: true,
		});

		expect(result).toEqual(createVideoResponse);
	});

	it("throws HyperserveValidationError on 400", async () => {
		mockFetch(400, { message: "Unsupported file extension" }, false);

		await expect(
			makeClient().createVideo({
				filename: "clip.exe",
				fileSizeBytes: 100,
				resolutions: ["1080p"],
				isPublic: true,
			}),
		).rejects.toBeInstanceOf(HyperserveValidationError);
	});
});

describe("HyperserveClient — completeUpload", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	afterEach(() => vi.unstubAllGlobals());

	it("POSTs to /api/video/:id/complete-upload", async () => {
		mockFetch(201, completeUploadResponse);

		await makeClient().completeUpload("video-uuid");

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/video/video-uuid/complete-upload`);
		expect(init.method).toBe("POST");
	});

	it("returns the complete upload result", async () => {
		mockFetch(201, completeUploadResponse);

		const result = await makeClient().completeUpload("video-uuid");
		expect(result).toEqual(completeUploadResponse);
	});

	it("throws HyperserveValidationError when video is not awaiting upload", async () => {
		mockFetch(400, { message: "Video is not awaiting upload" }, false);

		await expect(makeClient().completeUpload("video-uuid")).rejects.toBeInstanceOf(
			HyperserveValidationError,
		);
	});
});

describe("HyperserveClient — getVideo", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	afterEach(() => vi.unstubAllGlobals());

	it("GETs the public endpoint by default", async () => {
		mockFetch(200, publicVideoResponse);

		await makeClient().getVideo("video-uuid");

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe(`${BASE}/api/video/video-uuid/public`);
	});

	it("GETs the private endpoint when private: true", async () => {
		mockFetch(200, publicVideoResponse);

		await makeClient().getVideo("video-uuid", { private: true });

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe(`${BASE}/api/video/video-uuid/private/3600`);
	});

	it("uses provided expirationSeconds in private URL", async () => {
		mockFetch(200, publicVideoResponse);

		await makeClient().getVideo("video-uuid", { private: true, expirationSeconds: 7200 });

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe(`${BASE}/api/video/video-uuid/private/7200`);
	});

	it("GETs the public endpoint when private: false is explicitly passed", async () => {
		mockFetch(200, publicVideoResponse);

		await makeClient().getVideo("video-uuid", { private: false });

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe(`${BASE}/api/video/video-uuid/public`);
	});

	it("throws HyperserveNotFoundError on 404", async () => {
		mockFetch(404, { message: "Video not found" }, false);

		await expect(makeClient().getVideo("missing-uuid")).rejects.toBeInstanceOf(
			HyperserveNotFoundError,
		);
	});

	it("returns the video result", async () => {
		mockFetch(200, publicVideoResponse);

		const result = await makeClient().getVideo("video-uuid");
		expect(result).toEqual(publicVideoResponse);
	});
});

describe("HyperserveClient — deleteVideo", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	afterEach(() => vi.unstubAllGlobals());

	it("sends DELETE to /api/video/:id", async () => {
		mockFetch(204, undefined);

		await makeClient().deleteVideo("video-uuid");

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/video/video-uuid`);
		expect(init.method).toBe("DELETE");
	});

	it("throws HyperserveNotFoundError on 404", async () => {
		mockFetch(404, { message: "Not found" }, false);

		await expect(makeClient().deleteVideo("missing")).rejects.toBeInstanceOf(
			HyperserveNotFoundError,
		);
	});
});

describe("HyperserveClient — deleteResolution", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	afterEach(() => vi.unstubAllGlobals());

	it("sends DELETE to /api/video/resolution/:id", async () => {
		mockFetch(204, undefined);

		await makeClient().deleteResolution("res-uuid");

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/video/resolution/res-uuid`);
		expect(init.method).toBe("DELETE");
	});
});

describe("HyperserveClient — uploadVideo (convenience)", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("XMLHttpRequest", undefined);
	});

	afterEach(() => vi.unstubAllGlobals());

	it("orchestrates createVideo → storage PUT → completeUpload", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(createVideoResponse),
			} as unknown as Response)
			// Storage PUT
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
			// completeUpload
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(completeUploadResponse),
			} as unknown as Response);

		const result = await makeClient().uploadVideo({
			file: Buffer.from("video data"),
			filename: "clip.mp4",
			resolutions: ["1080p"],
			isPublic: true,
		});

		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
		expect(result).toEqual(completeUploadResponse);
	});

	it("sends the storage PUT to the uploadUrl from createVideo", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(createVideoResponse),
			} as unknown as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(completeUploadResponse),
			} as unknown as Response);

		await makeClient().uploadVideo({
			file: Buffer.from("video data"),
			filename: "clip.mp4",
			resolutions: ["1080p"],
			isPublic: true,
		});

		const [putUrl, putInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
		expect(putUrl).toBe(createVideoResponse.uploadUrl);
		expect(putInit.method).toBe("PUT");
		expect((putInit.headers as Record<string, string>)["Content-Type"]).toBe(
			createVideoResponse.contentType,
		);
	});

	it("infers fileSizeBytes from Buffer when not provided", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(createVideoResponse),
			} as unknown as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(completeUploadResponse),
			} as unknown as Response);

		const buf = Buffer.from("video data");
		await makeClient().uploadVideo({
			file: buf,
			filename: "clip.mp4",
			resolutions: ["1080p"],
			isPublic: true,
		});

		const [, createInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const createBody = JSON.parse(createInit.body as string);
		expect(createBody.fileSizeBytes).toBe(buf.byteLength);
	});

	it("throws if createVideo fails", async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: "400",
			json: () => Promise.resolve({ message: "bad request" }),
		} as unknown as Response);

		await expect(
			makeClient().uploadVideo({
				file: Buffer.from("x"),
				filename: "clip.mp4",
				resolutions: ["1080p"],
				isPublic: true,
			}),
		).rejects.toBeInstanceOf(HyperserveValidationError);

		// Storage PUT and completeUpload should not be called
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
	});

	it("throws HyperserveUploadError if storage PUT fails", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(createVideoResponse),
			} as unknown as Response)
			// Storage PUT fails
			.mockResolvedValueOnce({ ok: false, status: 403 } as Response);

		await expect(
			makeClient().uploadVideo({
				file: Buffer.from("x"),
				filename: "clip.mp4",
				resolutions: ["1080p"],
				isPublic: true,
			}),
		).rejects.toBeInstanceOf(HyperserveUploadError);

		// completeUpload should not be called
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
	});

	it("throws if completeUpload fails", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: () => Promise.resolve(createVideoResponse),
			} as unknown as Response)
			.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "400",
				json: () => Promise.resolve({ message: "file not in storage" }),
			} as unknown as Response);

		await expect(
			makeClient().uploadVideo({
				file: Buffer.from("x"),
				filename: "clip.mp4",
				resolutions: ["1080p"],
				isPublic: true,
			}),
		).rejects.toBeInstanceOf(HyperserveValidationError);
	});
});

describe("HyperserveClient — baseUrl", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	afterEach(() => vi.unstubAllGlobals());

	it("strips trailing slash from baseUrl", async () => {
		mockFetch(201, createVideoResponse);

		await makeClient({ baseUrl: "https://custom.api.com/api/" }).createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 100,
			resolutions: ["480p"],
			isPublic: true,
		});

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe("https://custom.api.com/api/video");
	});

	it("uses custom baseUrl", async () => {
		mockFetch(201, createVideoResponse);

		await makeClient({ baseUrl: "http://localhost:3001/api" }).createVideo({
			filename: "clip.mp4",
			fileSizeBytes: 100,
			resolutions: ["480p"],
			isPublic: true,
		});

		const [url] = vi.mocked(fetch).mock.calls[0] as [string];
		expect(url).toBe("http://localhost:3001/api/video");
	});
});
