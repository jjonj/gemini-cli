/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Content } from '@google/genai';
import { type SlashCommand, CommandKind } from '../ui/commands/types.js';
import { OmniHook } from './turnTermination.js';
import { openFileInEditor } from '../ui/utils/editorUtils.js';
import { MessageType, type HistoryItem } from '../ui/types.js';
import { INITIAL_HISTORY_LENGTH } from '@google/gemini-cli-core';

/**
 * Opens full history in external editor and synchronizes changes with AI server.
 */
export const adjCommand: SlashCommand = {
  name: 'adj',
  description: 'Edit full history in external editor and sync with AI server',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const uiHistory = OmniHook.getHistory();
    if (uiHistory.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No history to modify.',
      };
    }

    const clientChat = context.services.agentContext?.geminiClient?.getChat();
    const clientHistory = clientChat?.getHistory() || [];

    // 1. Prepare history for editing
    // Filter out the current /adj command if it was just added to UI history
    const historyToEdit = uiHistory.filter(item => {
        if (item.type === MessageType.USER && item.text?.trim().startsWith('/adj')) {
            return false;
        }
        return true;
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-history-edit-'));
    const filePath = path.join(tmpDir, 'history.json');
    
    // Format history as pretty JSON for editing
    const historyJson = JSON.stringify(historyToEdit, null, 2);
    fs.writeFileSync(filePath, historyJson, 'utf8');

    try {
      await openFileInEditor(
        filePath,
        context.ui.stdin,
        context.ui.setRawMode,
        context.services.settings.merged.general.preferredEditor as any,
      );

      const editedJson = fs.readFileSync(filePath, 'utf8');
      const editedUiHistory = JSON.parse(editedJson) as HistoryItem[];

      // 2. Reconstruct Client History (for the AI)
      // We must preserve the initial environment context (system instruction + directory tree)
      const systemContext = clientHistory.slice(0, INITIAL_HISTORY_LENGTH);
      const newClientHistory: Content[] = [...systemContext];

      for (const item of editedUiHistory) {
        if (item.type === MessageType.USER) {
            newClientHistory.push({ role: 'user', parts: [{ text: item.text || '' }] });
        } else if (item.type === (MessageType.GEMINI as string) || item.type === 'gemini_content') {
            newClientHistory.push({ role: 'model', parts: [{ text: item.text || '' }] });
        }
        // Other types (info, error, stats) are purely for UI and ignored by the AI
      }

      // 3. Return load_history action to sync everything
      return {
        type: 'load_history',
        history: editedUiHistory,
        clientHistory: newClientHistory,
      };
    } catch (err) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to edit history: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      try {
        fs.unlinkSync(filePath);
        fs.rmdirSync(tmpDir);
      } catch {
        /* ignore */
      }
    }
  },
};
