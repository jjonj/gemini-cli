/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/**
 * Service to manage the application's workspace context.
 */
class WorkspaceService {
  private workspaceRoot: string;

  constructor() {
    // Default to process.cwd() if not set.
    this.workspaceRoot = process.cwd();
  }

  /**
   * Sets the workspace root directory.
   */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = path.resolve(root);
  }

  /**
   * Gets the current workspace root directory.
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Gets the basename of the workspace root.
   */
  getWorkspaceName(): string {
    return path.basename(this.workspaceRoot);
  }
}

// Export a singleton instance of the service.
export const workspaceService = new WorkspaceService();
