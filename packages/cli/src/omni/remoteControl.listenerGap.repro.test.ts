/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startRemoteControl } from './remoteControl.js';
import { appEvents, AppEvent } from '../utils/events.js';

function getPipeName(): string {
  return `\\\\.\\pipe\\omni-gemini-cli-repro-${process.pid}-${Date.now()}`;
}

function waitForLine(
  socket: net.Socket,
  timeoutMs = 400,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out waiting for pipe output after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString('utf8');
      const idx = buffer.indexOf('\n');
      if (idx >= 0) {
        const line = buffer.slice(0, idx);
        cleanup();
        resolve(line);
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

describe('remoteControl listener gap reproduction', () => {
  afterEach(() => {
    appEvents.removeAllListeners(AppEvent.RemotePrompt);
    appEvents.removeAllListeners(AppEvent.RequestRemoteHistory);
    appEvents.removeAllListeners(AppEvent.RemoteResponse);
    appEvents.removeAllListeners(AppEvent.RemoteThought);
    appEvents.removeAllListeners(AppEvent.RemoteCodeDiff);
    appEvents.removeAllListeners(AppEvent.RemoteToolCall);
    appEvents.removeAllListeners(AppEvent.RemoteDialog);
    appEvents.removeAllListeners(AppEvent.RemoteTurnEnd);
  });

  it('reproduces lost prompt behavior when no RemotePrompt consumer is registered', async () => {
    const pipeName = getPipeName();
    const server = startRemoteControl({
      pipeName,
      registerExitHandler: false,
    });
    const client = net.createConnection(pipeName);

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off('connect', onConnect);
        client.off('error', onError);
      };
      client.on('connect', onConnect);
      client.on('error', onError);
    });

    expect(appEvents.listenerCount(AppEvent.RemotePrompt)).toBe(0);
    client.write(`${JSON.stringify({ command: 'prompt', text: 'hello' })}\n`);

    // With no runtime prompt consumer wired in, this prompt is never processed.
    await expect(waitForLine(client, 500)).rejects.toThrow(
      /Timed out waiting for pipe output/,
    );

    client.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
