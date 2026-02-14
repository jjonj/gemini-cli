/**
 * Omni-specific event payloads and types.
 */

export interface RemoteTurnEndPayload {
  reason: string;
  category: 'intentional' | 'forced' | 'error' | 'unknown';
  finishReason?: string;
  message?: string;
  source?: string;
  promptId?: string;
  timestamp?: string;
  workspacePath?: string;
  workspaceName?: string;
}

export interface RemoteDialogResponseData {
  response: string;
  dialogType?: string;
}

export type RemoteDialogResponsePayload = string | RemoteDialogResponseData;
