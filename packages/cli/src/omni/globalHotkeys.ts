/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ModelSlashCommandEvent,
  logModelSlashCommand,
} from '@google/gemini-cli-core';
import type { Key } from '../ui/hooks/useKeypress.js';
import { MessageType } from '../ui/types.js';

/**
 * Omni-specific handler for global hotkeys.
 * Returns true if the keypress was handled, false otherwise.
 */
export function handleOmniGlobalKeypress(
  key: Key,
  context: {
    config: any;
    addItem: (item: any) => void;
  },
): boolean {
  console.log(`[OmniHotkey] Got key: ${key.name}, ctrl: ${key.ctrl}, alt: ${key.alt}`);
  // Only handle if no modifiers are pressed
  if (key.ctrl || key.shift || key.alt || key.cmd) {
    return false;
  }

  // Fetch available models dynamically
  const config = context.config;
  console.log(`[OmniHotkey] Accessing config service...`);
  const service = config.getModelConfigService?.();
  console.log(`[OmniHotkey] Service exists: ${!!service}`);
  
  const options = service?.getAvailableModelOptions({
    useGemini3_1: true,
    useGemini3_1FlashLite: true,
    useCustomTools: false,
    hasAccessToPreview: config.getHasAccessToPreviewModel?.() ?? false,
    hasAccessToProModel: true,
  }) ?? [];
  console.log(`[OmniHotkey] Fetched options count: ${options.length}`);

  console.log(`[OmniHotkey] Options content: ${JSON.stringify(options)}`);

  options.forEach((o: any) => console.log(`[OmniHotkey] Inspecting: ${o.name}`));

  let selectedModel: string | undefined;

  switch (key.name) {
    case 'f1':
      // F1: "Pro" and "3"
      selectedModel = options.find((o: any) => 
        o.name.toLowerCase().includes('pro') && o.name.includes('3')
      )?.modelId;
      break;
    case 'f2':
      // F2: "Flash" and "3", NOT "Lite"
      selectedModel = options.find((o: any) => 
        o.name.toLowerCase().includes('flash') && o.name.includes('3') && !o.name.toLowerCase().includes('lite')
      )?.modelId;
      break;
    case 'f3':
      // F3: "Lite" and "3"
      selectedModel = options.find((o: any) => 
        o.name.toLowerCase().includes('lite') && o.name.includes('3')
      )?.modelId;
      break;
    default:
      console.log(`[OmniHotkey] Key ${key.name} not mapped.`);
      return false;
  }

  console.log(`[OmniHotkey] Attempting to switch to: ${selectedModel}`);

  if (selectedModel) {
    context.config.setModel(selectedModel, true);
    console.log(`[OmniHotkey] Successfully called setModel for ${selectedModel}`);
    logModelSlashCommand(
      context.config,
      new ModelSlashCommandEvent(selectedModel),
    );
    context.addItem({
      type: MessageType.INFO,
      text: `Switched to model ${selectedModel}`,
    });
    return true;
  }

  console.log(`[OmniHotkey] Failed to switch: No model at index.`);
  return false;
}
