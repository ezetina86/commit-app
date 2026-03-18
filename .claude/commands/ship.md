---
description: Create a branch, commit with conventional commits, push, and open a PR to dev
argument-hint: <branch-name>
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(gh pr create:*), Bash(gh pr view:*), Bash(git log:*)
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Staged + unstaged diff: !`git diff HEAD`
- Recent commits (for style reference): !`git log --oneline -5`

## Your task

You are the `/ship` command. Your job is to take all current changes, put them on a feature branch, commit them using Conventional Commits, push, and open a PR targeting `dev`.

**Branch name argument:** $ARGUMENTS

### Step 1 — Determine the branch

- If `$ARGUMENTS` is provided, the target branch name is `feature/$ARGUMENTS`.
- If `$ARGUMENTS` is empty, derive a short kebab-case name from the diff summary and use `feature/<derived-name>`.
- If the current branch already starts with `feature/`, skip branch creation and stay on it.
- Otherwise: `git checkout -b feature/<name>`

### Step 2 — Stage all changes

Run `git add -A` to stage everything (the user has already reviewed what needs shipping).

### Step 3 — Write a Conventional Commit message

Analyze the full diff and write a commit message following this project's convention:
- Format: `type: short imperative description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`
- No emoji, no scope parentheses (match the project style: `feat: add dark mode` not `feat(ui): add dark mode`)
- If the diff spans multiple concerns, write a multi-line message with a blank line after the subject and bullet points for each change.
- Keep the subject line under 72 characters.

Run: `git commit -m "<message>"`

### Step 4 — Push

Run: `git push -u origin <branch-name>`

### Step 5 — Open PR to `dev`

Run `gh pr create` with:
- `--base dev`
- `--title` matching the commit subject line
- `--body` with a short markdown summary:
  - ## Summary (2-3 bullet points of what changed)
  - ## Test plan (what to verify)
  - Footer: `🤖 Generated with [Claude Code](https://claude.ai/code)`

After creating the PR, print the PR URL so the user can open it.
