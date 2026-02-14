import {
  ModelSlashCommandEvent,
  logModelSlashCommand,
} from '@google/gemini-cli-core';
import { type CommandContext } from '../ui/commands/types.js';
import { MessageType } from '../ui/types.js';

/**
 * Omni-specific handler for the /model command.
 * Returns true if the command was handled (e.g. arguments were provided), 
 * false otherwise to allow default behavior.
 */
export async function handleModelCommandHook(
  context: CommandContext,
  args: string,
): Promise<boolean> {
  if (!args) {
    return false;
  }

  if (context.services.config) {
    context.services.config.setModel(args, true);
    logModelSlashCommand(
      context.services.config,
      new ModelSlashCommandEvent(args),
    );
    context.ui.addItem({
      type: MessageType.INFO,
      text: `Switched to model ${args}`,
    });
    return true;
  }

  return false;
}
