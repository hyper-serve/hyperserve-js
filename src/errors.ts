/**
 * Base class for all Hyperserve SDK errors.
 */
export class HyperserveError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
	) {
		super(message);
		this.name = "HyperserveError";
		// Maintain proper prototype chain in transpiled environments
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * The Hyperserve API returned a 4xx response.
 * Typically indicates a validation problem: unsupported file format,
 * file too large, invalid resolutions, video not in expected state, etc.
 */
export class HyperserveValidationError extends HyperserveError {
	constructor(
		message: string,
		statusCode: number,
		public readonly detail?: unknown,
	) {
		super(message, statusCode);
		this.name = "HyperserveValidationError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * The Hyperserve API returned a 404 response.
 */
export class HyperserveNotFoundError extends HyperserveError {
	constructor(message = "Resource not found") {
		super(message, 404);
		this.name = "HyperserveNotFoundError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * The Hyperserve API returned a 5xx response.
 */
export class HyperserveApiError extends HyperserveError {
	constructor(message: string, statusCode: number) {
		super(message, statusCode);
		this.name = "HyperserveApiError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * The storage PUT request failed.
 */
export class HyperserveUploadError extends HyperserveError {
	constructor(
		message: string,
		public readonly uploadStatus?: number,
	) {
		super(message);
		this.name = "HyperserveUploadError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * A request exceeded the configured timeoutMs.
 */
export class HyperserveTimeoutError extends HyperserveError {
	constructor(message = "Request timed out") {
		super(message);
		this.name = "HyperserveTimeoutError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * An incoming webhook could not be trusted or understood. Thrown by unwrapWebhook.
 *
 * `reason` is "invalid_signature" when the request failed verification (respond 401), or
 * "invalid_payload" when it was signed correctly but is not a recognized payload (respond 400).
 */
export class HyperserveWebhookError extends HyperserveError {
	constructor(
		message: string,
		public readonly reason: "invalid_signature" | "invalid_payload",
	) {
		super(message);
		this.name = "HyperserveWebhookError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}
