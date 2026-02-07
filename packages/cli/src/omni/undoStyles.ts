/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { theme } from '../ui/semantic-colors.js';

/**
 * Returns the color to use for text in a reverted turn.
 */
export const getRevertedColor = () => theme.text.secondary;

/**
 * Returns the color to use for prefixes/borders in a reverted turn.
 */
export const getRevertedBorderColor = () => theme.text.secondary;
