import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperserveError, HyperserveWebhookError } from "../errors.js";
import { unwrapWebhook, verifyWebhookSignature } from "../webhook.js";

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

describe("unwrapWebhook", () => {
	const NOW = 1_000_000;

	const SUCCESS = {
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
	};

	const FAIL = {
		webhookName: "my-webhook",
		videoId: "vid-123",
		event: "video-processing-fail",
		customMetadata: null,
		error: "Error processing video, contact support",
	};

	/** Signs `body` as the server would at the current (faked) time. */
	async function signed(body: string, secret = SECRET) {
		return { signature: await generateSignature(NOW, secret, body), secret: SECRET, body };
	}

	/** Awaits `promise`, expecting it to reject with a HyperserveWebhookError. */
	async function rejection(promise: Promise<unknown>): Promise<HyperserveWebhookError> {
		const err = await promise.then(
			() => {
				throw new Error("expected unwrapWebhook to reject");
			},
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(HyperserveWebhookError);
		return err as HyperserveWebhookError;
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("valid requests", () => {
		it("resolves a video-processing-success payload, narrowable to its data", async () => {
			const payload = await unwrapWebhook(await signed(JSON.stringify(SUCCESS)));

			if (payload.event !== "video-processing-success") throw new Error("expected success");
			expect(payload.webhookName).toBe("my-webhook");
			expect(payload.videoId).toBe("vid-123");
			expect(payload.data.id).toBe("vid-123");
			expect(payload.data.isPublic).toBe(true);
			expect(payload.data.resolutions["1080p"]).toEqual(SUCCESS.data.resolutions["1080p"]);
		});

		it("resolves a video-processing-fail payload, which carries error and no data", async () => {
			const payload = await unwrapWebhook(await signed(JSON.stringify(FAIL)));

			if (payload.event !== "video-processing-fail") throw new Error("expected fail");
			expect(payload.error).toBe("Error processing video, contact support");
			expect("data" in payload).toBe(false);
		});

		it("returns the parsed body unchanged — no keys renamed, added, or dropped", async () => {
			const payload = await unwrapWebhook(await signed(JSON.stringify(SUCCESS)));

			expect(payload).toEqual(SUCCESS);
		});

		it("accepts a private-video payload, where resolution URLs are absent", async () => {
			const body = JSON.stringify({
				...SUCCESS,
				data: { id: "vid-123", isPublic: false, resolutions: { "720p": { status: "ready" } } },
			});

			const payload = await unwrapWebhook(await signed(body));

			if (payload.event !== "video-processing-success") throw new Error("expected success");
			expect(payload.data.resolutions["720p"]).toEqual({ status: "ready" });
		});

		it("preserves a null customMetadata", async () => {
			const payload = await unwrapWebhook(await signed(JSON.stringify(FAIL)));

			expect(payload.customMetadata).toBeNull();
		});

		it("passes unknown fields through, so server-side additions do not break it", async () => {
			const body = JSON.stringify({ ...FAIL, futureField: "keep me" });

			const payload = await unwrapWebhook(await signed(body));

			expect((payload as unknown as Record<string, unknown>).futureField).toBe("keep me");
		});

		it("forwards toleranceMs to signature verification", async () => {
			const body = JSON.stringify(FAIL);
			const signature = await generateSignature(NOW - 60_000, SECRET, body); // 1 minute old

			await expect(
				unwrapWebhook({ signature, secret: SECRET, body, toleranceMs: 120_000 }),
			).resolves.toMatchObject({ event: "video-processing-fail" });

			const err = await rejection(
				unwrapWebhook({ signature, secret: SECRET, body, toleranceMs: 30_000 }),
			);
			expect(err.reason).toBe("invalid_signature");
		});
	});

	describe("invalid signature", () => {
		it("rejects a body signed with a different secret", async () => {
			const opts = await signed(JSON.stringify(SUCCESS), "some-other-secret");

			const err = await rejection(unwrapWebhook(opts));
			expect(err.reason).toBe("invalid_signature");
		});

		it("rejects a body tampered with after signing", async () => {
			const opts = await signed(JSON.stringify(FAIL));
			const tampered = { ...opts, body: JSON.stringify({ ...FAIL, videoId: "evil-456" }) };

			const err = await rejection(unwrapWebhook(tampered));
			expect(err.reason).toBe("invalid_signature");
		});

		it("rejects an expired timestamp", async () => {
			const body = JSON.stringify(FAIL);
			const signature = await generateSignature(NOW - 300_001, SECRET, body);

			const err = await rejection(unwrapWebhook({ signature, secret: SECRET, body }));
			expect(err.reason).toBe("invalid_signature");
		});

		it("rejects a malformed signature header", async () => {
			const err = await rejection(
				unwrapWebhook({ signature: "garbage", secret: SECRET, body: JSON.stringify(FAIL) }),
			);
			expect(err.reason).toBe("invalid_signature");
		});

		it("checks the signature before the body, so an unsigned junk body is a signature failure", async () => {
			const err = await rejection(
				unwrapWebhook({ signature: "garbage", secret: SECRET, body: "not json" }),
			);
			expect(err.reason).toBe("invalid_signature");
		});
	});

	describe("invalid payload (signature valid)", () => {
		async function payloadRejection(body: string) {
			const err = await rejection(unwrapWebhook(await signed(body)));
			expect(err.reason).toBe("invalid_payload");
			return err;
		}

		it("rejects a body that is not valid JSON", async () => {
			await payloadRejection("not json");
		});

		it.each([
			["a string", '"a string"'],
			["null", "null"],
			["an array", "[]"],
			["a number", "42"],
		])("rejects JSON that is %s rather than an object", async (_label, body) => {
			await payloadRejection(body);
		});

		it("rejects an unrecognized event", async () => {
			await payloadRejection(JSON.stringify({ ...FAIL, event: "video-processing-other" }));
		});

		it("rejects a payload with no event", async () => {
			const { event: _event, ...noEvent } = FAIL;
			await payloadRejection(JSON.stringify(noEvent));
		});

		it.each(["webhookName", "videoId"])("rejects a payload missing %s", async (field) => {
			const body = { ...FAIL } as Record<string, unknown>;
			delete body[field];
			await payloadRejection(JSON.stringify(body));
		});

		it.each([
			"webhookName",
			"videoId",
		])("rejects a payload whose %s is not a string", async (field) => {
			await payloadRejection(JSON.stringify({ ...FAIL, [field]: 123 }));
		});

		it("rejects a fail payload with no error", async () => {
			const { error: _error, ...noError } = FAIL;
			await payloadRejection(JSON.stringify(noError));
		});

		it("rejects a fail payload whose error is not a string", async () => {
			await payloadRejection(JSON.stringify({ ...FAIL, error: { message: "boom" } }));
		});

		it("rejects a success payload with no data", async () => {
			const { data: _data, ...noData } = SUCCESS;
			await payloadRejection(JSON.stringify(noData));
		});

		it.each([
			["null", null],
			["an array", []],
			["a string", "data"],
		])("rejects a success payload whose data is %s", async (_label, data) => {
			await payloadRejection(JSON.stringify({ ...SUCCESS, data }));
		});

		it("rejects a success payload whose data.id is not a string", async () => {
			await payloadRejection(JSON.stringify({ ...SUCCESS, data: { ...SUCCESS.data, id: 7 } }));
		});

		it("rejects a success payload whose data.isPublic is not a boolean", async () => {
			await payloadRejection(
				JSON.stringify({ ...SUCCESS, data: { ...SUCCESS.data, isPublic: "true" } }),
			);
		});

		it.each([
			["missing", undefined],
			["null", null],
			["an array", []],
		])("rejects a success payload whose data.resolutions is %s", async (_label, resolutions) => {
			await payloadRejection(
				JSON.stringify({ ...SUCCESS, data: { ...SUCCESS.data, resolutions } }),
			);
		});
	});

	describe("errors", () => {
		it("rejects with a HyperserveWebhookError that is also a HyperserveError", async () => {
			const err = await rejection(
				unwrapWebhook({ signature: "garbage", secret: SECRET, body: "{}" }),
			);

			expect(err).toBeInstanceOf(HyperserveError);
			expect(err.name).toBe("HyperserveWebhookError");
		});

		it("gives each failure a message saying what went wrong", async () => {
			const sigErr = await rejection(
				unwrapWebhook({ signature: "garbage", secret: SECRET, body: "{}" }),
			);
			const payloadErr = await rejection(unwrapWebhook(await signed("not json")));

			expect(sigErr.message).toMatch(/signature/i);
			expect(payloadErr.message).toMatch(/payload/i);
		});
	});
});
