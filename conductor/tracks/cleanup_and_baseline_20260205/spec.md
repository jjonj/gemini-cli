# Track Specification: Local Cleanup & Test Baseline

## Overview
The goal of this track is to reset the repository to a clean state by reverting pending source code changes while preserving specific configurations and ensuring a passing test baseline. This involves selective reversion of local changes, preservation of `Omni/` directory contents and non-code files, and a rigorous "run-and-delete" strategy for failing tests.

## Functional Requirements
1.  **Scope Identification:**
    -   Identify all files with local, unstaged modifications in the current working directory.
    -   Do NOT perform deep diffs against history; focus only on current local state.

2.  **Selective Reversion:**
    -   **Revert:** Actual source code modifications (e.g., `*.ts`, `*.tsx`, `*.js` logic files).
    -   **Preserve (Do not revert):**
        -   Any file within the `Omni/` directory.
        -   Test files (`*.test.ts`, `*.spec.ts`) that have been modified to disable or delete tests.
        -   Non-code files (e.g., `GEMINI.md`, `build.py`, documentation, configuration files unless they are build artifacts).

3.  **Test Baseline Establishment:**
    -   After the revert process, execute the project's test suite.
    -   Identify any tests that fail.
    -   **Action on Failure:** Immediately delete the failing test cases or files to establish a "Green" baseline where all remaining tests pass.

## Non-Functional Requirements
-   **Safety:** Ensure `Omni/` customizations are strictly protected from reversion.
-   **Efficiency:** The process should be automated as much as possible to avoid manual file-by-file review.

## Acceptance Criteria
-   [ ] `git status` shows no modified source code files (except those intended to be preserved).
-   [ ] The `Omni/` directory remains untouched.
-   [ ] Non-code files like `GEMINI.md` and `build.py` retain their local changes.
-   [ ] The test suite runs and exits with a success code (0 failures).
-   [ ] Any test that failed during the verification step has been removed or disabled.

## Out of Scope
-   Fixing bugs in the source code (other than reverting to the clean state).
-   Fixing failing tests (they are to be deleted, not fixed).
