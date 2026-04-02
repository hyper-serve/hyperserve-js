import {
	HyperserveApiError,
	HyperserveError,
	HyperserveNotFoundError,
	HyperserveTimeoutError,
	HyperserveValidationError,
} from "./errors.js";

interface RequestOptions {
	method: "GET" | "POST" | "DELETE";
	url: string;
	apiKey: string;
	timeoutMs: number;
	body?: unknown;
	retries?: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
	// Retry on 5xx API errors only — not 4xx, not timeouts
	if (err instanceof HyperserveApiError && err.statusCode !== undefined && err.statusCode >= 500)
		return true;
	// Retry on network/infrastructure errors that aren't SDK-typed (e.g. TypeError: Failed to fetch)
	if (err instanceof Error && !(err instanceof HyperserveError)) return true;
	return false;
}

export async function apiRequest<T>(options: RequestOptions): Promise<T> {
	const { retries = 0 } = options;
	let attempt = 0;

	while (true) {
		try {
			return await attemptRequest<T>(options);
		} catch (err) {
			if (attempt >= retries || !isRetryable(err)) {
				throw err;
			}
			// Full jitter: random delay up to min(10s, 100ms × 2^attempt)
			const delay = Math.random() * Math.min(10_000, 100 * 2 ** attempt);
			await sleep(delay);
			attempt++;
		}
	}
}

async function attemptRequest<T>(options: RequestOptions): Promise<T> {
	const { method, url, apiKey, timeoutMs, body } = options;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;

	try {
		response = await fetch(url, {
			method,
			headers: {
				"X-API-KEY": apiKey,
				...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			// Omit body entirely when not present — passing body: null on DELETE requests
			// can be treated differently by some proxies and intermediaries.
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new HyperserveTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}

	if (response.ok) {
		// 204 No Content
		if (response.status === 204) {
			return undefined as T;
		}
		try {
			return (await response.json()) as T;
		} catch {
			throw new HyperserveApiError(
				`Failed to parse response from ${url}`,
				response.status,
			);
		}
	}

	let errorBody: { message?: string } = {};
	try {
		errorBody = (await response.json()) as { message?: string };
	} catch {
		// ignore parse failure — use status text
	}

	const message = errorBody.message ?? response.statusText;

	if (response.status === 404) {
		throw new HyperserveNotFoundError(message);
	}

	if (response.status >= 400 && response.status < 500) {
		throw new HyperserveValidationError(message, response.status, errorBody);
	}

	throw new HyperserveApiError(message, response.status);
}
