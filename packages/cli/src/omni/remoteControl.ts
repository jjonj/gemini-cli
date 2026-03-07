/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import type { EventEmitter } from 'node:events';
import { appEvents, AppEvent } from '../utils/events.js';
import { debugLogger, type Question } from '@google/gemini-cli-core';

/**
 * Starts the PID-specific Named Pipe server for remote control.
 */
export function startRemoteControl() {
  const pid = process.pid;
  const pipeName = '\\\\.\\pipe\\omni-gemini-cli-' + pid;
  debugLogger.log(`[RemoteControl] Attempting to start server on ${pipeName}`);

  const server = net.createServer((socket) => {
    debugLogger.log(`Remote control client connected on ${pipeName}`);

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
            } else if (msg.command === 'response' && msg.text) {
              appEvents.emit(AppEvent.RemoteDialogResponse, msg.text);
            } else if (msg.command === 'history') {
              appEvents.emit(AppEvent.RequestRemoteHistory);
            } else if (msg.command === 'readiness') {
              appEvents.emit(AppEvent.RequestReadiness);
            }
          } catch (e) {
            debugLogger.error(`Failed to parse remote control message: ${e}`);
          }
        }
      }
    });

    const onResponse = (text: string) => {
      try {
        socket.write(JSON.stringify({ type: 'response', text }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write response to remote control socket: ${e}`);
      }
    };

    const onThought = (thought: string) => {
      try {
        socket.write(JSON.stringify({ type: 'thought', thought }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write thought to remote control socket: ${e}`);
      }
    };

    const onCodeDiff = (diff: string) => {
      try {
        socket.write(JSON.stringify({ type: 'code_diff', diff }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write code_diff to remote control socket: ${e}`);
      }
    };

    const onToolCall = (toolCall: string) => {
      try {
        socket.write(JSON.stringify({ type: 'tool_call', toolCall }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write tool_call to remote control socket: ${e}`);
      }
    };

    const onDialog = (data: { type: string; prompt: string; options?: string[]; questions?: Question[] }) => {
      try {
        socket.write(JSON.stringify(data) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write dialog to remote control socket: ${e}`);
      }
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
      try {
        socket.write(JSON.stringify({ type: 'turn_end', ...data }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write turn_end to remote control socket: ${e}`);
      }
    };

    const onStatus = (status: string) => {
      try {
        socket.write(JSON.stringify({ type: 'status', status }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write status to remote control socket: ${e}`);
      }
    };

    const onHistory = (text: string) => {
      try {
        socket.write(JSON.stringify({ type: 'history', text }) + '\n');
      } catch (e) {
        debugLogger.error(`Failed to write history to remote control socket: ${e}`);
      }
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

  process.on('exit', () => {
    try {
      server.close();
    } catch (_e) {
      // Ignore cleanup errors
    }
  });
}
