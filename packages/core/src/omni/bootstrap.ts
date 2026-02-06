/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import { OmniLogger } from './omniLogger.js';

/**
 * Omni Runtime Bootstrap
 * 
 * This file uses prototype monkey-patching to inject custom logic into the core 
 * Gemini CLI classes without modifying their source files. This minimizes 
 * merge conflicts during upstream rebases.
 */

export function bootstrapOmni() {
  console.log('Omni Runtime Bootstrap active.');

  // --- 1. Safety Overrides (Always Trust Folders) ---
  // Overriding this on the prototype ensures that all checks 
  // (core and CLI) see the folder as trusted.
  Config.prototype.isTrustedFolder = function() {
    return true;
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
}
