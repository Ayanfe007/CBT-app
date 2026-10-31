/**
 * Pure pause-credit calculations.
 *
 * Rules (server-authoritative):
 *  - Heartbeat interval is 15s. A gap > 45s since the last heartbeat counts as
 *    a disconnect.
 *  - Pause credit for a disconnect gap = gap - 15s (we don't double-count the
 *    expected 15s heartbeat interval).
 *  - Credit is capped by the remaining allowance
 *    (max_pause_minutes*60 - paused_seconds).
 *  - Once the allowance is used up, the clock keeps running normally.
 */

export interface PauseResult {
  /** Seconds to add to paused_seconds and ends_at (0 if no disconnect). */
  pauseCreditSeconds: number;
  /** New paused_seconds total. */
  newPausedSeconds: number;
  /** True if the allowance was exhausted by this gap. */
  allowanceExhausted: boolean;
  /** Remaining allowance seconds after applying this gap. */
  remainingAllowanceSeconds: number;
}

/**
 * Compute pause credit for a single heartbeat gap.
 * @param gapSeconds - now - last_heartbeat_at (0 if no previous heartbeat).
 * @param pausedSeconds - total pause credit already granted.
 * @param maxPauseSeconds - course.max_pause_minutes * 60.
 */
export function computePauseCredit(
  gapSeconds: number,
  pausedSeconds: number,
  maxPauseSeconds: number,
): PauseResult {
  const remaining = Math.max(0, maxPauseSeconds - pausedSeconds);

  if (gapSeconds <= 45) {
    // Normal heartbeat interval — not a disconnect.
    return {
      pauseCreditSeconds: 0,
      newPausedSeconds: pausedSeconds,
      allowanceExhausted: remaining === 0,
      remainingAllowanceSeconds: remaining,
    };
  }

  // Disconnect detected.
  const pauseSeconds = Math.max(0, gapSeconds - 15);
  const actualPause = Math.min(pauseSeconds, remaining);
  const newPausedSeconds = pausedSeconds + actualPause;
  const newRemaining = Math.max(0, maxPauseSeconds - newPausedSeconds);
  const allowanceExhausted = actualPause < pauseSeconds;

  return {
    pauseCreditSeconds: actualPause,
    newPausedSeconds,
    allowanceExhausted,
    remainingAllowanceSeconds: newRemaining,
  };
}

/**
 * Effective end time for expiry decisions.
 * effectiveEnd = ends_at + remainingAllowanceSeconds, where
 * remainingAllowanceSeconds = maxPauseSeconds - pausedSeconds.
 * A session is expired when now > effectiveEnd.
 */
export function computeEffectiveEnd(
  endsAtMs: number,
  pausedSeconds: number,
  maxPauseSeconds: number,
): number {
  const remainingAllowance = Math.max(0, maxPauseSeconds - pausedSeconds);
  return endsAtMs + remainingAllowance * 1000;
}
