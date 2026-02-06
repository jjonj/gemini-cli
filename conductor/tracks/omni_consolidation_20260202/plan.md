# Implementation Plan - Omni Logic Consolidation & Commit Squashing

This plan outlines the steps to consolidate Omni-specific logic into the `Omni/` directory and clean up the git history to minimize divergence from the upstream common ancestor.

## Phase 1: Analysis and Preparation
- [x] Task: Identify all changes since common ancestor `b9762a3ee1b348c23ba052c420626175afef3b0e` (0ca400a)
    - [ ] Run `git diff b9762a3ee1b348c23ba052c420626175afef3b0e HEAD` and document impacted files outside of `Omni/`
- [x] Task: Audit `OmniCustomChanges.md` to ensure it aligns with the identified changes (0ca400a)
- [x] Task: Create a backup branch of the current state (`git branch backup/omni-pre-consolidation`) (0ca400a)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Analysis and Preparation' (Protocol in workflow.md)

## Phase 2: Logic Migration
- [x] Task: Migrate Omni-specific logic from `packages/core` to `Omni/` (49a43f8)
    - [x] Create corresponding structures within `Omni/` (49a43f8)
    - [x] Replace original logic with minimal bridge calls (49a43f8)
- [~] Task: Migrate Omni-specific logic from `packages/cli` to `Omni/`
    - [ ] Move UI components or IPC handlers
    - [ ] Update imports and entry points

## Phase 2.5: Surgical Re-implementation
- [x] Task: Re-implement Omni Logger (Passive API logging)
- [x] Task: Re-implement Safety Overrides (Always Trust Folders)
- [x] Task: Re-implement Force End Turn ([FORCE-END-TURN] support)
- [x] Task: Verify functionality and squash into a single commit

## Phase 3: Git History Consolidation
- [ ] Task: Perform an interactive rebase from the common ancestor
    - [ ] `git rebase -i b9762a3ee1b348c23ba052c420626175afef3b0e`
    - [ ] Squash commits into logical units (e.g., "omni: consolidate ipc logic", "omni: migrate core hooks")
- [ ] Task: Verify that the final diff against the common ancestor is minimized outside of `Omni/`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Git History Consolidation' (Protocol in workflow.md)

## Phase 4: Finalization
- [ ] Task: Update `OmniCustomChanges.md` with the new architecture and file locations
- [ ] Task: Run full suite of tests and build commands to ensure stability
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Finalization' (Protocol in workflow.md)