/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { type SlashCommand, CommandKind } from '../ui/commands/types.js';
import { OmniHook } from './turnTermination.js';
import { MessageType } from '../ui/types.js';
import { INITIAL_HISTORY_LENGTH } from '@google/gemini-cli-core';

/**
 * Automatically filters out old tool groups from history.
 * Preserves:
 * 1. The last 3 tool groups globally.
 * 2. Any tool group containing an "Edit" tool.
 */
export const pressCommand: SlashCommand = {
  name: 'press',
  description: 'Automatically compress history by removing old tool groups',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const uiHistory = OmniHook.getHistory();
    if (uiHistory.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No history to compress.',
      };
    }

    const clientChat = context.services.agentContext?.geminiClient?.getChat();
    const clientHistory = clientChat?.getHistory() || [];

    // Identify all tool groups and which ones to keep
    const toolGroupIndices: number[] = [];
    uiHistory.forEach((item, index) => {
      if (item.type === 'tool_group') {
        toolGroupIndices.push(index);
      }
    });

    const lastThreeIndices = toolGroupIndices.slice(-3);
    const removedGroups: number[] = [];

    const editedUiHistory = uiHistory.filter((item, index) => {
      // Don't filter out the current /press command if it was just added
      if (item.type === MessageType.USER && item.text?.trim().startsWith('/press')) {
        return false;
      }

      if (item.type === 'tool_group') {
        // Keep if it's one of the last 3
        if (lastThreeIndices.includes(index)) {
          return true;
        }

        // Keep if it contains an "Edit" tool
        const hasEditTool = item.tools.some(tool => tool.name === 'Edit');
        if (hasEditTool) {
          return true;
        }

        // Otherwise, remove it
        removedGroups.push(item.id);
        return false;
      }

      return true;
    });

    if (removedGroups.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'History already compressed (no eligible tool groups found).',
      };
    }

    // 2. Reconstruct Client History (for the AI)
    const systemContext = clientHistory.slice(0, INITIAL_HISTORY_LENGTH);
    const newClientHistory: Content[] = [...systemContext];

    for (const item of editedUiHistory) {
      if (item.type === MessageType.USER) {
        newClientHistory.push({ role: 'user', parts: [{ text: item.text || '' }] });
      } else if (item.type === (MessageType.GEMINI as string) || item.type === 'gemini_content') {
        newClientHistory.push({ role: 'model', parts: [{ text: item.text || '' }] });
      }
    }

    // 3. Return load_history action to sync
    context.ui.addItem({
        type: MessageType.INFO,
        text: `Pressed history: removed ${removedGroups.length} tool groups.`,
    }, Date.now());

    return {
      type: 'load_history',
      history: editedUiHistory,
      clientHistory: newClientHistory,
    };
  },
};
