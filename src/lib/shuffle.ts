/**
 * Unbiased Fisher-Yates shuffle using crypto.getRandomValues.
 *
 * Why crypto.getRandomValues instead of Math.random: Math.random is only
 * 32-bit and not cryptographically unpredictable, which matters for
 * high-stakes tests where students might try to guess the shuffle.
 *
 * Options like "All of the above" should be pinned by the caller before
 * shuffling (filter them out, shuffle the rest, then append).
 */
export function shuffle<T>(array: readonly T[]): T[] {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    // Uniform integer in [0, i] using crypto.getRandomValues.
    // Rejection sampling to avoid modulo bias.
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

/**
 * Shuffle option letters while pinning certain original letters in place.
 * `pinned` is a Set of original option letters (e.g. {'D'} for "None of the
 * above") that must stay at their original position.
 */
export function shuffleOptions(
  options: { A: string; B: string; C: string; D: string },
  pinned: Set<string> = new Set(),
): { displayOrder: string[]; originalToDisplay: Map<string, number> } {
  const letters = ['A', 'B', 'C', 'D'] as const;
  const result: string[] = [];

  // Remove pinned letters, shuffle the rest, then put pinned back at their
  // original index.
  const movable = letters.filter((l) => !pinned.has(l));
  const shuffledMovable = shuffle(movable);

  let movableIdx = 0;
  for (const l of letters) {
    if (pinned.has(l)) {
      result.push(l);
    } else {
      result.push(shuffledMovable[movableIdx]!);
      movableIdx += 1;
    }
  }

  // originalToDisplay: original letter -> display position (0-based)
  const originalToDisplay = new Map<string, number>();
  result.forEach((letter, pos) => {
    originalToDisplay.set(letter, pos);
  });

  return { displayOrder: result, originalToDisplay };
}
