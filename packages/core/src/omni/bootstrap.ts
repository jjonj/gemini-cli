/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import { CoreToolScheduler } from '../core/coreToolScheduler.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { AskUserInvocation } from '../tools/ask-user.js';
import { ASK_USER_TOOL_NAME } from '../tools/tool-names.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';
import type { ToolConfirmationPayload } from '../tools/tools.js';
import { OmniLogger } from './omniLogger.js';
import { exec } from 'node:child_process';

/**
 * Omni Runtime Bootstrap
 * 
 * This file uses prototype monkey-patching to inject custom logic into the core 
 * Gemini CLI classes without modifying their source files. This minimizes 
 * merge conflicts during upstream rebases.
 */
let omniCoreBootstrapped = false;

export function bootstrapOmni() {
  if (omniCoreBootstrapped) {
    return;
  }
  omniCoreBootstrapped = true;

  // --- 1. Safety Overrides (Always Trust Folders) ---
  // Overriding this on the prototype ensures that all checks 
  // (core and CLI) see the folder as trusted.
  Config.prototype.isTrustedFolder = function() {
    return true;
  };

  // --- 2. API Logger & Aggressive Turn Termination ---
  const originalSendMessageStream = GeminiChat.prototype.sendMessageStream;

  GeminiChat.prototype.sendMessageStream = async function(...args) {
    let stream;
    try {
      stream = await originalSendMessageStream.apply(this, args);
    } catch (error) {
      OmniLogger.logApiError(error, {
        source: 'core.bootstrap.sendMessageStream.initial',
      });
      throw error;
    }
    const FORCE_END_TURN_STRING = '[FORCE-END-TURN]';

    const wrappedGenerator = async function* () {
      try {
        for await (const event of stream) {
          // Detect Force End Turn Signal in Content
          if (event.type === StreamEventType.CHUNK) {
            const content = event.value.candidates?.[0]?.content;
            const text = content?.parts?.[0]?.text;
            
            if (text && text.toUpperCase().includes(FORCE_END_TURN_STRING)) {
              return; 
            }
          }
          yield event;
        }
      } catch (error) {
        if (!OmniLogger.isAbortLikeError(error)) {
          OmniLogger.logApiError(error, {
            source: 'core.bootstrap.sendMessageStream',
          });
        }
        throw error;
      }
    };

    return wrappedGenerator();
  };

  // --- 3. Tool-Based Turn Termination ---
  const originalRecordCompletedToolCalls = GeminiChat.prototype.recordCompletedToolCalls;

  GeminiChat.prototype.recordCompletedToolCalls = function(model, toolCalls) {
    const FORCE_END_TURN_STRING = '[FORCE-END-TURN]';
    
    const hasForceEndSignal = toolCalls.some((call) => {
      const resultDisplay = call.response?.resultDisplay;
      if (typeof resultDisplay === 'string') {
        return resultDisplay.toUpperCase().includes(FORCE_END_TURN_STRING);
      }
      if (typeof resultDisplay === 'object' && resultDisplay !== null) {
        return JSON.stringify(resultDisplay).toUpperCase().includes(FORCE_END_TURN_STRING);
      }
      return false;
    });

    if (hasForceEndSignal) {
      // Logic handled in CLI hook for better UX
    }

    return originalRecordCompletedToolCalls.apply(this, [model, toolCalls]);
  };

  // --- 4. Surgical Rollback (Undo) ---
  GeminiChat.prototype.rollbackDeep = function() {
    // Find the last user message that is NOT a function response (i.e., a real prompt)
    let lastUserPromptIndex = -1;
    const history = (this as any).history;
    for (let i = history.length - 1; i >= 0; i--) {
      const content = history[i];
      if (content.role === 'user') {
        const isToolResponse = content.parts?.some((p: any) => p.functionResponse);
        if (!isToolResponse) {
          lastUserPromptIndex = i;
          break;
        }
      }
    }

    if (lastUserPromptIndex !== -1) {
      history.splice(lastUserPromptIndex);
    }
  };

  GeminiChat.prototype.rollbackTurn = function() {
    this.rollbackDeep();
  };

  // --- 5. Omni Policy Patch: Keep ask_user Interactive in YOLO ---
  const originalPolicyCheck = PolicyEngine.prototype.check;
  PolicyEngine.prototype.check = async function(...args) {
    const [toolCall] = args as Parameters<PolicyEngine['check']>;
    if (
      this.getApprovalMode() === ApprovalMode.YOLO &&
      toolCall?.name === ASK_USER_TOOL_NAME
    ) {
      return { decision: PolicyDecision.ASK_USER };
    }
    return originalPolicyCheck.apply(this, args);
  };

  // --- 6. Omni Scheduler Patch: Preserve Confirmation Payload ---
  const originalHandleConfirmationResponse =
    CoreToolScheduler.prototype.handleConfirmationResponse;
  CoreToolScheduler.prototype.handleConfirmationResponse = function(
    callId: string,
    originalOnConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>,
    outcome: ToolConfirmationOutcome,
    signal: AbortSignal,
    payload?: ToolConfirmationPayload,
  ) {
    const wrappedOnConfirm = async (innerOutcome: ToolConfirmationOutcome) => {
      await (
        originalOnConfirm as unknown as (
          outcome: ToolConfirmationOutcome,
          payload?: ToolConfirmationPayload,
        ) => Promise<void>
      )(innerOutcome, payload);
    };

    return originalHandleConfirmationResponse.call(
      this,
      callId,
      wrappedOnConfirm,
      outcome,
      signal,
      payload,
    );
  };

  // --- 7. Omni AskUser Speech Notification ---
  const originalAskUserShouldConfirmExecute =
    AskUserInvocation.prototype.shouldConfirmExecute;
  AskUserInvocation.prototype.shouldConfirmExecute = async function(
    abortSignal: AbortSignal,
  ) {
    const details = await originalAskUserShouldConfirmExecute.call(
      this,
      abortSignal,
    );

    if (details && details.type === 'ask_user') {
      const firstQuestion =
        (this as { params?: { questions?: Array<{ question?: string }> } })
          .params?.questions?.[0]?.question ?? 'New question';
      const speakText = firstQuestion.replace(/[\r\n]+/g, ' ').trim();

      if (speakText.length > 0) {
        const escapedSpeakText = speakText.replace(/"/g, "'");
        const command =
          process.platform === 'win32'
            ? `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "aispeak.py \\"${escapedSpeakText}\\""`
            : `aispeak.py "${escapedSpeakText}"`;

        exec(command, (error) => {
          if (error && !OmniLogger.isAbortLikeError(error)) {
            OmniLogger.logApiError(error, {
              source: 'core.bootstrap.ask_user_speech',
            });
          }
        });
      }
    }

    return details;
  };
}
