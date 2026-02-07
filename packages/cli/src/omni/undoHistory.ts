/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItem } from '../ui/types.js';

/**
 * Reverts the history by one turn (User + Gemini response).
 * Marks the turn as "reverted" instead of deleting it.
 */
export function undoHistory(prevHistory: HistoryItem[]): HistoryItem[] {
  const historyCopy = [...prevHistory];

  // 1. Remove the /undo command itself (it's the last item)
  if (
    historyCopy.length > 0 &&
    historyCopy[historyCopy.length - 1].type === 'user'
  ) {
    const lastText = historyCopy[historyCopy.length - 1].text;
    if (
      typeof lastText === 'string' &&
      lastText.trim().startsWith('/undo')
    ) {
      historyCopy.pop();
    }
  }

  // 2. Find the last user message that is NOT already reverted
  let targetUserIndex = -1;
  for (let i = historyCopy.length - 1; i >= 0; i--) {
    if (historyCopy[i].type === 'user' && !historyCopy[i].reverted) {
      targetUserIndex = i;
      break;
    }
  }

  if (targetUserIndex !== -1) {
    // 3. Mark the user message and ALL following items until the next user message (or end) as reverted
    return historyCopy.map((item, index) => {
      if (index >= targetUserIndex) {
        // Stop at the next user message if one exists
        let isPastTurn = false;
        for (let k = targetUserIndex + 1; k < index; k++) {
          if (historyCopy[k].type === 'user') {
            isPastTurn = true;
            break;
          }
        }
        if (!isPastTurn) {
          return { ...item, reverted: true };
        }
      }
      return item;
    });
  }
  return historyCopy;
}
