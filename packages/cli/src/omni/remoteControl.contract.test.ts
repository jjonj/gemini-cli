/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { appEvents, AppEvent } from '../utils/events.js';
import { startRemoteControl } from './remoteControl.js';

interface BridgeContract {
  pipe: {
    commands: Array<{ name: string; requiredProperties: string[] }>;
    events: Array<{ type: string; requiredProperties: string[] }>;
  };
}

function findContractPath(): string {
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidates = [
      path.join(
        current,
        'Omni',
        'TestScripts',
        'AIFeature',
        'Contracts',
        'omni-ai-bridge-v1.json',
      ),
      path.join(current, 'Contracts', 'omni-ai-bridge-v1.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error('Could not locate Contracts/omni-ai-bridge-v1.json');
}

function getPipeName(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\omni-gemini-cli-contract-${process.pid}-${Date.now()}`;
  }
  return path.join(
    os.tmpdir(),
    `omni-gemini-cli-contract-${process.pid}-${Date.now()}.sock`,
  );
}

function waitForLine(socket: net.Socket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      socket.off('data', onData);
      socket.off('error', onError);
      reject(new Error(`Timed out waiting for pipe output after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const idx = buffer.indexOf('\n');
      if (idx >= 0) {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(buffer.slice(0, idx));
      }
    };

    const onError = (err: Error) => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      reject(err);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function waitForRemoteListeners(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (appEvents.listenerCount(AppEvent.RemoteResponse) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for remoteControl event listeners');
}

describe('remoteControl contract', () => {
  const contract = JSON.parse(
    fs.readFileSync(findContractPath(), 'utf-8'),
  ) as BridgeContract;
  const commandNames = new Set(contract.pipe.commands.map((c) => c.name));
  const eventTypes = new Set(contract.pipe.events.map((e) => e.type));

  it('supports contract-required incoming commands and outgoing events', async () => {
    const pipeName = getPipeName();
    const server = startRemoteControl({
      pipeName,
      registerExitHandler: false,
    });

    if (!server.listening) {
      await once(server, 'listening');
    }

    const client = net.createConnection(pipeName);
    await once(client, 'connect');
    await waitForRemoteListeners();

    expect(commandNames.has('prompt')).toBe(true);
    expect(commandNames.has('getHistory')).toBe(true);
    expect(commandNames.has('dialogResponse')).toBe(true);

    const promptEvent = once(appEvents, AppEvent.RemotePrompt);
    client.write(`${JSON.stringify({ command: 'prompt', text: 'hello' })}\n`);
    await expect(promptEvent).resolves.toEqual(['hello']);

    const historyEvent = once(appEvents, AppEvent.RequestRemoteHistory);
    client.write(`${JSON.stringify({ command: 'getHistory', text: '' })}\n`);
    await expect(historyEvent).resolves.toEqual([]);

    const dialogEvent = once(appEvents, AppEvent.RemoteDialogResponse);
    client.write(
      `${JSON.stringify({
        command: 'dialogResponse',
        response: 'yes',
        dialogType: 'tool:abc',
      })}\n`,
    );
    await expect(dialogEvent).resolves.toEqual([
      { response: 'yes', dialogType: 'tool:abc' },
    ]);

    expect(eventTypes.has('response')).toBe(true);
    expect(eventTypes.has('thought')).toBe(true);
    expect(eventTypes.has('codeDiff')).toBe(true);
    expect(eventTypes.has('dialog')).toBe(true);
    expect(eventTypes.has('turn_end')).toBe(true);

    const responseLine = waitForLine(client);
    appEvents.emit(AppEvent.RemoteResponse, 'answer');
    await expect(responseLine).resolves.toBe(JSON.stringify({ type: 'response', text: 'answer' }));

    const thoughtLine = waitForLine(client);
    appEvents.emit(AppEvent.RemoteThought, 'thinking');
    await expect(thoughtLine).resolves.toBe(JSON.stringify({ type: 'thought', text: 'thinking' }));

    const dialogLine = waitForLine(client);
    appEvents.emit(AppEvent.RemoteDialog, {
      type: 'ready',
      prompt: 'Gemini CLI is ready.',
      options: [],
    });
    await expect(dialogLine).resolves.toBe(
      JSON.stringify({
        type: 'dialog',
        dialogType: 'ready',
        prompt: 'Gemini CLI is ready.',
        options: [],
      }),
    );

    const turnEndLine = waitForLine(client);
    appEvents.emit(AppEvent.RemoteTurnEnd, {
      reason: 'turn completed',
      category: 'intentional',
      workspaceName: 'SSDProjects',
    });
    await expect(turnEndLine).resolves.toBe(
      JSON.stringify({
        type: 'turn_end',
        reason: 'turn completed',
        category: 'intentional',
        workspaceName: 'SSDProjects',
      }),
    );

    if (!client.destroyed) {
      client.destroy();
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));

    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(pipeName);
      } catch {
        // Ignore cleanup errors for stale socket paths.
      }
    }
  });
});
