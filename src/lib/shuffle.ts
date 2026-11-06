/**
 * Unbiased Fisher-Yates shuffle using crypto.getRandomValues.
 *
 * Why crypto.getRandomValues instead of Math.random: Math.random is only
 * 32-bit and not cryptographically unpredictable, which matters for
 * high-stakes tests where students might try to guess the shuffle.
 */
export function shuffle<T>(array: readonly T[]): T[] {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const limit = 0xffffffff - (0xffffffff % (i + 1));
    let j: number;
    do {
      const buf = crypto.getRandomValues(new Uint32Array(1));
      j = buf[0];
    } while (j > limit);
    j = j % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
