# Specification - Omni Logic Consolidation & Commit Squashing

## Overview
This track aims to minimize the divergence of the "Omni" fork from its upstream core. We will identify all logic added after the common ancestor `b9762a3ee1b348c23ba052c420626175afef3b0e`, squash these changes into a cleaner commit history, and migrate the majority of the custom logic into the `Omni/` directory.

## Functional Requirements
- Identify all changes introduced since commit `b9762a3ee1b348c23ba052c420626175afef3b0e`.
- Consolidate disparate commits into a structured, logical set of squashed commits.
- Move all Omni-specific logic, types, and scripts from core packages (e.g., `packages/cli`, `packages/core`) into the `Omni/` folder.
- Implement minimal "bridge" code or entry points in the core codebase to maintain functionality while minimizing the line-count of changes.

## Non-Functional Requirements
- **Diff Minimization:** The primary success metric is the reduction of total lines changed in directories outside of `Omni/` when compared to the common ancestor.
- **Maintainability:** The consolidation must not break existing features, especially remote control and IPC functionality.
- **Upstream Compatibility:** The structure should make future rebases or merges from the upstream repository easier.

## Acceptance Criteria
- [ ] A clean git history since the shared ancestor is established.
- [ ] Core packages contain minimal modifications (ideally just imports/calls to `Omni/`).
- [ ] All Omni-specific features (IPC, remote UI events, etc.) remain fully functional.
- [ ] The `OmniCustomChanges.md` documentation is updated to reflect the new structure.

## Out of Scope
- Adding new features or fixing unrelated bugs during the refactor.
- Modifying upstream code that hasn't been touched by the Omni fork.