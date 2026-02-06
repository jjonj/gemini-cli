/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useUIState } from '../ui/contexts/UIStateContext.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * OmniDialogManager provides bridges between the CLI UI state and the IPC layer.
 */
export const OmniDialogManager = () => {
  const uiState = useUIState();
  const hasEmittedReadyRef = useRef(false);

  useEffect(() => {
    if (
      !hasEmittedReadyRef.current &&
      uiState.isConfigInitialized &&
      !uiState.isAuthenticating &&
      !uiState.isAuthDialogOpen &&
      !uiState.isThemeDialogOpen &&
      !uiState.isEditorDialogOpen &&
      !uiState.showPrivacyNotice
    ) {
      hasEmittedReadyRef.current = true;
      debugLogger.log('[OmniDialogManager] CLI is READY. Notifying hub.');

      appEvents.emit(AppEvent.RemoteDialog, {
        type: 'ready',
        prompt: 'Gemini CLI is ready.',
        options: [],
      });
    }
  }, [
    uiState.isConfigInitialized,
    uiState.isAuthenticating,
    uiState.isAuthDialogOpen,
    uiState.isThemeDialogOpen,
    uiState.isEditorDialogOpen,
    uiState.showPrivacyNotice
  ]);

  return null;
};
