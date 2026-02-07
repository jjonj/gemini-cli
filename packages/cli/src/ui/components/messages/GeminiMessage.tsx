/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { getRevertedColor } from '../../../omni/undoStyles.js';
import { RevertedWrapper } from '../../../omni/RevertedWrapper.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  reverted?: boolean;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
  reverted,
}) => {
  const { renderMarkdown } = useUIState();
  const prefix = '✦ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text
          color={reverted ? getRevertedColor() : theme.text.accent}
          aria-label={SCREEN_READER_MODEL_PREFIX}
        >
          {prefix}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <RevertedWrapper reverted={reverted} text={text}>
          <MarkdownDisplay
            text={text}
            isPending={isPending}
            availableTerminalHeight={
              availableTerminalHeight === undefined
                ? undefined
                : Math.max(availableTerminalHeight - 1, 1)
            }
            terminalWidth={Math.max(terminalWidth - prefixWidth, 0)}
            renderMarkdown={renderMarkdown}
          />
        </RevertedWrapper>
      </Box>
    </Box>
  );
};
