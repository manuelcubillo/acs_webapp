/**
 * Random numeric card code generation.
 *
 * Pure and side-effect free: the randomness source is a parameter, so tests can
 * feed a deterministic byte sequence and assert exact output.
 */

/**
 * Fills the given buffer with random bytes and returns it.
 *
 * Signature mirrors `crypto.getRandomValues` so the platform implementation can
 * be passed straight through. An injected implementation MUST fill the whole
 * buffer it receives (or return a buffer of its own with at least one byte).
 */
export type RandomBytes = (buffer: Uint8Array) => Uint8Array;

/**
 * Bytes at or above this value are discarded instead of folded into a digit.
 *
 * 250 is the largest multiple of 10 that fits in a byte, so every accepted byte
 * maps to one of the ten digits with exactly the same probability. Taking
 * `byte % 10` over the full 0–255 range would instead make 0–5 appear 26 times
 * per 256 bytes and 6–9 only 25 — the classic modulo bias.
 */
const REJECTION_THRESHOLD = 250;

/** Extra bytes requested per round to absorb the ~2.3% rejection rate. */
const REFILL_SLACK = 8;

/**
 * Safety net against a pathological randomness source (e.g. an injected stub
 * that only ever yields rejected bytes), which would otherwise spin forever.
 * A real CSPRNG never comes close: the odds of one round failing to produce a
 * single usable byte are under 2.3% per byte.
 */
const MAX_REFILL_ROUNDS = 64;

/** Default source: the platform CSPRNG. Read lazily, never at module load. */
function cryptoRandomBytes(buffer: Uint8Array): Uint8Array {
  return crypto.getRandomValues(buffer);
}

/**
 * Generate a card code of exactly `length` decimal digits.
 *
 * The result is a STRING and may start with zeros ("00042" is a perfectly valid
 * 5-digit code) — card codes are never numbers and must never be parsed as one.
 *
 * @param length      - Number of digits. Must be a positive integer.
 * @param randomBytes - Randomness source. Defaults to `crypto.getRandomValues`.
 * @returns A string of exactly `length` characters, all in `0`–`9`.
 * @throws {RangeError} If `length` is not a positive integer.
 * @throws {Error} If the randomness source yields no usable byte for
 *   `MAX_REFILL_ROUNDS` consecutive rounds.
 */
export function generateNumericCode(
  length: number,
  randomBytes: RandomBytes = cryptoRandomBytes,
): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(
      `Card code length must be a positive integer, received: ${length}`,
    );
  }

  const digits: string[] = [];
  let rounds = 0;

  while (digits.length < length) {
    if (rounds >= MAX_REFILL_ROUNDS) {
      throw new Error(
        `Card code generation gave up after ${MAX_REFILL_ROUNDS} rounds: ` +
          `the randomness source is not producing usable bytes.`,
      );
    }
    rounds++;

    const remaining = length - digits.length;
    const chunk = randomBytes(new Uint8Array(remaining + REFILL_SLACK));

    for (const byte of chunk) {
      if (byte >= REJECTION_THRESHOLD) continue;
      digits.push(String(byte % 10));
      if (digits.length === length) break;
    }
  }

  return digits.join("");
}
