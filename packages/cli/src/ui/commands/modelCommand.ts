/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { handleModelCommandHook } from '../../omni/commands.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Opens a dialog to configure the model',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    if (await handleModelCommandHook(context, args)) {
      return;
    }

    if (context.services.config) {
      await context.services.config.refreshUserQuota();
    }
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};
