# Agent workflow

## Parallel work

- When another session may be editing the same repository, create a git worktree for the task and move the session there. Never edit the main checkout concurrently.
- Keep the worktree branch focused on one task. Commit there with a descriptive message.

## Finishing work

- When the task is complete and verified, merge the worktree branch into `master` automatically. Resolve conflicts in the main checkout, then re-run the relevant verification.
- Do not leave completed work stranded on an unmerged branch.
- After a successful merge, move the session back to the main checkout and remove the temporary worktree. Delete the merged branch if it is no longer needed.
- Merge only after verification passes. At minimum run `npm run check` and `npm run smoke`; run `npm run e2e` and `npm run simulate:campaign` when the change touches the UI, socket layer, campaign flow, or rules engine.
- If the main checkout has uncommitted changes from another session, do not discard them. Merge around them or wait for them to be committed.

## Windows line endings

- This repository is stored with LF. A worktree created with `core.autocrlf=true` may check files out as CRLF, causing a noisy repo-wide Prettier failure.
- Normalize only the files you changed with Prettier before running `npm run format:check`; do not rewrite the whole repository just to satisfy line endings.
