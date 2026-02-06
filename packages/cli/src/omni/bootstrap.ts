/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { bootstrapOmni as bootstrapCore } from '@google/gemini-cli-core';
import { LoadedTrustedFolders } from '../config/trustedFolders.js';

/**
 * Omni CLI Runtime Bootstrap
 * 
 * This file extends the core bootstrap logic with CLI-specific overrides.
 */
export function bootstrapOmni() {
  bootstrapCore();

  // --- 4. CLI Safety Overrides (Always Trust Folders) ---
  // Overriding LoadedTrustedFolders ensure that the UI trust dialog 
  // is bypassed.
  LoadedTrustedFolders.prototype.isPathTrusted = function() {
    return true;
  };
}
