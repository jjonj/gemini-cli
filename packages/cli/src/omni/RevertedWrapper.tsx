/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { getRevertedColor } from './undoStyles.js';

interface RevertedWrapperProps {
  reverted?: boolean;
  children: React.ReactNode;
  text?: string;
  prefix?: string;
}

/**
 * A surgical wrapper that handles the "reverted" UI state.
 * If reverted is true, it displays a dimmed, strikethrough version of the text.
 * Otherwise, it renders the original children.
 */
export const RevertedWrapper: React.FC<RevertedWrapperProps> = ({
  reverted,
  children,
  text,
  prefix = '[ REVERTED ] ',
}) => {
  if (!reverted) {
    return <>{children}</>;
  }

  return (
    <Text color={getRevertedColor()} strikethrough dimColor>
      {prefix}{text}
    </Text>
  );
};

/**
 * Specialized indicator for ToolGroups to keep their layout consistent.
 */
export const RevertedIndicator: React.FC<{ reverted?: boolean }> = ({ reverted }) => {
  if (!reverted) return null;
  return (
    <Box paddingLeft={1}>
      <Text color={getRevertedColor()} bold italic>
        [ REVERTED ]
      </Text>
    </Box>
  );
};
