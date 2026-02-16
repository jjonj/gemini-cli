/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useUIState, type UIState } from '../ui/contexts/UIStateContext.js';
import { useUIActions, type UIActions } from '../ui/contexts/UIActionsContext.js';
import { useToolActions } from '../ui/contexts/ToolActionsContext.js';
import { useQuotaState, type QuotaState } from '../ui/contexts/QuotaContext.js';
import {
  appEvents,
  AppEvent,
} from '../utils/events.js';
import { type RemoteDialogResponsePayload } from './events.js';
import {
  debugLogger,
  type FallbackIntent,
  type ValidationIntent,
  type Question,
  ToolConfirmationOutcome,
  AuthType,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { type HistoryItem, type HistoryItemToolGroup } from '../ui/types.js';
import { OmniHook } from './turnTermination.js';
import type { ReactNode } from 'react';

interface AutoHandler {
  name: string;
  check: (state: UIState, quota: QuotaState) => boolean;
  getKey: (state: UIState, quota: QuotaState) => any;
  getPayload: (
    state: UIState,
    quota: QuotaState,
  ) => { type: string; prompt: string; options: string[]; questions?: Question[] };
  handle: (response: string, callbacks: any, actions: UIActions) => void;
  extractCallbacks: (state: UIState, quota: QuotaState) => any;
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
    check: (_s, q) => !!q.proQuotaRequest,
    getKey: (_s, q) => q.proQuotaRequest,
    getPayload: (_s, q) => ({
      type: 'pro_quota',
      prompt: q.proQuotaRequest!.message,
      options: [
        'retry_always',
        'retry_once',
        'stop',
        'retry_later',
        'upgrade',
      ],
    }),
    extractCallbacks: (_s, q) => ({
      resolve: q.proQuotaRequest!.resolve,
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
    check: (_s, q) => !!q.validationRequest,
    getKey: (_s, q) => q.validationRequest,
    getPayload: (_s, q) => ({
      type: 'validation_required',
      prompt:
        q.validationRequest!.validationDescription ||
        'Validation required to continue.',
      options: ['verify', 'change_auth', 'cancel'],
    }),
    extractCallbacks: (_s, q) => ({
      resolve: q.validationRequest!.resolve,
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
  const quotaState = useQuotaState();
  const { confirm: confirmToolAction } = useToolActions();
  const hasEmittedReadyRef = useRef(false);
  const remoteHistoryRef = useRef(uiState.history);
  const remoteSubmitRef = useRef<(text: string) => void>(() => {});

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

  // Track auto-handled states to prevent infinite loops
  const lastAuthDialogOpenRef = useRef(false);
  const lastAuthConsentRef = useRef<any>(null);

  // Helper to auto-confirm Auth Dialog if it's already using API key
  useEffect(() => {
    if (
      uiState.isAuthDialogOpen &&
      !lastAuthDialogOpenRef.current &&
      uiState.commandContext.services.settings.merged.security.auth.selectedType === AuthType.USE_GEMINI
    ) {
      lastAuthDialogOpenRef.current = true;
      const timer = setTimeout(() => {
        debugLogger.log('[OmniDialogManager] Auto-closing auth dialog (API key active)');
        // In the new version, closing the auth dialog is done by setting auth state back to authenticated
        uiActions.setAuthState('authenticated' as any);
      }, 100);
      return () => clearTimeout(timer);
    } else if (!uiState.isAuthDialogOpen) {
      lastAuthDialogOpenRef.current = false;
    }
    return undefined;
  }, [uiState.isAuthDialogOpen, uiActions]);

  useEffect(() => {
    if (
      uiState.authConsentRequest &&
      uiState.authConsentRequest !== lastAuthConsentRef.current
    ) {
      lastAuthConsentRef.current = uiState.authConsentRequest;
      const timer = setTimeout(() => {
        debugLogger.log('[OmniDialogManager] Auto-confirming auth consent');
        uiState.authConsentRequest!.onConfirm(true);
      }, 100);
      return () => clearTimeout(timer);
    } else if (!uiState.authConsentRequest) {
      lastAuthConsentRef.current = null;
    }
    return undefined;
  }, [uiState.authConsentRequest]);

  // 1. Ready Signal Logic
  useEffect(() => {
    const checkAndEmitReady = () => {
      if (
        uiState.isConfigInitialized &&
        !uiState.isAuthenticating &&
        !uiState.isAuthDialogOpen &&
        !uiState.isThemeDialogOpen &&
        !uiState.isEditorDialogOpen &&
        !uiState.showPrivacyNotice
      ) {
        debugLogger.log('[OmniDialogManager] CLI is READY. Notifying hub.');
        appEvents.emit(AppEvent.RemoteDialog, {
          type: 'ready',
          prompt: 'Gemini CLI is ready.',
          options: [],
        });
        return true;
      }
      return false;
    };

    if (!hasEmittedReadyRef.current && checkAndEmitReady()) {
      hasEmittedReadyRef.current = true;
    }

    const onReadinessRequest = () => {
      debugLogger.log('[OmniDialogManager] Readiness request received.');
      checkAndEmitReady();
    };

    appEvents.on(AppEvent.RequestReadiness, onReadinessRequest);
    return () => {
      appEvents.off(AppEvent.RequestReadiness, onReadinessRequest);
    };
  }, [
    uiState.isConfigInitialized,
    uiState.isAuthenticating,
    uiState.isAuthDialogOpen,
    uiState.isThemeDialogOpen,
    uiState.isEditorDialogOpen,
    uiState.showPrivacyNotice,
  ]);

  useEffect(() => {
    remoteSubmitRef.current = (text: string) => {
      void uiActions.handleFinalSubmit(text);
    };
  }, [uiActions]);

  useEffect(() => {
    remoteHistoryRef.current = uiState.history;
  }, [uiState.history]);

  useEffect(() => {
    return OmniHook.registerRemoteHandlers({
      handleFinalSubmit: (text: string) => {
        remoteSubmitRef.current(text);
      },
      getHistory: () => remoteHistoryRef.current,
    });
  }, []);

  // 2. Auto Handlers Logic
  useEffect(() => {
    // Check if any handler matches the current state
    let matched = false;
    for (const handler of HANDLERS) {
      if (handler.check(uiState, quotaState)) {
        matched = true;
        const key = handler.getKey(uiState, quotaState);

        // If we are already handling this exact instance, do nothing
        if (
          activeDialogRef.current?.name === handler.name &&
          activeDialogRef.current?.key === key
        ) {
          return;
        }

        // New dialog detected
        debugLogger.log(`[OmniDialogManager] Detected dialog: ${handler.name}`);

        const payload = handler.getPayload(uiState, quotaState);
        const callbacks = handler.extractCallbacks(uiState, quotaState);

        activeDialogRef.current = {
          name: handler.name,
          remoteType: payload.type,
          key,
          callbacks,
        };

        appEvents.emit(AppEvent.RemoteDialog, payload);
        return;
      }
    }

    // If no handlers matched, clear active dialog
    if (!matched && activeDialogRef.current) {
      debugLogger.log(`[OmniDialogManager] Dialog closed: ${activeDialogRef.current.name}`);
      activeDialogRef.current = null;
    }
  }, [uiState, quotaState]);

  // 3. Inline Tool Confirmation Bridge
  useEffect(() => {
    const currentToolGroup = uiState.history.find(
      (h): h is HistoryItem & { type: 'tool_group' } =>
        h.type === 'tool_group' &&
        h.tools.some((t) => t.status === CoreToolCallStatus.AwaitingApproval),
    );

    if (currentToolGroup) {
      for (const tool of (currentToolGroup as HistoryItemToolGroup).tools) {
        if (
          tool.status === CoreToolCallStatus.AwaitingApproval &&
          !notifiedCallIdsRef.current.has(tool.callId)
        ) {
          notifiedCallIdsRef.current.add(tool.callId);

          const outcomes =
            tool.confirmationDetails?.type === 'edit'
              ? [
                  ToolConfirmationOutcome.ProceedOnce,
                  ToolConfirmationOutcome.ProceedAlways,
                  ToolConfirmationOutcome.ProceedAlwaysAndSave,
                  ToolConfirmationOutcome.ModifyWithEditor,
                  ToolConfirmationOutcome.Cancel,
                ]
              : [
                  ToolConfirmationOutcome.ProceedOnce,
                  ToolConfirmationOutcome.ProceedAlways,
                  ToolConfirmationOutcome.ProceedAlwaysAndSave,
                  ToolConfirmationOutcome.Cancel,
                ];

          toolDialogOutcomesRef.current.set(tool.callId, outcomes);

          const options = outcomes.map((o) => {
            switch (o) {
              case ToolConfirmationOutcome.ProceedOnce:
                return 'Allow Once';
              case ToolConfirmationOutcome.ProceedAlways:
                return 'Allow for Session';
              case ToolConfirmationOutcome.ProceedAlwaysAndSave:
                return 'Allow and Save';
              case ToolConfirmationOutcome.ModifyWithEditor:
                return 'Modify with Editor';
              case ToolConfirmationOutcome.Cancel:
                return 'Cancel';
              default:
                return String(o);
            }
          });

          debugLogger.log(`[OmniDialogManager] Notifying remote of tool confirmation: ${tool.name}`);
          appEvents.emit(AppEvent.RemoteDialog, {
            type: 'tool_confirmation',
            prompt: `Confirm tool execution: ${tool.name}`,
            options,
          });

          // Store as active dialog so response handler knows what to do
          activeDialogRef.current = {
            name: 'tool_confirmation',
            remoteType: 'tool_confirmation',
            key: tool.callId,
            callbacks: {
              onConfirm: (outcome: ToolConfirmationOutcome) => {
                confirmToolAction(tool.callId, outcome);
              },
            },
          };
        }
      }
    }
  }, [uiState.history, confirmToolAction]);

  // 4. Response Handler
  useEffect(() => {
    const onRemoteDialogResponse = (payload: RemoteDialogResponsePayload) => {
      const { response, dialogType } = parseIncomingResponse(payload);
      debugLogger.log(
        `[OmniDialogManager] Remote response received: "${response}" (Type: ${dialogType || 'any'})`,
      );

      if (!activeDialogRef.current) {
        debugLogger.log('[OmniDialogManager] Ignoring response: No active dialog.');
        return;
      }

      // If a specific dialogType was requested, verify it matches
      if (
        dialogType &&
        activeDialogRef.current.remoteType !== dialogType &&
        activeDialogRef.current.name !== dialogType
      ) {
        debugLogger.log(
          `[OmniDialogManager] Ignoring response: Type mismatch (Active: ${activeDialogRef.current.remoteType}, Received: ${dialogType})`,
        );
        return;
      }

      const active = activeDialogRef.current;

      // Handle tool confirmation specifically
      if (active.name === 'tool_confirmation') {
        const outcomes = toolDialogOutcomesRef.current.get(active.key);
        if (outcomes) {
          const outcome = parseToolConfirmationOutcome(response, outcomes);
          active.callbacks.onConfirm(outcome);
        }
      } else {
        // Find generic handler
        const handler = HANDLERS.find((h) => h.name === active.name);
        if (handler) {
          handler.handle(response, active.callbacks, uiActions);
        }
      }
    };

    appEvents.on(AppEvent.RemoteDialogResponse, onRemoteDialogResponse);
    return () => {
      appEvents.off(AppEvent.RemoteDialogResponse, onRemoteDialogResponse);
    };
  }, [uiActions]);

  return null;
};
