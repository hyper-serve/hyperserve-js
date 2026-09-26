import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWebhookPayload, verifyWebhookSignature } from "../webhook.js";

const SECRET = "test-webhook-secret-abc123";
const BODY = JSON.stringify({ event: "video.ready", videoId: "abc-123" });

/**
 * Generates a valid x-hyperserve-signature header value using the Web Crypto API,
 * matching the format produced by the Hyperserve server: "{timestampMs}.{hmac-sha256-hex}"
 * The HMAC covers "{timestampMs}.{rawBody}".
 */
async function generateSignature(
	timestampMs: number,
	secret: string,
	body: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const message = `${timestampMs}.${body}`;
	const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	const hex = Array.from(new Uint8Array(sigBytes))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${timestampMs}.${hex}`;
}

describe("verifyWebhookSignature", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns true for a valid signature with a fresh timestamp", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: BODY })).toBe(true);
	});

	it("returns true when timestamp is just within the default 5-minute tolerance", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// 4 minutes 59 seconds old — still within tolerance
		const timestampMs = now - 299_000;
		const signature = await generateSignature(timestampMs, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: BODY })).toBe(true);
	});

	it("returns false when timestamp exceeds the default 5-minute tolerance", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		const timestampMs = now - 300_001;
		const signature = await generateSignature(timestampMs, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: BODY })).toBe(false);
	});

	it("respects a custom toleranceMs", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		const timestampMs = now - 60_000; // 1 minute old

		const signature = await generateSignature(timestampMs, SECRET, BODY);

		// 30-second tolerance — 1 minute old should fail
		expect(
			await verifyWebhookSignature({ signature, secret: SECRET, body: BODY, toleranceMs: 30_000 }),
		).toBe(false);

		// 2-minute tolerance — 1 minute old should pass
		expect(
			await verifyWebhookSignature({ signature, secret: SECRET, body: BODY, toleranceMs: 120_000 }),
		).toBe(true);
	});

	it("returns false for a wrong secret", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: "wrong-secret", body: BODY })).toBe(
			false,
		);
	});

	it("returns false when the body has been tampered with", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET, BODY);
		const tamperedBody = JSON.stringify({ event: "video.ready", videoId: "evil-456" });

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: tamperedBody })).toBe(
			false,
		);
	});

	it("returns false when body whitespace differs from what was signed", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET, BODY);
		// Re-serialized JSON — same data but different whitespace
		const reparsedBody = JSON.stringify(JSON.parse(BODY), null, 2);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: reparsedBody })).toBe(
			false,
		);
	});

	it("returns false when the signature hex is tampered with", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET, BODY);

		// Flip the last character of the hex segment
		const tampered = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
		expect(await verifyWebhookSignature({ signature: tampered, secret: SECRET, body: BODY })).toBe(
			false,
		);
	});

	it("returns false when the header has no dot separator", async () => {
		expect(
			await verifyWebhookSignature({ signature: "nodothere", secret: SECRET, body: BODY }),
		).toBe(false);
	});

	it("returns false for an empty signature", async () => {
		expect(await verifyWebhookSignature({ signature: "", secret: SECRET, body: BODY })).toBe(false);
	});

	it("returns false when the hex portion is invalid", async () => {
		vi.setSystemTime(1_000_000);
		expect(
			await verifyWebhookSignature({
				signature: "1000000.notvalidhex!!",
				secret: SECRET,
				body: BODY,
			}),
		).toBe(false);
	});

	it("returns false when the timestamp portion is not a number", async () => {
		expect(
			await verifyWebhookSignature({ signature: "abc.deadbeef", secret: SECRET, body: BODY }),
		).toBe(false);
	});

	it("returns false for a future timestamp beyond the tolerance window", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// Timestamp 6 minutes in the future — outside the 5-minute tolerance
		const futureTimestamp = now + 360_000;
		const signature = await generateSignature(futureTimestamp, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: BODY })).toBe(false);
	});

	it("accepts a future timestamp within the tolerance window", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// Timestamp 1 minute in the future — minor clock skew, still within tolerance
		const futureTimestamp = now + 60_000;
		const signature = await generateSignature(futureTimestamp, SECRET, BODY);

		expect(await verifyWebhookSignature({ signature, secret: SECRET, body: BODY })).toBe(true);
	});
});

describe("parseWebhookPayload", () => {
	const SUCCESS_BODY = JSON.stringify({
		webhookName: "my-webhook",
		videoId: "vid-123",
		event: "video-processing-success",
		customMetadata: { orderId: "abc" },
		data: {
			id: "vid-123",
			isPublic: true,
			resolutions: {
				"1080p": {
					status: "ready",
					videoUrl: "https://cdn.example/1080p.mp4",
					thumbnailImageUrls: ["https://cdn.example/1080p_1.jpg"],
				},
			},
		},
	});

	const FAIL_BODY = JSON.stringify({
		webhookName: "my-webhook",
		videoId: "vid-123",
		event: "video-processing-fail",
		customMetadata: null,
		error: "Error processing video, contact support",
	});

	it("parses a video-processing-success payload", () => {
		const payload = parseWebhookPayload(SUCCESS_BODY);

		expect(payload?.event).toBe("video-processing-success");
		expect(payload?.webhookName).toBe("my-webhook");
		expect(payload?.videoId).toBe("vid-123");
	});

	it("narrows to the success payload on the event discriminant", () => {
		const payload = parseWebhookPayload(SUCCESS_BODY);
		if (payload?.event !== "video-processing-success") throw new Error("expected success");

		// Type-level: `data` is only reachable after narrowing.
		expect(payload.data.id).toBe("vid-123");
		expect(payload.data.isPublic).toBe(true);
		expect(payload.data.resolutions["1080p"]?.status).toBe("ready");
		expect(payload.data.resolutions["1080p"]?.videoUrl).toBe("https://cdn.example/1080p.mp4");
	});

	it("narrows to the fail payload, which carries error and no data", () => {
		const payload = parseWebhookPayload(FAIL_BODY);
		if (payload?.event !== "video-processing-fail") throw new Error("expected fail");

		expect(payload.error).toBe("Error processing video, contact support");
		expect("data" in payload).toBe(false);
	});

	it("parses a private-video success payload, where resolution URLs are absent", () => {
		const body = JSON.stringify({
			webhookName: "my-webhook",
			videoId: "vid-123",
			event: "video-processing-success",
			customMetadata: null,
			data: {
				id: "vid-123",
				isPublic: false,
				resolutions: { "720p": { status: "ready" } },
			},
		});

		const payload = parseWebhookPayload(body);
		if (payload?.event !== "video-processing-success") throw new Error("expected success");

		expect(payload.data.resolutions["720p"]).toEqual({ status: "ready" });
		expect(payload.data.resolutions["720p"]?.videoUrl).toBeUndefined();
	});

	it("preserves a null customMetadata rather than coercing it", () => {
		const payload = parseWebhookPayload(FAIL_BODY);

		expect(payload?.customMetadata).toBeNull();
	});

	it("passes unknown fields through untouched", () => {
		const body = JSON.stringify({
			webhookName: "my-webhook",
			videoId: "vid-123",
			event: "video-processing-fail",
			customMetadata: null,
			error: "boom",
			futureField: "keep me",
		});

		const payload = parseWebhookPayload(body);

		expect((payload as Record<string, unknown> | null)?.futureField).toBe("keep me");
	});

	it("returns null for a body that is not valid JSON", () => {
		expect(parseWebhookPayload("not json")).toBeNull();
	});

	it("returns null for JSON that is not an object", () => {
		expect(parseWebhookPayload('"a string"')).toBeNull();
		expect(parseWebhookPayload("null")).toBeNull();
		expect(parseWebhookPayload("[]")).toBeNull();
	});

	it("returns null for an unrecognized event", () => {
		const body = JSON.stringify({
			webhookName: "my-webhook",
			videoId: "vid-123",
			event: "video-processing-something-else",
			customMetadata: null,
		});

		expect(parseWebhookPayload(body)).toBeNull();
	});

	it("returns null when webhookName or videoId is missing", () => {
		expect(
			parseWebhookPayload(
				JSON.stringify({ videoId: "vid-123", event: "video-processing-fail", error: "boom" }),
			),
		).toBeNull();
		expect(
			parseWebhookPayload(
				JSON.stringify({ webhookName: "w", event: "video-processing-fail", error: "boom" }),
			),
		).toBeNull();
	});

	it("returns null when a success payload has no data object", () => {
		const body = JSON.stringify({
			webhookName: "my-webhook",
			videoId: "vid-123",
			event: "video-processing-success",
			customMetadata: null,
		});

		expect(parseWebhookPayload(body)).toBeNull();
	});

	it("returns null when a fail payload has no error string", () => {
		const body = JSON.stringify({
			webhookName: "my-webhook",
			videoId: "vid-123",
			event: "video-processing-fail",
			customMetadata: null,
		});

		expect(parseWebhookPayload(body)).toBeNull();
	});
});
