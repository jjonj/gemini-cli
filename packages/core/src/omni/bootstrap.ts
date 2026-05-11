/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import { workspaceService } from './WorkspaceService.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { OmniLogger } from './omniLogger.js';
import { coreEvents } from '../utils/events.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ApprovalMode } from '../policy/types.js';
import {
  type ValidatingToolCall,
} from '../scheduler/types.js';

/**
 * Bootstraps Omni-specific enhancements by monkey-patching core classes.
 * This is non-invasive to the core codebase.
 */
export function bootstrapOmni() {
  // --- 1. Safety Overrides (Always Trust Folders) ---
  // Overriding this on the prototype ensures that all checks
  // (core and CLI) see the folder as trusted.
  Config.prototype.isTrustedFolder = function() {
    return true;
  };

  // 1.2 YOLO Redirection Override
  // By default, core downgrades to ASK_USER if redirection is used and sandboxing is off.
  // We override this for YOLO mode to maintain autonomy.
  const originalShouldDowngrade = (PolicyEngine.prototype as any).shouldDowngradeForRedirection;
  (PolicyEngine.prototype as any).shouldDowngradeForRedirection = function(
    command: string,
    allowRedirection?: boolean,
  ) {
    if (this.approvalMode === ApprovalMode.YOLO) {
      return false;
    }
    return originalShouldDowngrade.apply(this, [command, allowRedirection]);
  };

  // 1.5 Path Interception for Workspace Service
  const originalGetTargetDir = Config.prototype.getTargetDir;
  Config.prototype.getTargetDir = function() {
    const original = originalGetTargetDir.call(this);
    workspaceService.setWorkspaceRoot(original);
    OmniLogger.setWorkspaceRoot(original);
    return original;
  };

  // --- 2. API Logger & Aggressive Turn Termination ---
  const originalSendMessageStream = GeminiChat.prototype.sendMessageStream;

  GeminiChat.prototype.sendMessageStream = async function(...args) {
    const stream = await originalSendMessageStream.apply(this, args);
    const FORCE_END_TURN_STRING = '[FORCE-END-TURN]';
    const self = this;

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
        OmniLogger.logApiError(error, (self as any).history);
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

  // 3.5 Tool Call Interception for high-fidelity logging and IPC
  // We patch the internal _processToolCall method which is common to all tool executions
  // in the new Scheduler architecture.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const originalProcessToolCall = (Scheduler.prototype as any)._processToolCall;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  (Scheduler.prototype as any)._processToolCall = async function(
    toolCall: ValidatingToolCall,
    signal: AbortSignal,
  ) {
    const request = toolCall.request;
    const invocation = toolCall.invocation;

    // Log the tool call for Omni session tracking
    const logPayload = {
      callId: request.callId,
      name: request.name,
      args: request.args,
      invocation: invocation,
    };
    
    // Emit via coreEvents. Since core shouldn't depend on CLI types, we use 
    // a prefixed console log that the CLI's remoteControl can intercept if needed,
    // or just rely on the high-fidelity log emission if we add a dedicated event.
    // For now, we'll use a custom internal event if we can, but ConsoleLog is safe.
    coreEvents.emitConsoleLog('debug', `OMNI_TOOL_CALL:${JSON.stringify(logPayload)}`);

    // Call the original implementation
    return originalProcessToolCall.call(this, toolCall, signal);
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
}
