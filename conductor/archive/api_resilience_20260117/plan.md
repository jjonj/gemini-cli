# Implementation Plan - Track: api_resilience_20260117

## Phase 1: High-Fidelity Logging System [checkpoint: 027e362]
- [x] Task: Create `OmniLogger` module in `packages/core`. c8cecfc
    - [x] Create `OmniLogger` class with methods for structured error logging.
    - [x] Implement log rotation/organization (e.g., append to `Omni/api_errors.log` with timestamp).
    - [x] Ensure robust file I/O (synchronous write or queue) to guarantee capture before crash.
    - [x] Test `OmniLogger` with mock data.
- [x] Task: Integrate Logging into `GeminiChat.ts` error handling. 9c9f4b5
    - [x] Locate API request execution points in `GeminiChat.ts`.
    - [x] Implement `try-catch` blocks around API calls to capture 400/500 errors.
    - [x] Extract full request context (conversation history, tool results) and raw response headers/body.
    - [x] Call `OmniLogger` within the catch block before any error propagation.
- [x] Task: Conductor - User Manual Verification 'High-Fidelity Logging System' (Protocol in workflow.md)

## Phase 2: Interactive Recovery Mechanism [checkpoint: c531fad]
- [x] Task: Implement Recovery Options Logic in `GeminiChat.ts`. 200eb64
    - [x] Define recovery strategies: `Deep Rollback` (pop last user message + response), `Clear Turn` (reset current partial turn).
    - [x] Create functions to manipulate the `history` object safely for each strategy.
- [x] Task: Implement Interactive CLI Prompt. 9f4d571
    - [x] Use `prompts` or `ink` (depending on current CLI UI stack) to display the error and options.
    - [x] Present menu: "Deep Rollback", "Clear Current Turn", "Export Diagnostic Log".
    - [x] Wire user selection to the recovery strategies.
- [x] Task: Refine Error Detection. 9f4d571
    - [x] Differentiate between transient network errors (retryable) and 400 Bad Request (requires intervention).
    - [x] Only trigger Interactive Recovery for 400s or repeated 500s. (Implemented for 400s).
    - [x] FIX: Improved 400 detection to include `error.response?.status`.
    - [x] FIX: Trigger ResilienceRecovery for mismatched function parts errors.
    - [x] IMPROVEMENT: Broadened `isMismatchedFunctionPartsError` to be case-insensitive and match partial strings.
- [x] Task: Fix Recovery Dialog Visibility & Add Extensive Logging. 2026-01-19
    - [x] Investigation: Traced silent failure to `AppContainer.tsx` where `dialogsVisible` omitted the recovery request state.
    - [x] FIX: Added `!!resilienceRecoveryRequest` to `dialogsVisible` in `AppContainer.tsx`.
    - [x] Add extensive logging to `GeminiChat.ts`, `useGeminiStream.ts`, `AppContainer.tsx`, `OmniDialogManager.tsx`, and `ResilienceRecoveryDialog.tsx`.
    - [x] Standardize `OmniLogger` to use absolute path for consistent logging.
    - [x] FIX: Use robust name-based checks for `ResilienceError` in `useGeminiStream.ts` to bypass `instanceof` limitations in bundled environments.
- [x] Task: Conductor - User Manual Verification 'Interactive Recovery Mechanism' (Protocol in workflow.md)

## Phase 3: Final Verification & Observation
- [x] Task: End-to-End Simulation. b60c2dc
    - [x] Simulate a 400 error (e.g., by artificially corrupting a request).
    - [x] Verify log file content matches expectations (JSON snapshots, headers).
    - [x] Verify Recovery Menu appears and functions correctly (Rollback works).
- [x] Task: Investigate silent failure of recovery dialog despite 400 error logging. e5b6ec4
- [~] Task: Observation Period (7 Days).
    - [ ] Confirm stability over one week of usage. (Target: 2026-01-28)
- [x] Task: Investigate and fix persistent 400 error where undo fails. (User Report: 2026-01-21) [718293a]

## Phase 4: Undo Command Implementation [checkpoint: 9debb82]
- [x] Task: Investigate and Plan Undo Command.
    - [x] Analyze command registration system.
    - [x] Analyze history management in core and UI.
    - [x] Design minimal core changes.
- [x] Task: Implement `undo` functionality in `useHistoryManager.ts`. 2232489
- [x] Task: Expose `undo` in `CommandContext`. 2232489
- [x] Task: Create and register `undoCommand` in `omni` folder. 2232489
- [x] Task: Enhance `/undo` with visual feedback (strikethrough) and targeted AI-only revert. 2649339
- [x] Task: Fix surgical undo targeting and visual feedback (2026-01-20). 2649339
    - [x] Fix: Skip `/undo` command in turn identification.
    - [x] Fix: Use `rollbackLastModelTurn` for surgical revert.
    - [x] UI: Add `[ REVERTED ]` prefix and aggressive screen clearing.
- [x] Task: Refactor undo styling to move logic to `omni` folder and minimize core changes. 2649339
- [x] Task: Verify `/undo` command in CLI. 0ca400a
- [x] Task: Conductor - User Manual Verification 'Undo Command Implementation' (Protocol in workflow.md)

## Observation Guide (2026-01-18 to 2026-01-25)

**When a 400 error occurs:**
1.  **Check the Log:** Open `Omni/api_errors.log`. Look for the "Conversation History Snapshot".
2.  **Analyze Mismatch:** Compare the history in the log with the "Response" body to see if there's a specific part type the API rejected.
3.  **Use Recovery Menu:**
    -   If the session is stuck (looping), use **Deep Rollback**.
    -   If it was a one-off bad prompt, use **Clear Current Turn**.
4.  **Report Success:** If the recovery menu allows you to resume work without a manual `/session:clear`, the implementation is working as intended.

**Success Criteria for Closing Track:**
-   At least 7 days have passed.
-   No unrecoverable "Mismatched function parts" errors required a manual `/session:clear`.
-   All captured logs were actionable.

- [x] Task: Conductor - User Manual Verification 'Final Verification & Observation' (Protocol in workflow.md)
