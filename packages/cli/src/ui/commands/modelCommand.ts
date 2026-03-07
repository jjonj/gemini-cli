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
import { MessageType } from '../types.js';

const setModelCommand: SlashCommand = {
  name: 'set',
  description:
    'Set the model to use. Usage: /model set <model-name> [--persist]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { ModelSlashCommandEvent, logModelSlashCommand } =
      await import('@google/gemini-cli-core');

    const parts = args.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /model set <model-name> [--persist]',
      });
      return;
    }

    const modelName = parts[0];
    const persist = parts.includes('--persist');

    if (context.services.agentContext?.config) {
      const config = context.services.agentContext.config;
      config.setModel(modelName, !persist);
      const event = new ModelSlashCommandEvent(modelName);
      logModelSlashCommand(config, event);

      context.ui.addItem({
        type: MessageType.INFO,
        text: `Model set to ${modelName}${persist ? ' (persisted)' : ''}`,
      });
    }
  },
};

const manageModelCommand: SlashCommand = {
  name: 'manage',
  description: 'Opens a dialog to configure the model',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    if (context.services.agentContext?.config) {
      await context.services.agentContext.config.refreshUserQuota();
    }
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Configuration for the model',
  kind: CommandKind.BUILT_IN,
  subCommands: [setModelCommand, manageModelCommand],
  action: async (context: CommandContext, args: string) => {
    if (await handleModelCommandHook(context, args)) {
      return;
    }

    return manageModelCommand.action!(context, args);
  },
};
