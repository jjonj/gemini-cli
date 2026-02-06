/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export enum TransientMessageType {
  Warning = 'warning',
  Hint = 'hint',
}

export interface TransientMessagePayload {
  message: string;
  type: TransientMessageType;
}

export enum AppEvent {
  OpenDebugConsole = 'open-debug-console',
  Flicker = 'flicker',
  SelectionWarning = 'selection-warning',
  PasteTimeout = 'paste-timeout',
  TerminalBackground = 'terminal-background',
  TransientMessage = 'transient-message',
  ScrollToBottom = 'scroll-to-bottom',
  RemotePrompt = 'remote-prompt',
  RemoteResponse = 'remote-response',
  RemoteThought = 'remote-thought',
  RemoteCodeDiff = 'remote-code-diff',
  RemoteToolCall = 'remote-tool-call',
  RemoteDialog = 'remote-dialog',
  RemoteDialogResponse = 'remote-dialog-response',
  RequestRemoteHistory = 'request-remote-history',
}

export interface AppEvents {
  [AppEvent.OpenDebugConsole]: never[];
  [AppEvent.Flicker]: never[];
  [AppEvent.SelectionWarning]: never[];
  [AppEvent.PasteTimeout]: never[];
  [AppEvent.TerminalBackground]: [string];
  [AppEvent.TransientMessage]: [TransientMessagePayload];
  [AppEvent.ScrollToBottom]: never[];
  [AppEvent.RemotePrompt]: [string];
  [AppEvent.RemoteResponse]: [string];
  [AppEvent.RemoteThought]: [string];
  [AppEvent.RemoteCodeDiff]: [string];
  [AppEvent.RemoteToolCall]: [string];
  [AppEvent.RemoteDialog]: [{ type: string; prompt: string; options?: string[] }];
  [AppEvent.RemoteDialogResponse]: [string];
  [AppEvent.RequestRemoteHistory]: never[];
}

export const appEvents = new EventEmitter<AppEvents>();
