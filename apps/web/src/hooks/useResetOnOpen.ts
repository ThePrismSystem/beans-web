import { useState } from "react";

/**
 * Runs `reset` on the closed→open transition, for dialogs that stay mounted
 * between openings and would otherwise reopen showing the last attempt's
 * state.
 *
 * Adjusted during render rather than in an effect so the reset lands in the
 * same commit as the open transition — an effect would let the stale values
 * paint first:
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
 */
export function useResetOnOpen(open: boolean, reset: () => void): void {
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      reset();
    }
  }
}
