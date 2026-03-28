import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyWebhookSignature } from "../webhook.js";

const SECRET = "test-webhook-secret-abc123";

/**
 * Generates a valid x-hyperserve-signature header value using the Web Crypto API,
 * matching the format produced by the Hyperserve server: "{timestampMs}.{hmac-sha256-hex}"
 */
async function generateSignature(timestampMs: number, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(String(timestampMs)));
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
		const signature = await generateSignature(1_000_000, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: SECRET })).toBe(true);
	});

	it("returns true when timestamp is just within the default 5-minute tolerance", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// 4 minutes 59 seconds old — still within tolerance
		const timestampMs = now - 299_000;
		const signature = await generateSignature(timestampMs, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: SECRET })).toBe(true);
	});

	it("returns false when timestamp exceeds the default 5-minute tolerance", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		const timestampMs = now - 300_001;
		const signature = await generateSignature(timestampMs, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: SECRET })).toBe(false);
	});

	it("respects a custom toleranceMs", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		const timestampMs = now - 60_000; // 1 minute old

		const signature = await generateSignature(timestampMs, SECRET);

		// 30-second tolerance — 1 minute old should fail
		expect(await verifyWebhookSignature({ signature, secret: SECRET, toleranceMs: 30_000 })).toBe(
			false,
		);

		// 2-minute tolerance — 1 minute old should pass
		expect(await verifyWebhookSignature({ signature, secret: SECRET, toleranceMs: 120_000 })).toBe(
			true,
		);
	});

	it("returns false for a wrong secret", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: "wrong-secret" })).toBe(false);
	});

	it("returns false when the signature hex is tampered with", async () => {
		vi.setSystemTime(1_000_000);
		const signature = await generateSignature(1_000_000, SECRET);

		// Flip the last character of the hex segment
		const tampered = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
		expect(await verifyWebhookSignature({ signature: tampered, secret: SECRET })).toBe(false);
	});

	it("returns false when the header has no dot separator", async () => {
		expect(await verifyWebhookSignature({ signature: "nodothere", secret: SECRET })).toBe(false);
	});

	it("returns false for an empty signature", async () => {
		expect(await verifyWebhookSignature({ signature: "", secret: SECRET })).toBe(false);
	});

	it("returns false when the hex portion is invalid", async () => {
		vi.setSystemTime(1_000_000);
		expect(
			await verifyWebhookSignature({ signature: "1000000.notvalidhex!!", secret: SECRET }),
		).toBe(false);
	});

	it("returns false when the timestamp portion is not a number", async () => {
		expect(await verifyWebhookSignature({ signature: "abc.deadbeef", secret: SECRET })).toBe(false);
	});

	it("returns false for a future timestamp beyond the tolerance window", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// Timestamp 6 minutes in the future — outside the 5-minute tolerance
		const futureTimestamp = now + 360_000;
		const signature = await generateSignature(futureTimestamp, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: SECRET })).toBe(false);
	});

	it("accepts a future timestamp within the tolerance window", async () => {
		const now = 1_000_000;
		vi.setSystemTime(now);
		// Timestamp 1 minute in the future — minor clock skew, still within tolerance
		const futureTimestamp = now + 60_000;
		const signature = await generateSignature(futureTimestamp, SECRET);

		expect(await verifyWebhookSignature({ signature, secret: SECRET })).toBe(true);
	});
});
