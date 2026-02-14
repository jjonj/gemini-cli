/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

type SessionEventType = 'api_error' | 'turn_end' | 'log';

export interface TurnEndLogPayload {
  reason: string;
  category?: 'intentional' | 'forced' | 'error' | 'unknown';
  finishReason?: string;
  message?: string;
  promptId?: string;
  source?: string;
  details?: unknown;
  workspacePath?: string;
  workspaceName?: string;
}

export class OmniLogger {
  private static readonly LOG_FILE_NAME = 'session_events.log';
  private static readonly BASE_LOG_DIR = 'D:\\SSDProjects\\Tools\\omni-gemini-cli\\Omni';
  private static workspaceRoot: string | null = null;

  static setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  private static resolveWorkspaceInfo(
    workspacePathOverride?: string,
    workspaceNameOverride?: string,
  ): { workspacePath: string; workspaceName: string } {
    const workspacePath =
      workspacePathOverride ||
      this.workspaceRoot ||
      process.cwd();
    const workspaceName =
      workspaceNameOverride ||
      path.basename(workspacePath) ||
      'unknown-workspace';

    return { workspacePath, workspaceName };
  }

  /**
   * Returns the path to the log file for the current workspace.
   * Ensures the directory exists.
   */
  private static getLogFilePath(workspaceName: string): string {
    const workspaceLogDir = path.join(this.BASE_LOG_DIR, workspaceName);
    
    if (!fs.existsSync(workspaceLogDir)) {
      fs.mkdirSync(workspaceLogDir, { recursive: true });
    }
    
    return path.join(workspaceLogDir, this.LOG_FILE_NAME);
  }

  private static appendEvent(
    eventType: SessionEventType,
    payload: Record<string, unknown>,
    workspacePathOverride?: string,
    workspaceNameOverride?: string,
  ): void {
    const timestamp = new Date().toISOString();
    const { workspacePath, workspaceName } = this.resolveWorkspaceInfo(
      workspacePathOverride,
      workspaceNameOverride,
    );
    const logFilePath = this.getLogFilePath(workspaceName);
    const entry = {
      timestamp,
      eventType,
      workspacePath,
      workspaceName,
      pid: process.pid,
      ...payload,
    };

    fs.appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  /**
   * Logs an error to the centralized log.
   */
  static logApiError(
    error: unknown,
    metadata?: { source?: string; workspacePath?: string; workspaceName?: string },
  ): void {
    if (this.isAbortLikeError(error)) {
      return;
    }
    try {
      const err = error as any;
      
      // Extract a meaningful message
      let message = err?.message || (typeof error === 'string' ? error : undefined);
      
      // If it's a telemetry event (ApiErrorEvent), it has an .error property which is the message string
      if (err?.['event.name'] === 'api_error' && typeof err.error === 'string') {
        message = err.error;
      }

      this.appendEvent(
        'api_error',
        {
          source: metadata?.source,
          error: {
            message,
            stack: err?.stack,
            status:
              err?.status_code ||
              err?.status ||
              err?.code ||
              (err?.response ? err.response.status : undefined),
            name: err?.name || err?.error_type,
            raw: err,
          },
        },
        metadata?.workspacePath,
        metadata?.workspaceName,
      );
    } catch (logErr) {
      // Fail silently for logger errors to avoid crashing the main process,
      // but try to log to console as a last resort.
      console.error('OmniLogger failed to write log:', logErr);
    }
  }

  static logTurnEnd(payload: TurnEndLogPayload): void {
    try {
      this.appendEvent(
        'turn_end',
        {
          reason: payload.reason,
          category: payload.category || 'unknown',
          finishReason: payload.finishReason,
          message: payload.message,
          promptId: payload.promptId,
          source: payload.source,
          details: payload.details,
        },
        payload.workspacePath,
        payload.workspaceName,
      );
    } catch (logErr) {
      console.error('OmniLogger failed to write turn_end event:', logErr);
    }
  }

  static isAbortLikeError(error: unknown): boolean {
    const err = error as any;
    const name = String(err?.name || '');
    const message = String(err?.message || '').toLowerCase();
    const rawType = String(err?.type || err?.raw?.type || '').toLowerCase();
    return (
      name === 'AbortError' ||
      rawType === 'aborted' ||
      message.includes('aborted') ||
      message.includes('user aborted')
    );
  }

  /**
   * General purpose high-fidelity log.
   */
  static log(
    _message: string,
    _data?: unknown,
    _metadata?: { source?: string; workspacePath?: string; workspaceName?: string },
  ): void {
    // Disabled to avoid polluting session_events.log with general logs.
    // Use logApiError or logTurnEnd for important events.
  }
}
