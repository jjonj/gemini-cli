/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SlashCommand, CommandKind } from '../ui/commands/types.js';

/**
 * Reverts the chat history one turn (User message + AI response).
 */
export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Revert the chat history one turn',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    if (geminiClient) {
      const chat = geminiClient.getChat();
      chat.rollbackTurn();
      context.ui.undo();
      return {
        type: 'message',
        messageType: 'info',
        content: 'Last turn reverted.',
      };
    }
    return {
      type: 'message',
      messageType: 'error',
      content: 'Undo failed: Gemini client not initialized.',
    };
  },
};
