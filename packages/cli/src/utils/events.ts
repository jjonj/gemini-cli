/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { type Question } from '@google/gemini-cli-core';
import type {
  RemoteTurnEndPayload,
  RemoteDialogResponsePayload,
} from '../omni/events.js';

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
  RemoteTurnEnd = 'remote-turn-end',
  RemoteHistory = 'remote-history',
  RemoteStatus = 'remote-status',
  RequestReadiness = 'request-readiness',
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
  [AppEvent.RemoteDialog]: [
    { type: string; prompt: string; options?: string[]; questions?: Question[] },
  ];
  [AppEvent.RemoteDialogResponse]: [RemoteDialogResponsePayload];
  [AppEvent.RemoteTurnEnd]: [RemoteTurnEndPayload];
  [AppEvent.RequestRemoteHistory]: never[];
  [AppEvent.RemoteHistory]: [string];
  [AppEvent.RemoteStatus]: [string];
  [AppEvent.RequestReadiness]: never[];
}

export const appEvents = new EventEmitter<AppEvents>();
