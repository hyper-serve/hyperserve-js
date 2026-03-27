import { describe, expect, it } from "vitest";
import {
	HyperserveApiError,
	HyperserveError,
	HyperserveNotFoundError,
	HyperserveTimeoutError,
	HyperserveUploadError,
	HyperserveValidationError,
} from "../errors.js";

describe("HyperserveError", () => {
	it("sets message and name", () => {
		const err = new HyperserveError("something failed");
		expect(err.message).toBe("something failed");
		expect(err.name).toBe("HyperserveError");
		expect(err.statusCode).toBeUndefined();
	});

	it("sets optional statusCode", () => {
		const err = new HyperserveError("oops", 500);
		expect(err.statusCode).toBe(500);
	});
});

describe("HyperserveValidationError", () => {
	it("is instanceof HyperserveError", () => {
		const err = new HyperserveValidationError("bad input", 400);
		expect(err).toBeInstanceOf(HyperserveError);
		expect(err).toBeInstanceOf(HyperserveValidationError);
	});

	it("sets name, statusCode, and detail", () => {
		const detail = { field: "filename", issue: "missing extension" };
		const err = new HyperserveValidationError("bad input", 422, detail);
		expect(err.name).toBe("HyperserveValidationError");
		expect(err.statusCode).toBe(422);
		expect(err.detail).toEqual(detail);
	});
});

describe("HyperserveNotFoundError", () => {
	it("is instanceof HyperserveError", () => {
		const err = new HyperserveNotFoundError();
		expect(err).toBeInstanceOf(HyperserveError);
		expect(err).toBeInstanceOf(HyperserveNotFoundError);
	});

	it("defaults to 404 statusCode and generic message", () => {
		const err = new HyperserveNotFoundError();
		expect(err.statusCode).toBe(404);
		expect(err.message).toBe("Resource not found");
		expect(err.name).toBe("HyperserveNotFoundError");
	});

	it("accepts a custom message", () => {
		const err = new HyperserveNotFoundError("Video not found");
		expect(err.message).toBe("Video not found");
	});
});

describe("HyperserveApiError", () => {
	it("is instanceof HyperserveError", () => {
		const err = new HyperserveApiError("internal error", 500);
		expect(err).toBeInstanceOf(HyperserveError);
		expect(err).toBeInstanceOf(HyperserveApiError);
	});

	it("sets name and statusCode", () => {
		const err = new HyperserveApiError("internal error", 503);
		expect(err.name).toBe("HyperserveApiError");
		expect(err.statusCode).toBe(503);
	});
});

describe("HyperserveUploadError", () => {
	it("is instanceof HyperserveError", () => {
		const err = new HyperserveUploadError("PUT failed");
		expect(err).toBeInstanceOf(HyperserveError);
		expect(err).toBeInstanceOf(HyperserveUploadError);
	});

	it("sets name and optional uploadStatus", () => {
		const err = new HyperserveUploadError("PUT failed", 403);
		expect(err.name).toBe("HyperserveUploadError");
		expect(err.uploadStatus).toBe(403);
	});

	it("uploadStatus is optional", () => {
		const err = new HyperserveUploadError("network error");
		expect(err.uploadStatus).toBeUndefined();
	});
});

describe("HyperserveTimeoutError", () => {
	it("is instanceof HyperserveError", () => {
		const err = new HyperserveTimeoutError();
		expect(err).toBeInstanceOf(HyperserveError);
		expect(err).toBeInstanceOf(HyperserveTimeoutError);
	});

	it("has default message and name", () => {
		const err = new HyperserveTimeoutError();
		expect(err.name).toBe("HyperserveTimeoutError");
		expect(err.message).toBe("Request timed out");
	});
});

describe("instanceof across error hierarchy", () => {
	it("subclasses are not instanceof each other", () => {
		const validation = new HyperserveValidationError("bad", 400);
		const notFound = new HyperserveNotFoundError();
		expect(validation).not.toBeInstanceOf(HyperserveNotFoundError);
		expect(notFound).not.toBeInstanceOf(HyperserveValidationError);
	});
});
