import {
	HyperserveApiError,
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
}

export async function apiRequest<T>(options: RequestOptions): Promise<T> {
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
			body: body !== undefined ? JSON.stringify(body) : null,
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
		return response.json() as Promise<T>;
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
