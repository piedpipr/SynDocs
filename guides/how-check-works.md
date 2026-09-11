# How `syndocs check` works

This guide explains the full drift-detection loop — from running the command
to seeing a diff appear in your mirror doc.

## The three pieces that have to agree

Check compares three things for each documented file:

1. **The live source file** — whatever is on disk right now
2. **The stored hash** — the `<!-- syndocs-hash: abc123 -->` stamp in the mirror doc
3. **The stored code copy** — the fenced code block inside the mirror doc

The hash is the *comparison target*. The code copy is *for reading*. They are
updated together by `syndocs update`, and they are never compared to each other.

## Step 1 — Hash the live file

@syndocs-embed: packages/core/src/hash.ts#compute-hash <!-- syndocs-synced: 499c9e05f803 -->

Normalisation happens first (CRLF → LF, trailing whitespace stripped per line,
one trailing newline guaranteed), then SHA-256 is computed and truncated to 12
hex characters. The 12-char length is deliberate — long enough to make collisions
astronomically unlikely, short enough to be readable in a diff.

## Step 2 — Parse anchors to confirm the file is documented

@syndocs-embed: packages/core/src/anchor-parser.ts#parse-anchors <!-- syndocs-synced: 3e7e605073a0 -->

A file with no `@syndocs` marker is silently skipped. `check` only ever looks at
files that opted in.

## Step 3 — Compare hashes and produce the diff

If the hashes differ, `computeDiff` is called with the stored code copy as "old"
and the live file as "new". The diff uses LCS (Longest Common Subsequence) to
find the minimal edit, then renders it with three lines of context around each
changed region.

@syndocs-embed: packages/core/src/differ.ts#compute-diff <!-- syndocs-synced: 0c0f0d9a7306 -->

## Step 4 — Write the pending-diff block

The diff is inserted into the mirror doc between `<!-- syndocs-pending-start -->`
and `<!-- syndocs-pending-end -->` markers. `syndocs update` knows to remove
exactly that block when the doc is resolved.

## What happens in CI

Pass `--no-annotate` to keep `check` read-only (no writes to the mirror docs),
and `--fail` to exit with code 1 when anything is stale. The build fails visibly;
the reviewer knows exactly which file needs a doc update before the PR merges.
