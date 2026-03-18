---
description: Branch from dev, commit with conventional commits, push, and open a PR to dev
argument-hint: [<prefix/branch-name>]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git checkout:*), Bash(git fetch:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(gh pr create:*), Bash(gh pr view:*), Bash(git log:*)
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Staged + unstaged diff: !`git diff HEAD`
- Recent commits (for style reference): !`git log --oneline -5`

## Your task

You are the `/ship` command. Your job is to take all current changes, create a new branch off `dev`, commit them using Conventional Commits, push, and open a PR targeting `dev`.

**Branch name argument:** $ARGUMENTS

### Step 1 — Determine the branch name

Analyze the diff to determine the right branch prefix and name:

- **Prefix rules** (based on primary change type in the diff):
  - `feature/` — new functionality
  - `fix/` — bug fixes
  - `hotfix/` — urgent production fixes
  - `chore/` — tooling, deps, config
  - `docs/` — documentation only

- **If `$ARGUMENTS` is provided:**
  - If it already contains a `/` (e.g. `fix/login-bug`), use it as-is
  - Otherwise, determine the right prefix from the diff and use `<prefix>/$ARGUMENTS`

- **If `$ARGUMENTS` is empty:**
  - Derive a short kebab-case slug from the diff summary (max 4 words)
  - Combine with the correct prefix: e.g. `fix/local-timezone-dates`

### Step 2 — Create branch from dev

Always create a fresh branch from `dev`, regardless of the current branch:

```
git fetch origin dev
git checkout -b <branch-name> origin/dev
```

Then cherry-pick or re-apply the staged/unstaged changes from the working tree onto this new branch. Since the files are already modified in the working tree, just stage them:

```
git add -A
```

### Step 3 — Write a Conventional Commit message

Analyze the full diff and write a commit message following this project's convention:
- Format: `type: short imperative description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`
- No emoji, no scope parentheses (e.g. `fix: correct timezone for check-ins` not `fix(ui): correct timezone`)
- If the diff spans multiple concerns, use a multi-line message: subject, blank line, then bullet points
- Keep the subject line under 72 characters

Run: `git commit -m "<message>"`

### Step 4 — Push

```
git push -u origin <branch-name>
```

### Step 5 — Open PR to `dev`

Run `gh pr create` with:
- `--base dev`
- `--title` matching the commit subject line
- `--body` with a short markdown summary:
  - ## Summary (2-3 bullet points of what changed)
  - ## Test plan (what to verify)
  - Footer: `🤖 Generated with [Claude Code](https://claude.ai/code)`

After creating the PR, print the PR URL so the user can open it.
