/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { createMockConfig } from '../../test-utils/mockConfig.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the model dialog', async () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const result = await modelCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should call refreshUserQuota if config is available', async () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const mockRefreshUserQuota = vi.fn();
    mockContext.services.config = createMockConfig({
      refreshUserQuota: mockRefreshUserQuota,
    });

    await modelCommand.action(mockContext, '');

    expect(mockRefreshUserQuota).toHaveBeenCalled();
  });

  it('should have the correct name and description', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe(
      'Opens a dialog to configure the model',
    );
  });

  it('should switch model if an argument is provided', async () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const mockSetModel = vi.fn();
    mockContext.services.config = createMockConfig({
      setModel: mockSetModel,
    });

    await modelCommand.action(mockContext, 'gemini-3-pro-preview');

    expect(mockSetModel).toHaveBeenCalledWith('gemini-3-pro-preview', true);
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: 'Switched to model gemini-3-pro-preview',
      }),
    );
  });
});
