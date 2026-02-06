# Specification - Track: api_resilience_20260117

## Overview
This track addresses recurring and unrecoverable 400/500 API errors (specifically "mismatched function parts" and related state-breaking errors) in the Gemini CLI. The goal is to move from a basic, often insufficient single-turn rollback to a robust, user-informed recovery system supported by high-fidelity logging. This is a long-running track that will remain open until the user confirms a week of error-free operation.

## User Stories
- As a developer, I want the CLI to capture the exact state of a failing API call so that the issue can be diagnosed without me having to manually reproduce it.
- As a developer, when an API error occurs that isn't fixed by a simple retry, I want to be presented with options (like deep rollback or turn clearing) so I can maintain control over my session.

## Functional Requirements
- **High-Fidelity Logging System:**
    - Implementation of `OmniLogger` to record to `Omni/api_errors.log`.
    - Capture full JSON conversation history (snapshots) sent during failing requests.
    - Record raw API response bodies and relevant headers for 400/500 errors.
    - Log internal thought streams and tool results leading up to the failure.
    - Automatic log rotation/organization by session/date.
- **Interactive Recovery Mechanism:**
    - Detect when a basic rollback (current logic) fails to resolve a 400 error.
    - Specifically catch "mismatched function parts" errors and transition them to the interactive recovery flow (previously handled by silent rollback).
    - Halt execution and prompt the user in the CLI/Remote UI with recovery options:
        1. **Deep Rollback:** Remove the entire current turn (User message + subsequent parts).
        2. **Clear Current Turn:** Specifically target the offending parts if identifiable.
        3. **Export Diagnostic Log:** Provide a direct reference to the saved log file for analysis.
- **Manual History Management (2026-01-20):**
    - Implementation of `/undo` command to revert the chat history by one full AI turn.
    - **Surgical Undo:** The command specifically removes the AI's response while keeping the user's prompt visible, allowing for quick iterative prompt refinement.
    - **Visual Feedback:** Reverted turns are visually "crossed out" using strikethrough, dimmed colors, and an explicit `[ REVERTED ]` prefix to ensure the user knows which parts of the history are no longer active.
    - Ensures both UI history and model-side context are synchronized during the rollback.
- **Persistence:** Logging must occur before the error is thrown or any state is modified to ensure data integrity.

## Non-Functional Requirements
- **Reliability:** The logging mechanism itself must not introduce new points of failure (e.g., using `fs.appendFileSync` or robust error handling for I/O).
- **Modularity:** Recovery logic should be centralized in `GeminiChat.ts` to ensure consistency across all tool-use loops.

## Acceptance Criteria
- [x] Every 400/500 error results in a detailed entry in `Omni/api_errors.log`.
- [x] Users are presented with a recovery menu when unrecoverable errors occur.
- [x] Users can manually revert poisoned or unwanted turns using the `/undo` command.
- [ ] No unrecoverable 400 errors are observed by the user for 7 consecutive days.

## Implementation Details (Technical Reference)

### 1. High-Fidelity Logging (`OmniLogger`)
- **Location:** `packages/core/src/utils/omniLogger.ts`
- **Behavior:** Captures the full error stack, raw API response (headers + body), and a JSON snapshot of the `GeminiChat` history leading up to the failure.
- **Log Format:**
    ```
    [Timestamp] ERROR: Context
    Message: ...
    Stack: ...
    Response: { raw JSON }
    ---
    [Timestamp] Conversation History Snapshot
    Data: [ { history snapshot } ]
    ```
- **Rotation:** Automatically rotates logs when `api_errors.log` exceeds 10MB, appending a timestamp to the archived file.

### 2. Resilience Error Handling
- **New Error Class**: `ResilienceError` in `packages/core/src/utils/errors.ts`. Wraps the original API error.
- **Trigger**: Thrown by `GeminiChat.sendMessageStream` when a 400 error is detected or when `isMismatchedFunctionPartsError` (broadened to catch varied API messages) returns true.
- **Interactive UI**: Handled in `packages/cli/src/ui/hooks/useGeminiStream.ts`.
    - **Technical Note**: Due to cross-package bundling, `instanceof ResilienceError` may fail. The UI uses a robust check: `error instanceof ResilienceError || error?.name === 'ResilienceError' || error?.constructor?.name === 'ResilienceError'`.
    - Triggers the `ResilienceRecoveryDialog` via `OmniDialogManager`.

### 3. Recovery Strategies
- `Deep Rollback`: Found in `GeminiChat.rollbackDeep()`. Removes the last User message and everything following it. This is the most reliable "reset to safe state" option.
- `Clear Turn`: Found in `GeminiChat.clearCurrentTurn()`. Removes only the very last entry (usually the user prompt that failed).
- `Ignore`: Continues without history manipulation (useful if the error was transient or logic is handled elsewhere).

### 4. Logging & Diagnostics
- All unrecoverable errors trigger an `OmniLogger` dump.
- Logs are written to `Omni/api_errors.log` using absolute pathing for reliability.
- Extensive console logging is temporarily enabled in debug builds to verify recovery flow triggers.

### 5. Manual Undo Command (Update: 2026-01-20)
- **Command:** `/undo`
- **Location:** `packages/cli/src/omni/undoCommand.ts`
- **Logic Refinement:**
    - The `undo` logic in `useHistoryManager.ts` was enhanced to skip the `/undo` command itself when identifying the turn to revert.
    - It now finds the last active user message and marks all following items (AI responses, tool calls) as `reverted: true`.
    - UI components (`UserMessage`, `GeminiMessage`, `ToolGroupMessage`) were updated to render a `[ REVERTED ]` prefix, strikethrough text, and `dimColor` when this flag is present.
- **Model Sync:**
    - Calls `geminiClient.getChat().rollbackLastModelTurn()` (a new core method) to surgically remove only the last model response while leaving the user prompt in the model's context.
- **Terminal Reliability:**
    - `AppContainer.tsx` was updated to perform a more aggressive screen erase (`eraseScreen`, `cursorTo(0,0)`) during `refreshStatic` to ensure the new "crossed-out" state is rendered cleanly without artifacts.

## Out of Scope
- Fixing the underlying Gemini API logic (we are mitigating the client-side impact).
- Redesigning the core history management system beyond the recovery hooks.

## Post-Implementation Investigation (2026-01-19)
### Issue: Silent Failure (Missing Recovery Dialog)
Despite 400 errors being caught and logged to `Omni/api_errors.log`, the user was not presented with the recovery dialog.

### Root Cause Analysis (Callstack)
The investigation revealed a failure in the UI's conditional rendering logic:
1.  **Throw**: `GeminiChat.sendMessageStream` caught the 400 and threw `ResilienceError`.
2.  **Catch & State Update**: `useGeminiStream.ts` caught the error and updated the `resilienceRecoveryRequest` state.
3.  **Visibility Suppression**: `AppContainer.tsx` calculated `dialogsVisible` but omitted `resilienceRecoveryRequest` from the logic. Since no other dialogs were active, `dialogsVisible` was `false`.
4.  **Render Block**: `AppContainer.tsx` suppressed the rendering of the dialog layer (including `OmniDialogManager`), effectively hiding the recovery dialog from the user.

### Resolution
- Added `!!resilienceRecoveryRequest` to the `dialogsVisible` calculation in `AppContainer.tsx`.
- Implemented robust error type checking (`error.name === 'ResilienceError'`) to handle cross-bundle `instanceof` failures.
- Added comprehensive logging at every step of the callstack to ensure future failures are immediately traceable.

### 2026-01-21 Investigation: Persistent 400 Loops
#### Issue: Recovery/Undo fails to clear the error state
Despite triggering the recovery dialog or using `/undo`, the system would immediately return another 400 error upon the next user prompt.

#### Root Cause: Hanging Function Calls
The core history management's `rollbackDeep` method (used by the recovery menu) was too shallow. It only removed the *last* user entry. In a tool loop, the sequence is:
1. `user`: "some prompt"
2. `model`: `functionCall`
3. `user`: `functionResponse` (FAILS with 400)

Old `rollbackDeep` removed (3), leaving history ending at (2). Sending a new user prompt (4) created a sequence: `...model:functionCall, user:textPrompt`, which the Gemini API rejects with a 400 error because every `functionCall` must be immediately followed by its `functionResponse`.

#### Resolution
- **Surgical Rollback:** Refactored `GeminiChat.rollbackDeep()` to search backward for the last user message that is **not** a function response. This ensures the entire broken tool chain is wiped, returning the context to the last known good state where a new text prompt is valid.
- **Terminal Refresh:** Added aggressive screen clearing during history updates to ensure "Reverted" states are rendered without line-wrapping artifacts in the terminal.
