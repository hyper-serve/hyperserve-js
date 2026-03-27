import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HyperserveApiError,
	HyperserveNotFoundError,
	HyperserveTimeoutError,
	HyperserveValidationError,
} from "../errors.js";
import { apiRequest } from "../http.js";

const BASE = "https://api.hyperserve.io";
const API_KEY = "hs_test_key";

function makeFetchResponse(
	status: number,
	body?: unknown,
	ok?: boolean,
): Response {
	return {
		ok: ok ?? (status >= 200 && status < 300),
		status,
		statusText: String(status),
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

describe("apiRequest", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sends X-API-KEY header", async () => {
		vi.mocked(fetch).mockResolvedValue(
			makeFetchResponse(200, { id: "abc" }),
		);

		await apiRequest({ method: "GET", url: `${BASE}/api/video/1/public`, apiKey: API_KEY, timeoutMs: 5000 });

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe(API_KEY);
	});

	it("sets Content-Type for requests with a body", async () => {
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(201, { id: "abc" }));

		await apiRequest({
			method: "POST",
			url: `${BASE}/api/video`,
			apiKey: API_KEY,
			timeoutMs: 5000,
			body: { filename: "clip.mp4" },
		});

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
	});

	it("does not set Content-Type when there is no body", async () => {
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(200, { id: "abc" }));

		await apiRequest({ method: "GET", url: `${BASE}/api/video/1/public`, apiKey: API_KEY, timeoutMs: 5000 });

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
	});

	it("serialises body as JSON", async () => {
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(201, {}));

		const body = { filename: "clip.mp4", fileSizeBytes: 1024 };
		await apiRequest({ method: "POST", url: `${BASE}/api/video`, apiKey: API_KEY, timeoutMs: 5000, body });

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(init.body).toBe(JSON.stringify(body));
	});

	it("returns parsed JSON on success", async () => {
		const payload = { id: "uuid-1", uploadUrl: "https://s3.example.com/put" };
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(201, payload));

		const result = await apiRequest<typeof payload>({
			method: "POST",
			url: `${BASE}/api/video`,
			apiKey: API_KEY,
			timeoutMs: 5000,
			body: {},
		});

		expect(result).toEqual(payload);
	});

	it("returns undefined for 204 No Content", async () => {
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(204, undefined));

		const result = await apiRequest<void>({
			method: "DELETE",
			url: `${BASE}/api/video/1`,
			apiKey: API_KEY,
			timeoutMs: 5000,
		});

		expect(result).toBeUndefined();
	});

	it("throws HyperserveNotFoundError on 404", async () => {
		vi.mocked(fetch).mockResolvedValue(
			makeFetchResponse(404, { message: "Video not found" }, false),
		);

		await expect(
			apiRequest({ method: "GET", url: `${BASE}/api/video/missing/public`, apiKey: API_KEY, timeoutMs: 5000 }),
		).rejects.toBeInstanceOf(HyperserveNotFoundError);
	});

	it("throws HyperserveValidationError on 400", async () => {
		vi.mocked(fetch).mockResolvedValue(
			makeFetchResponse(400, { message: "Unsupported file extension" }, false),
		);

		const err = await apiRequest({
			method: "POST",
			url: `${BASE}/api/video`,
			apiKey: API_KEY,
			timeoutMs: 5000,
			body: {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(HyperserveValidationError);
		expect((err as HyperserveValidationError).statusCode).toBe(400);
		expect((err as HyperserveValidationError).message).toBe("Unsupported file extension");
	});

	it("throws HyperserveValidationError on 422", async () => {
		vi.mocked(fetch).mockResolvedValue(
			makeFetchResponse(422, { message: "Validation failed" }, false),
		);

		await expect(
			apiRequest({ method: "POST", url: `${BASE}/api/video`, apiKey: API_KEY, timeoutMs: 5000, body: {} }),
		).rejects.toBeInstanceOf(HyperserveValidationError);
	});

	it("throws HyperserveApiError on 500", async () => {
		vi.mocked(fetch).mockResolvedValue(
			makeFetchResponse(500, { message: "Internal server error" }, false),
		);

		const err = await apiRequest({
			method: "GET",
			url: `${BASE}/api/video/1/public`,
			apiKey: API_KEY,
			timeoutMs: 5000,
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(HyperserveApiError);
		expect((err as HyperserveApiError).statusCode).toBe(500);
	});

	it("throws HyperserveTimeoutError when fetch aborts", async () => {
		vi.mocked(fetch).mockImplementation(() => {
			const err = new Error("The operation was aborted");
			err.name = "AbortError";
			return Promise.reject(err);
		});

		await expect(
			apiRequest({ method: "GET", url: `${BASE}/api/video/1/public`, apiKey: API_KEY, timeoutMs: 100 }),
		).rejects.toBeInstanceOf(HyperserveTimeoutError);
	});

	it("re-throws non-abort fetch errors", async () => {
		vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(
			apiRequest({ method: "GET", url: `${BASE}/api/video/1/public`, apiKey: API_KEY, timeoutMs: 5000 }),
		).rejects.toBeInstanceOf(TypeError);
	});

	it("falls back to statusText when error body has no message", async () => {
		vi.mocked(fetch).mockResolvedValue(makeFetchResponse(503, {}, false));

		const err = await apiRequest({
			method: "GET",
			url: `${BASE}/api/video/1/public`,
			apiKey: API_KEY,
			timeoutMs: 5000,
		}).catch((e: unknown) => e);

		expect((err as HyperserveApiError).message).toBe("503");
	});
});
