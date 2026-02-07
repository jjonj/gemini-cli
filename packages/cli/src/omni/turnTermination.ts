/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, ToolCallStatus } from '../ui/types.js';
import { FORCE_END_TURN_STRING } from '../ui/constants.js';
import {
  type TrackedCompletedToolCall,
  type TrackedCancelledToolCall,
} from '../ui/hooks/useToolScheduler.js';
import { appEvents, AppEvent } from '../utils/events.js';
import {
  type ThoughtSummary,
  type ToolCallRequestInfo,
  type GeminiClient,
} from '@google/gemini-cli-core';
import type { HistoryItem } from '../ui/types.js';
import { workspaceService } from './WorkspaceService.js';
import type { LoadedSettings } from '../config/settings.js';
import { loadSettings } from '../config/settings.js';

/**
 * Omni UI Hooks
 */
export class OmniHook {
  /**
   * Checks for FORCE-END-TURN signal in model content chunks.
   * Returns truncated text if signal is found, otherwise null.
   */
  static handleModelContent(
    eventValue: string,
    addItem: (item: any, timestamp?: number) => void,
    setIsResponding: (value: boolean) => void,
    turnCancelledRef: { current: boolean }
  ): string | null {
    const magic = FORCE_END_TURN_STRING.toUpperCase();
    const upperEvent = eventValue.toUpperCase();
    
    if (upperEvent.includes(magic)) {
      turnCancelledRef.current = true;
      setIsResponding(false);
      
      const index = upperEvent.indexOf(magic);
      const truncated = index > 0 ? eventValue.substring(0, index) : '';
      
      addItem({
        type: MessageType.INFO,
        text: 'Turn ended by [FORCE-END-TURN] sequence in model output.',
      }, Date.now());
      
      this.onTurnFinished();
      return truncated;
    }
    return null;
  }

  /**
   * Checks for FORCE-END-TURN signal in tool outputs.
   * Returns true if turn should be terminated.
   */
  static handleToolCompletion(
    completedTools: (TrackedCompletedToolCall | TrackedCancelledToolCall)[],
    addItem: (item: any, timestamp?: number) => void,
    setIsResponding: (value: boolean) => void,
    markToolsAsSubmitted: (ids: string[]) => void,
    geminiClient?: GeminiClient
  ): boolean {
    const magic = FORCE_END_TURN_STRING.toUpperCase();
    
    const hasSignal = completedTools.some(tc => {
      const resultDisplay = tc.response?.resultDisplay;
      const responseParts = tc.response?.responseParts;
      const text = `${typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay)} ${JSON.stringify(responseParts)}`;
      return text.toUpperCase().includes(magic);
    });

    if (hasSignal) {
      addItem({
        type: MessageType.INFO,
        text: 'Turn ended by [FORCE-END-TURN ] sequence in tool output.',
      }, Date.now());
      
      setIsResponding(false);
      this.onTurnFinished();

      const geminiTools = completedTools.filter(t => !t.request.isClientInitiated);
      if (geminiTools.length > 0 && geminiClient) {
        const responsesToSend = geminiTools.flatMap(tc => tc.response.responseParts);
        // Manually add the responses to history so the model is aware of them
        // even though we are stopping the auto-continuation loop.
        void geminiClient.addHistory({
          role: 'user',
          parts: responsesToSend,
        });
      }

      markToolsAsSubmitted(completedTools.map(t => t.request.callId));
      return true;
    }
    return false;
  }

  /**
   * Hook called when a new history item is added.
   * Forwards relevant items to remote listeners.
   */
  static onHistoryItemAdded(newItem: HistoryItem) {
    if (
      newItem.type === 'user' ||
      newItem.type === 'gemini' ||
      newItem.type === 'gemini_content' ||
      newItem.type === 'info' ||
      newItem.type === 'warning' ||
      newItem.type === 'error'
    ) {
      appEvents.emit(AppEvent.RemoteResponse, newItem.text ?? '');
    }
  }

  /**
   * Hook called when a turn is finished.
   */
  static onTurnFinished() {
    appEvents.emit(AppEvent.RemoteResponse, '[TURN_FINISHED]');
  }

  /**
   * Hook called when a thought summary is received.
   */
  static onThought(thought: ThoughtSummary) {
    appEvents.emit(
      AppEvent.RemoteThought,
      typeof thought === 'string' ? thought : JSON.stringify(thought)
    );
  }

  /**
   * Hook called when a tool call request is received.
   */
  static onToolCall(toolCall: ToolCallRequestInfo) {
    appEvents.emit(AppEvent.RemoteToolCall, 'Tool Call: ' + JSON.stringify(toolCall));
  }

  /**
   * Helper to emit a remote response directly.
   */
  static emitRemoteResponse(text: string) {
    appEvents.emit(AppEvent.RemoteResponse, text);
  }

  /**
   * Initializes the workspace root from CLI arguments.
   */
  static initializeWorkspace(argv: any, currentSettings: LoadedSettings): LoadedSettings {
    const effectiveWorkspaceRoot =
      (Array.isArray(argv.workspace)
        ? argv.workspace[argv.workspace.length - 1]
        : argv.workspace) || process.cwd();
    
    workspaceService.setWorkspaceRoot(effectiveWorkspaceRoot);

    // If the workspace root is different from the initial CWD, reload settings
    // to ensure workspace-specific configurations are properly applied.
    if (effectiveWorkspaceRoot !== process.cwd()) {
      return loadSettings(effectiveWorkspaceRoot);
    }
    return currentSettings;
  }

  /**
   * Gets the current workspace root.
   */
  static getWorkspaceRoot(): string {
    return workspaceService.getWorkspaceRoot();
  }

  /**
   * Registers remote event handlers.
   * Returns a cleanup function.
   */
  static registerRemoteHandlers(callbacks: {
    handleFinalSubmit: (text: string) => void;
    getHistory: () => HistoryItem[];
  }): () => void {
    const onRemotePrompt = (text: string) => {
      callbacks.handleFinalSubmit(text);
    };

    const onRequestRemoteHistory = () => {
      const history = callbacks.getHistory();
      const historyData: Array<{ sender: string; text: string }> = [];

      for (const h of history) {
        if (h.type === 'user') {
          historyData.push({ sender: 'Me', text: h.text || '' });
        } else if (h.type === 'tool_group') {
          for (const t of h.tools) {
            const status = t.status === ToolCallStatus.Success ? 'SUCCESS' : t.status;
            let resultText = '';
            if (t.resultDisplay) {
              if (typeof t.resultDisplay === 'string') {
                resultText = t.resultDisplay;
              } else {
                try {
                  resultText = JSON.stringify(t.resultDisplay, null, 2);
                } catch (_e) {
                  resultText = String(t.resultDisplay);
                }
              }
            }

            const header = `Tool Call: ${t.name}(${t.description}) [${status}]`;
            const lowerName = t.name.toLowerCase();

            if (
              resultText.includes('<<<<<<<') ||
              resultText.includes('=======') ||
              resultText.includes('>>>>>>>') ||
              lowerName === 'writefile' ||
              lowerName === 'write_file' ||
              (typeof t.resultDisplay === 'object' &&
                t.resultDisplay !== null &&
                'fileDiff' in t.resultDisplay)
            ) {
              historyData.push({ sender: 'System', text: header });
              historyData.push({ sender: 'CodeDiff', text: resultText });
            } else {
              historyData.push({
                sender: 'System',
                text: `${header}\n${resultText}`,
              });
            }
          }
        } else if (h.text) {
          historyData.push({ sender: 'AI', text: h.text });
        }
      }

      this.emitRemoteResponse(
        '[HISTORY_START]'
          + JSON.stringify(historyData.filter((h) => h.text))
          + '[HISTORY_END]'
      );
    };

    appEvents.on(AppEvent.RemotePrompt, onRemotePrompt);
    appEvents.on(AppEvent.RequestRemoteHistory, onRequestRemoteHistory);

    return () => {
      appEvents.off(AppEvent.RemotePrompt, onRemotePrompt);
      appEvents.off(AppEvent.RequestRemoteHistory, onRequestRemoteHistory);
    };
  }
}