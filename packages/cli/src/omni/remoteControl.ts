/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import type { EventEmitter } from 'node:events';
import { appEvents, AppEvent } from '../utils/events.js';
import { debugLogger, type Question } from '@google/gemini-cli-core';

export interface RemoteControlOptions {
  pipeName?: string;
  registerExitHandler?: boolean;
}

/**
 * Starts the PID-specific Named Pipe server for remote control.
 */
export function startRemoteControl(options?: RemoteControlOptions): net.Server {
  const pid = process.pid;
  const pipeName = options?.pipeName ?? '\\\\.\\pipe\\omni-gemini-cli-' + pid;
  const registerExitHandler = options?.registerExitHandler ?? true;
  debugLogger.log(`[RemoteControl] Attempting to start server on ${pipeName}`);

  const server = net.createServer((socket) => {
    debugLogger.log(`Remote control client connected on ${pipeName}`);

    const writeRaw = (payload: object) => {
      try {
        socket.write(JSON.stringify(payload) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write to remote control socket: ${e}`);
      }
    };

    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.command === 'prompt' && msg.text) {
              if (appEvents.listenerCount(AppEvent.RemotePrompt) > 0) {
                appEvents.emit(AppEvent.RemotePrompt, msg.text);
              } else {
                debugLogger.log(
                  '[RemoteControl] Buffering prompt: waiting for listener...',
                );
                const bufferHandler = (event: string | symbol) => {
                  if (event === AppEvent.RemotePrompt) {
                    debugLogger.log('[RemoteControl] Flushing buffered prompt.');
                    // Small delay to ensure the listener is fully registered
                    setTimeout(() => {
                      appEvents.emit(AppEvent.RemotePrompt, msg.text);
                    }, 100);
                    (appEvents as EventEmitter).off(
                      'newListener',
                      bufferHandler,
                    );
                  }
                };
                (appEvents as any).on('newListener', bufferHandler);
              }
            } else if (msg.command === 'getHistory') {
              appEvents.emit(AppEvent.RequestRemoteHistory);
            } else if (msg.command === 'checkReadiness') {
              if (appEvents.listenerCount(AppEvent.RequestReadiness) > 0) {
                appEvents.emit(AppEvent.RequestReadiness);
              } else {
                debugLogger.log(
                  '[RemoteControl] Buffering readiness request: waiting for listener...',
                );
                const bufferHandler = (event: string | symbol) => {
                  if (event === AppEvent.RequestReadiness) {
                    debugLogger.log(
                      '[RemoteControl] Flushing buffered readiness request.',
                    );
                    setTimeout(() => {
                      appEvents.emit(AppEvent.RequestReadiness);
                    }, 100);
                    (appEvents as EventEmitter).off(
                      'newListener',
                      bufferHandler,
                    );
                  }
                };
                (appEvents as any).on('newListener', bufferHandler);
              }
            } else if (
              msg.command === 'dialogResponse' &&
              typeof msg.response === 'string'
            ) {
              appEvents.emit(AppEvent.RemoteDialogResponse, {
                response: msg.response,
                dialogType:
                  typeof msg.dialogType === 'string'
                    ? msg.dialogType
                    : undefined,
              });
            }
          } catch (e) {
            debugLogger.error(`Failed to parse remote command: ${e}`);
          }
        }
      }
    });

    const onResponse = (text: string) => {
      writeRaw({ type: 'response', text });
    };

    const onThought = (text: string) => {
      writeRaw({ type: 'thought', text });
    };

    const onCodeDiff = (text: string) => {
      writeRaw({ type: 'codeDiff', text });
    };

    const onToolCall = (text: string) => {
      writeRaw({ type: 'toolCall', text });
    };

    const onDialog = (data: {
      type: string;
      prompt: string;
      options?: string[];
      questions?: Question[];
    }) => {
      writeRaw({
        type: 'dialog',
        dialogType: data.type,
        prompt: data.prompt,
        options: data.options,
        questions: data.questions,
      });
    };

    const onTurnEnd = (data: {
      reason: string;
      category: string;
      finishReason?: string;
      message?: string;
      source?: string;
      promptId?: string;
      timestamp?: string;
      workspacePath?: string;
      workspaceName?: string;
    }) => {
      writeRaw({ type: 'turn_end', ...data });
    };

    const onStatus = (status: string) => {
      writeRaw({ type: 'status', status });
    };

    const onHistory = (text: string) => {
      writeRaw({ type: 'history', text });
    };

    appEvents.on(AppEvent.RemoteResponse, onResponse);
    appEvents.on(AppEvent.RemoteThought, onThought);
    appEvents.on(AppEvent.RemoteCodeDiff, onCodeDiff);
    appEvents.on(AppEvent.RemoteToolCall, onToolCall);
    appEvents.on(AppEvent.RemoteDialog, onDialog);
    appEvents.on(AppEvent.RemoteTurnEnd, onTurnEnd);
    appEvents.on(AppEvent.RemoteStatus, onStatus);
    appEvents.on(AppEvent.RemoteHistory, onHistory);

    socket.on('close', () => {
      appEvents.off(AppEvent.RemoteResponse, onResponse);
      appEvents.off(AppEvent.RemoteThought, onThought);
      appEvents.off(AppEvent.RemoteCodeDiff, onCodeDiff);
      appEvents.off(AppEvent.RemoteToolCall, onToolCall);
      appEvents.off(AppEvent.RemoteDialog, onDialog);
      appEvents.off(AppEvent.RemoteTurnEnd, onTurnEnd);
      appEvents.off(AppEvent.RemoteStatus, onStatus);
      appEvents.off(AppEvent.RemoteHistory, onHistory);
      debugLogger.log('Remote control client disconnected');
    });

    socket.on('error', (err) => {
      debugLogger.error(`Remote control socket error: ${err}`);
    });
  });

  server.on('error', (err: unknown) => {
    debugLogger.error(`Remote control server error: ${err}`);
  });

  try {
    server.listen(pipeName, () => {
      debugLogger.log(`[RemoteControl] Server is now listening on ${pipeName}`);
    });
  } catch (err) {
    debugLogger.error(`Failed to start remote control server: ${err}`);
  }

  if (registerExitHandler) {
    process.on('exit', () => {
      try {
        server.close();
      } catch (_e) {
        // Ignore cleanup errors
      }
    });
  }

  return server;
}
