# Rebase Upstream Guide

This guide documents the safer workflow for rebasing Omni commits on top of upstream with minimal churn.

## Goals

- Keep Omni functionality intact.
- Keep commit history readable (amend/cherry-pick style rewrite, no random fixup commits).
- Keep build validation deterministic (`build.py`).
- Avoid getting blocked by local hooks/tooling drift.

## Ground Rules

- Always create a backup tag before history rewrites.
- Work one Omni commit at a time.
- **CRITICAL: Build after each applied commit with `build.py`.**
- If a commit does not build, fix it immediately and amend that same commit.
- Do not continue to the next commit until current one is green.

## Critical Note For Next Rebase

In the **first Omni commit** of the next rebase:

Delete and add to gitignore REBASE_PLAN.md. It should not be in history ever.



This should be handled early so the entire rebase is not repeatedly interrupted.

Also take the current most recent build.py and rebase guide from the main workspace and use them instead of the outdated versions in the first commit (after applying it).

## Recommended Workflow

0. Establish, Clarify and plan
- Write a temporary untracked plan md file that contains all the commits (hash and short description) we want to rebase and detail how the user wanted to rewrite history. 
- Ask user if there are any commits they want to merge or other ways they want to rewrite history as we cherry pick

1. Sync and reset base
- Reset `main` to the target upstream commit.
- Confirm clean state by building

2. Create backups
- Tag current `main` before rewriting history.
- Keep one additional safety tag before risky amendments.

3. Apply Omni commits in order
- Cherry-pick commit N.
- Resolve conflicts with intent preservation.
- **After applying the FIRST Omni commit, take the rebase guide and build.py from the main workspace, copy them to your new worktree and replace the outdated versions.**
- **Build with `py build.py`.**
- If needed, amend commit N.
- Repeat for N+1.
- The first commit omni baseline should be updated with the guide and and build.py scripts that were duplicated, then delete the duplicates.
- For every commit starting from the IPC commit, run the roundtrip py test in D:/SSDProjects/Omni between each commit to verify things are working. 


4. Conflict strategy
- Prefer surgical merges over broad “take ours/theirs” on large files.
- **`package-lock.json` should always use the origin (upstream) version, never the Omni version.** Use `git checkout --ours package-lock.json`.
- If conflict markers remain in file content, clean them immediately.
- Re-run marker scan before build.

5. Build and bundle validation
- Use `build.py` as the canonical validation step.
- Ensure bundle output is updated:
  - `bundle/gemini.js`
- This matters because launcher wrappers (like `gmi.exe`) call the bundle.

6. Final checks
- `git status --short` should be empty.
- `git log --oneline -n <k>` should show expected rewritten sequence.
- Smoke test CLI flags used by wrappers (e.g. `--workspace`).

## Known Pitfalls From This Rebase

- `build.py` previously ran `npm install` and could fail due workspace lifecycle scripts.
- Hook failures during cherry-pick/continue created avoidable noise.
- Bundle and source can drift; launcher may run stale bundle if not rebuilt.
- Stale git lock files can appear mid-operation; verify repo state before continuing.

## Practical Commands (Reference)

```powershell
git status --short
git log --oneline -n 5
git cherry-pick <sha>
git cherry-pick --continue
git commit --amend --no-edit
py .\build.py
```

## Definition of Done Per Commit

- Cherry-pick applied.
- No conflict markers in repo files.
- **`build.py` succeeds.**
- Commit amended if fixes were required.
- Worktree clean before moving to next commit.
