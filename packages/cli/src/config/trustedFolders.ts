/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type HeadlessModeOptions,
  checkPathTrust,
  isHeadlessMode,
  loadTrustedFolders as loadCoreTrustedFolders,
  LoadedTrustedFolders,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
import { workspaceService } from '../omni/WorkspaceService.js';

export {
  TrustLevel,
  isTrustLevel,
  resetTrustedFoldersForTesting,
  saveTrustedFolders,
  LoadedTrustedFolders,
} from '@google/gemini-cli-core';

export type {
  TrustRule,
  TrustedFoldersError,
  TrustedFoldersFile,
  TrustResult,
} from '@google/gemini-cli-core';

/** Is folder trust feature enabled per the current applied settings */
export function isFolderTrustEnabled(settings: Settings): boolean {
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? true;
  return folderTrustSetting;
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  return loadCoreTrustedFolders();
}

export function isWorkspaceTrusted(
  settings: Settings,
  workspaceDir: string = workspaceService.getWorkspaceRoot(),
  headlessOptions?: HeadlessModeOptions,
): {
  isTrusted: boolean | undefined;
  source: 'ide' | 'file' | 'env' | undefined;
} {
  return checkPathTrust({
    path: workspaceDir,
    isFolderTrustEnabled: isFolderTrustEnabled(settings),
    isHeadless: isHeadlessMode(headlessOptions),
  });
}
