/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import { type SlashCommand, CommandKind } from '../ui/commands/types.js';
import { workspaceService } from './WorkspaceService.js';

/**
 * Opens the current workspace directory in the OS file explorer.
 */
export const openDirectoryCommand: SlashCommand = {
  name: 'od',
  description: 'Open the workspace directory in file explorer',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context, _args) => {
    const root = workspaceService.getWorkspaceRoot();
    try {
      await open(root);
      return {
        type: 'message',
        messageType: 'info',
        content: `Opened directory: ${root}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to open directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
