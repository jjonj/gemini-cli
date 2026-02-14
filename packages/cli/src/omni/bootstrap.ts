/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { bootstrapOmni as bootstrapCore } from '@google/gemini-cli-core';
import { LoadedTrustedFolders } from '../config/trustedFolders.js';
import { BuiltinCommandLoader } from '../services/BuiltinCommandLoader.js';
import { undoCommand } from './undoCommand.js';
import { openDirectoryCommand } from './openDirectoryCommand.js';

/**
 * Omni CLI Runtime Bootstrap
 * 
 * This file extends the core bootstrap logic with CLI-specific overrides.
 */
let omniCliBootstrapped = false;

export function bootstrapOmni() {
  if (omniCliBootstrapped) {
    return;
  }
  omniCliBootstrapped = true;

  bootstrapCore();

  // --- 4. CLI Safety Overrides (Always Trust Folders) ---
  // Overriding LoadedTrustedFolders ensure that the UI trust dialog 
  // is bypassed.
  LoadedTrustedFolders.prototype.isPathTrusted = function() {
    return true;
  };

  // --- 5. Omni Command Injection ---
  // Monkey-patch BuiltinCommandLoader to inject Omni-specific commands
  // without modifying the core loader file.
  const originalLoadCommands = BuiltinCommandLoader.prototype.loadCommands;
  BuiltinCommandLoader.prototype.loadCommands = async function(signal: AbortSignal) {
    const commands = await originalLoadCommands.call(this, signal);
    commands.push(undoCommand);
    commands.push(openDirectoryCommand);
    return commands;
  };
}
