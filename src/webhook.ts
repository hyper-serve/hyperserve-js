import type { VerifyWebhookSignatureOptions } from "./types.js";

const DEFAULT_TOLERANCE_MS = 300_000; // 5 minutes — matches server-side enforcement

/**
 * Verifies the x-hyperserve-signature header on an incoming webhook request.
 *
 * The signature header has the format "{timestampMs}.{hmac-sha256-hex}", where the HMAC
 * is computed over "{timestampMs}.{rawBody}" using your webhook signing secret. This proves
 * both when the request was sent (replay protection) and that the body was not tampered with
 * (integrity). Any modification to the body or timestamp will invalidate the signature.
 *
 * Returns true if the signature is valid and the timestamp is within the tolerance window.
 * Returns false if the signature is invalid, the timestamp has expired, or the header is malformed.
 *
 * Uses the Web Crypto API for a constant-time HMAC comparison — safe on Node 18+, Bun, Deno,
 * Cloudflare Workers, Vercel Edge, and all other supported server environments.
 *
 * IMPORTANT: pass the raw request body string exactly as received. Do not parse and re-serialize
 * JSON — any whitespace difference will invalidate the signature.
 *
 * @example
 * import { verifyWebhookSignature } from 'hyperserve-sdk';
 *
 * // Express (use express.raw, not express.json, so you get the raw body)
 * app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
 *   const isValid = await verifyWebhookSignature({
 *     signature: req.headers['x-hyperserve-signature'] ?? '',
 *     secret: process.env.HYPERSERVE_WEBHOOK_SECRET,
 *     body: req.body.toString(),
 *   });
 *   if (!isValid) return res.status(401).end();
 * });
 *
 * // Next.js App Router
 * const body = await request.text();
 * const isValid = await verifyWebhookSignature({
 *   signature: request.headers.get('x-hyperserve-signature') ?? '',
 *   secret: process.env.HYPERSERVE_WEBHOOK_SECRET!,
 *   body,
 * });
 */
export async function verifyWebhookSignature(
	options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
	const { signature, secret, body, toleranceMs = DEFAULT_TOLERANCE_MS } = options;

	const dotIndex = signature.indexOf(".");
	if (dotIndex === -1) return false;

	const timestampStr = signature.slice(0, dotIndex);
	const receivedHex = signature.slice(dotIndex + 1);

	// Validate timestamp is a non-negative integer
	const timestamp = Number(timestampStr);
	if (!Number.isInteger(timestamp) || timestamp < 0) return false;

	// Reject if timestamp is outside the tolerance window.
	// Math.abs handles future timestamps (clock skew or forged headers) — without it,
	// a negative difference would never exceed toleranceMs, accepting the signature forever.
	if (Math.abs(Date.now() - timestamp) > toleranceMs) return false;

	const receivedBytes = hexToBytes(receivedHex);
	if (receivedBytes === null) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	// The signed message is "{timestampMs}.{rawBody}" — covers both freshness and integrity.
	// crypto.subtle.verify performs a constant-time comparison.
	return crypto.subtle.verify(
		"HMAC",
		key,
		receivedBytes,
		encoder.encode(`${timestampStr}.${body}`),
	);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
	if (hex.length === 0 || hex.length % 2 !== 0) return null;
	const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
	for (let i = 0; i < hex.length; i += 2) {
		const value = parseInt(hex.slice(i, i + 2), 16);
		if (Number.isNaN(value)) return null;
		bytes[i / 2] = value;
	}
	return bytes;
}
