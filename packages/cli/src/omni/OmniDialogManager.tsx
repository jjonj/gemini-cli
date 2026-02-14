/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useUIState, type UIState } from '../ui/contexts/UIStateContext.js';
import { useUIActions, type UIActions } from '../ui/contexts/UIActionsContext.js';
import { useToolActions } from '../ui/contexts/ToolActionsContext.js';
import {
  appEvents,
  AppEvent,
} from '../utils/events.js';
import { type RemoteDialogResponsePayload } from './events.js';
import {
  debugLogger,
  type FallbackIntent,
  type ValidationIntent,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';
import { ToolCallStatus, type HistoryItemToolGroup } from '../ui/types.js';
import type { ReactNode } from 'react';

interface AutoHandler {
  name: string;
  check: (state: UIState) => boolean;
  getKey: (state: UIState) => any;
  getPayload: (
    state: UIState,
  ) => { type: string; prompt: string; options: string[] };
  handle: (response: string, callbacks: any, actions: UIActions) => void;
  extractCallbacks: (state: UIState) => any;
}

const getPromptText = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  // Simple fallback for complex ReactNodes
  return 'Confirmation required';
};

const normalizeText = (value: string): string => value.toLowerCase().trim();

const parseIncomingResponse = (
  payload: RemoteDialogResponsePayload,
): { response: string; dialogType?: string } => {
  if (typeof payload === 'string') {
    return { response: payload };
  }
  return { response: payload.response, dialogType: payload.dialogType };
};

const parseToolConfirmationOutcome = (
  response: string,
  outcomes: ToolConfirmationOutcome[],
): ToolConfirmationOutcome => {
  const normalized = normalizeText(response);

  if (/^\d+$/.test(normalized)) {
    const index = Number.parseInt(normalized, 10);
    if (index >= 0 && index < outcomes.length) {
      return outcomes[index];
    }
    if (index > 0 && index <= outcomes.length) {
      return outcomes[index - 1];
    }
  }

  if (
    ['cancel', 'no', 'n', 'false', 'deny', 'reject', 'stop'].includes(
      normalized,
    )
  ) {
    return ToolConfirmationOutcome.Cancel;
  }
  if (
    ['always_and_save', 'allow_all', 'allow_future', 'save'].includes(
      normalized,
    )
  ) {
    return ToolConfirmationOutcome.ProceedAlwaysAndSave;
  }
  if (
    ['always', 'allow_session', 'allow_for_session', 'session'].includes(
      normalized,
    )
  ) {
    return ToolConfirmationOutcome.ProceedAlways;
  }
  if (
    ['modify', 'modify_with_editor', 'edit'].includes(
      normalized,
    )
  ) {
    return ToolConfirmationOutcome.ModifyWithEditor;
  }
  if (
    ['yes', 'y', 'confirm', 'true', 'allow', 'allow_once', 'proceed'].includes(
      normalized,
    )
  ) {
    return ToolConfirmationOutcome.ProceedOnce;
  }

  return ToolConfirmationOutcome.Cancel;
};

const HANDLERS: AutoHandler[] = [
  {
    name: 'commandConfirmation',
    check: (s) => !!s.commandConfirmationRequest,
    getKey: (s) => s.commandConfirmationRequest,
    getPayload: (s) => ({
      type: 'confirmation',
      prompt: getPromptText(s.commandConfirmationRequest!.prompt),
      options: ['Confirm', 'Cancel'],
    }),
    extractCallbacks: (s) => ({
      onConfirm: s.commandConfirmationRequest!.onConfirm,
    }),
    handle: (response, callbacks) => {
      // Accept '0', 'Confirm', 'confirm', 'yes', 'y' as confirmation
      const normalized = response.toLowerCase().trim();
      if (['0', 'confirm', 'yes', 'y', 'true'].includes(normalized)) {
        callbacks.onConfirm(true);
      } else {
        callbacks.onConfirm(false);
      }
    },
  },
  {
    name: 'authConsent',
    check: (s) => !!s.authConsentRequest,
    getKey: (s) => s.authConsentRequest,
    getPayload: (s) => ({
      type: 'auth_consent',
      prompt: getPromptText(s.authConsentRequest!.prompt),
      options: ['Allow', 'Deny'],
    }),
    extractCallbacks: (s) => ({
      onConfirm: s.authConsentRequest!.onConfirm,
    }),
    handle: (response, callbacks) => {
      const normalized = response.toLowerCase().trim();
      if (['0', 'allow', 'yes', 'y', 'confirm'].includes(normalized)) {
        callbacks.onConfirm(true);
      } else {
        callbacks.onConfirm(false);
      }
    },
  },
  {
    name: 'loopDetection',
    check: (s) => !!s.loopDetectionConfirmationRequest,
    getKey: (s) => s.loopDetectionConfirmationRequest,
    getPayload: (s) => ({
      type: 'loop_detection',
      prompt: 'Loop detected. Continue?',
      options: ['Continue', 'Stop'],
    }),
    extractCallbacks: (s) => ({
      onComplete: s.loopDetectionConfirmationRequest!.onComplete,
    }),
    handle: (response, callbacks) => {
      const normalized = response.toLowerCase().trim();
      if (['0', 'continue', 'yes', 'y', 'keep', 'keep_enabled'].includes(normalized)) {
        callbacks.onComplete({ userSelection: 'keep' });
      } else {
        callbacks.onComplete({ userSelection: 'disable' });
      }
    },
  },
  {
    name: 'proQuota',
    check: (s) => !!s.proQuotaRequest,
    getKey: (s) => s.proQuotaRequest,
    getPayload: (s) => ({
      type: 'pro_quota',
      prompt: s.proQuotaRequest!.message,
      options: [
        'retry_always',
        'retry_once',
        'stop',
        'retry_later',
        'upgrade',
      ],
    }),
    extractCallbacks: (s) => ({
      resolve: s.proQuotaRequest!.resolve,
    }),
    handle: (response, callbacks, actions) => {
      const normalized = response.toLowerCase().trim();
      const validIntents: FallbackIntent[] = [
        'retry_always',
        'retry_once',
        'stop',
        'retry_later',
        'upgrade',
      ];
      const match = validIntents.find(
        (i) =>
          i === normalized || i.replace('_', '') === normalized.replace('_', ''),
      );
      
      const finalMatch = match || (normalized === '0' ? 'retry_always' : (normalized === '1' ? 'retry_once' : 'stop'));
      
      if (finalMatch === 'stop') {
        callbacks.resolve('stop');
      } else {
        actions.handleProQuotaChoice(finalMatch as any);
      }
    },
  },
  {
    name: 'validationRequired',
    check: (s) => !!s.validationRequest,
    getKey: (s) => s.validationRequest,
    getPayload: (s) => ({
      type: 'validation_required',
      prompt:
        s.validationRequest!.validationDescription ||
        'Validation required to continue.',
      options: ['verify', 'change_auth', 'cancel'],
    }),
    extractCallbacks: (s) => ({
      resolve: s.validationRequest!.resolve,
    }),
    handle: (response, _callbacks, actions) => {
      const normalized = response.toLowerCase().trim();
      const validIntents: ValidationIntent[] = [
        'verify',
        'change_auth',
        'cancel',
      ];
      const match = validIntents.find(
        (i) =>
          i === normalized || i.replace('_', '') === normalized.replace('_', ''),
      );
      
      const finalMatch = match || (normalized === '0' ? 'verify' : 'cancel');
      actions.handleValidationChoice(finalMatch);
    },
  },
];

/**
 * OmniDialogManager provides bridges between the CLI UI state and the IPC layer.
 * It detects active UI dialogs, notifies the remote control, and handles remote responses.
 */
export const OmniDialogManager = () => {
  const uiState = useUIState();
  const uiActions = useUIActions();
  const { confirm: confirmToolAction } = useToolActions();
  const hasEmittedReadyRef = useRef(false);

  // Track the currently active dialog to avoid re-emitting or stale closures
  const activeDialogRef = useRef<{
    name: string;
    remoteType: string;
    key: any;
    callbacks: any;
  } | null>(null);

  // Track inline tool confirmations
  const notifiedCallIdsRef = useRef<Set<string>>(new Set());
  const toolDialogOutcomesRef = useRef<
    Map<string, ToolConfirmationOutcome[]>
  >(new Map());

  // 1. Ready Signal Logic
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
    uiState.showPrivacyNotice,
  ]);

  // 2. Auto Handlers Logic
  useEffect(() => {
    // Check if any handler matches the current state
    let matched = false;
    for (const handler of HANDLERS) {
      if (handler.check(uiState)) {
        matched = true;
        const key = handler.getKey(uiState);

        // If we are already handling this exact instance, do nothing
        if (
          activeDialogRef.current?.name === handler.name &&
          activeDialogRef.current?.key === key
        ) {
          return;
        }

        // New dialog detected
        debugLogger.log(`[OmniDialogManager] Detected dialog: ${handler.name}`);

        const payload = handler.getPayload(uiState);
        const callbacks = handler.extractCallbacks(uiState);

        activeDialogRef.current = {
          name: handler.name,
          remoteType: payload.type,
          key,
          callbacks,
        };

        appEvents.emit(AppEvent.RemoteDialog, payload);
        return; // Handle one at a time priority
      }
    }

    // If no handlers match, clear the active dialog ref
    if (!matched && activeDialogRef.current) {
      activeDialogRef.current = null;
    }
  }, [uiState]);

  // 3. Tool Confirmation Logic
  useEffect(() => {
    const currentConfirmingIds = new Set<string>();
    const allItems = [...uiState.history, ...uiState.pendingHistoryItems];

    for (const item of allItems) {
      if (item && item.type === 'tool_group') {
        const toolGroup = item as HistoryItemToolGroup;
        for (const tool of toolGroup.tools) {
          if (
            tool.status === ToolCallStatus.Confirming &&
            tool.confirmationDetails
          ) {
            const details = tool.confirmationDetails as any;
            // AskUser and ExitPlanMode have dedicated in-CLI UIs and should not
            // be bridged to remote auto-response flows.
            if (
              details?.type === 'ask_user' ||
              details?.type === 'exit_plan_mode'
            ) {
              continue;
            }

            const callId = tool.callId;
            currentConfirmingIds.add(callId);

            if (!notifiedCallIdsRef.current.has(callId)) {
              let prompt = `Allow execution of: '${tool.name}'?`;

              if (details.type === 'exec') {
                prompt = `Allow execution of: '${details.command}'?`;
              } else if (details.type === 'edit') {
                prompt = `Apply changes to ${details.fileName}?`;
              } else if (details.type === 'mcp') {
                prompt = `Allow execution of MCP tool "${details.toolName}" from server "${details.serverName}"?`;
              }

              const dialog = {
                type: `tool:${callId}`,
                prompt,
                options: ['yes', 'no'],
              };
              const outcomes = [
                ToolConfirmationOutcome.ProceedOnce,
                ToolConfirmationOutcome.Cancel,
              ];
               
              debugLogger.log(
                `[OmniDialogManager] Notifying hub of tool confirmation: ${callId}. Prompt: ${prompt}`,
              );

              toolDialogOutcomesRef.current.set(callId, outcomes);
              appEvents.emit(AppEvent.RemoteDialog, dialog);
              notifiedCallIdsRef.current.add(callId);
            }
          }
        }
      }
    }

    // Cleanup notified IDs that are no longer present or no longer confirming
    for (const id of Array.from(notifiedCallIdsRef.current)) {
      if (!currentConfirmingIds.has(id)) {
        notifiedCallIdsRef.current.delete(id);
        toolDialogOutcomesRef.current.delete(id);
      }
    }
  }, [uiState.history, uiState.pendingHistoryItems]);

  // 4. Response Listener
  useEffect(() => {
    const onResponse = (payload: RemoteDialogResponsePayload) => {
      const { response, dialogType } = parseIncomingResponse(payload);
      if (response === '[DIALOG_FINISHED]') return;
      const activeDialog = activeDialogRef.current;

      // Check top-level handlers first
      if (
        activeDialog &&
        (!dialogType || dialogType === activeDialog.remoteType)
      ) {
        debugLogger.log(
          `[OmniDialogManager] Received response for ${activeDialog.name}: ${response}`,
        );
        const handler = HANDLERS.find(
          (h) => h.name === activeDialog.name,
        );
        if (handler) {
          handler.handle(response, activeDialog.callbacks, uiActions);
          return;
        }
      }

      // Check tool confirmations
      // Responses for tool confirmations usually come with the tool: prefix stripped or as raw 'yes'/'no'
      // We check if we have any active tool confirmations.
      const typedCallId =
        dialogType && dialogType.startsWith('tool:')
          ? dialogType.substring('tool:'.length)
          : null;
      const lastNotifiedCallId =
        typedCallId ?? Array.from(notifiedCallIdsRef.current).pop();
      if (lastNotifiedCallId) {
        const outcomes =
          toolDialogOutcomesRef.current.get(lastNotifiedCallId) ?? [
            ToolConfirmationOutcome.ProceedOnce,
            ToolConfirmationOutcome.Cancel,
          ];
        if (notifiedCallIdsRef.current.has(lastNotifiedCallId)) {
          debugLogger.log(
            `[OmniDialogManager] Resolving tool confirmation ${lastNotifiedCallId} with ${response}`,
          );
          const outcome = parseToolConfirmationOutcome(response, outcomes);
          void confirmToolAction(lastNotifiedCallId, outcome);
          return;
        }
      }

      debugLogger.log(
        `[OmniDialogManager] Received response '${response}' but no matching dialog or tool found.`,
      );
    };

    appEvents.on(AppEvent.RemoteDialogResponse, onResponse);
    return () => {
      appEvents.off(AppEvent.RemoteDialogResponse, onResponse);
    };
  }, [uiActions, confirmToolAction]);

  return null;
};
