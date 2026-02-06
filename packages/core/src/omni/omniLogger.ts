/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

export class OmniLogger {
  private static readonly LOG_FILE_NAME = 'api_errors.log';
  private static readonly OMNI_DIR_NAME = 'Omni';

  /**
   * Logs an error and the current conversation history to Omni/api_errors.log.
   */
  static logApiError(error: any, history: any[]): void {
    try {
      const omniDirPath = path.join(process.cwd(), this.OMNI_DIR_NAME);
      
      // Ensure Omni directory exists
      if (!fs.existsSync(omniDirPath)) {
        fs.mkdirSync(omniDirPath, { recursive: true });
      }

      const logFilePath = path.join(omniDirPath, this.LOG_FILE_NAME);
      const timestamp = new Date().toISOString();
      
      const logEntry = {
        timestamp,
        error: {
          message: error.message,
          stack: error.stack,
          status: error.status || error.code || (error.response ? error.response.status : undefined),
          raw: error
        },
        historySnapshot: history
      };

      const logString = `
--- API ERROR ${timestamp} ---
${JSON.stringify(logEntry, null, 2)}
`;
      
      fs.appendFileSync(logFilePath, logString, 'utf8');
    } catch (logErr) {
      // Fail silently for logger errors to avoid crashing the main process, 
      // but try to log to console as a last resort.
      console.error('OmniLogger failed to write log:', logErr);
    }
  }

  /**
   * General purpose high-fidelity log.
   */
  static log(message: string, data?: any): void {
    try {
      const omniDirPath = path.join(process.cwd(), this.OMNI_DIR_NAME);
      if (!fs.existsSync(omniDirPath)) return;

      const logFilePath = path.join(omniDirPath, this.LOG_FILE_NAME);
      const timestamp = new Date().toISOString();
      const entry = {
        timestamp,
        message,
        data
      };
      
      fs.appendFileSync(logFilePath, `
--- LOG ${timestamp} ---
${JSON.stringify(entry, null, 2)}
`, 'utf8');
    } catch (e) {
      // Ignore
    }
  }
}
