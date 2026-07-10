---
name: spectra-sync-specs
description: "Apply a Spectra change's delta specs into the main openspec/specs/ directory. Use whenever /spectra-archive's delta-sync step needs to run, or when a user directly asks to sync/merge/apply a change's spec deltas into the canonical specs (e.g. 'sync the specs for add-auth', 'merge this change's delta spec into the main spec')."
license: MIT
compatibility: Requires the spectra CLI, and read/write access to openspec/changes/ and openspec/specs/.
---

Apply one Spectra change's delta specs onto the project's main specs.

**Input**: A change name (e.g. `add-auth`). If omitted, infer from conversation context; if ambiguous, run `spectra list --json` and ask the user to pick.

**Why this exists**: `openspec/changes/<name>/specs/` holds *delta* specs — `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` sections describing what a change adds, changes, or removes. `openspec/specs/<capability>/spec.md` holds the *canonical* merged spec that the rest of the team reads. This skill is the thing that actually performs that merge — it's invoked by `/spectra-archive` (its step 4) whenever a change has delta specs, but it's equally useful standalone if you want to sync specs before archiving, or re-sync after fixing a delta by hand.

**Prerequisites**: Requires the `spectra` CLI. If any `spectra` command fails with "command not found", report the error and STOP.

---

## Steps

### 1. Locate the delta specs

```bash
spectra show <name> --item-type change --deltas-only --json
```

If this returns no delta specs, tell the user there's nothing to sync and stop — not every change touches specs (e.g. tooling/doc-only changes), and that's fine.

Otherwise, for each capability found, read its delta file directly at `openspec/changes/<name>/specs/<capability>/spec.md`.

### 2. Read the source-file tracking data (for `@trace`)

Check `.spectra/touched/<name>.json`. If present, flatten the `files` arrays across all tasks into one deduplicated list, then split it into `code` and `tests` by path shape — anything under a `__tests__/` directory, or matching `.test.` / `.spec.` in the filename, is a test file; everything else is code.

If the tracking file doesn't exist (it's deleted once a change is archived, and may never have existed for changes implemented outside `/spectra-apply`), that's fine — omit `code:`/`tests:` from the trace block rather than guessing. A trace block with just `source` and `updated` is still meaningful; a trace block with fabricated file paths is actively misleading.

### 3. For each capability, decide: new or existing

```bash
test -f openspec/specs/<capability>/spec.md
```

**If the main spec doesn't exist yet** (new capability): every requirement in the delta *must* be `## ADDED Requirements` — there's nothing to modify or remove yet. Create the main spec:

```markdown
# <capability> Specification

## Purpose

TBD - created by archiving change '<name>'. Update Purpose after archive.

## Requirements

<each requirement, in delta order, with its ADDED wrapper stripped — just a plain "### Requirement:" block, followed by its trace block>
```

**If the main spec already exists**, read it in full and apply the delta requirement-by-requirement:

- **ADDED**: append the requirement (with a fresh trace block) at the end of `## Requirements`, before the final trace block's closing if you're inserting mid-file — matching the surrounding `---` separator convention (see step 4).
- **MODIFIED**: find the existing `### Requirement: <exact name>` block. Replace everything from that header up to (but not including) the next `---`/`### Requirement:`/end-of-file with the delta's new body, then regenerate its trace block. The requirement's *position* in the file doesn't change.
- **REMOVED**: delete the matching `### Requirement:` block, its trace block, and one adjacent `---` separator (so you don't end up with two in a row or a dangling one at a section boundary).
- **RENAMED**: delta specs don't have one fixed syntax for this across every project — read the actual delta content to see how the rename is expressed (e.g. an old-name/new-name pair, or a "renamed from X" note), and update just the `### Requirement:` header text, keeping the body, scenarios, and trace intact. If the delta's intent is genuinely ambiguous, stop and ask the user rather than guessing which requirement it maps to.

If a MODIFIED or REMOVED entry has no matching requirement in the main spec, don't silently invent one — stop and flag it. That mismatch usually means the main spec drifted from what the change author expected, and papering over it hides a real inconsistency.

### 4. Formatting: match the existing convention exactly

Every requirement in a main spec is followed by an HTML-comment trace block, then a `---` separator before the next requirement (no `---` after the very last one — the trace block just ends the file). Read `openspec/specs/line-push-notifications/spec.md` once if you want a concrete reference — it has several requirements each followed by this exact shape:

```
<!-- @trace
source: <name>
updated: <YYYY-MM-DD, today's date>
code:
  - <path>
  - ...
tests:
  - <path>
  - ...
-->
```

Requirements untouched by this change keep their existing trace block as-is — don't rewrite `source`/`updated` on requirements this change didn't touch, since that would misattribute who last changed them.

### 5. Validate

```bash
spectra validate --specs
```

Report whether it passed. If it didn't, show the errors — don't archive on top of a spec that fails validation.

### 6. Tell the caller what to do next

This is the part that's easy to get wrong: **once this skill has applied the sync, `spectra archive <name>` must be run with `--skip-specs`.** The archive command's own default pipeline re-applies delta specs and re-injects trace blocks — running it without `--skip-specs` after this skill already did that work will re-apply the same delta on top of itself (duplicate requirements, or a validation error, depending on how the CLI's own merge handles an already-synced target). Say this explicitly in your final summary, not just in passing.

---

## Output

```
## Specs Synced: <change-name>

**Capabilities touched:**
- <capability> (new — created) | (existing — N requirements added, M modified, K removed)

**Validation:** ✓ passed | ✗ failed (see errors above)

Next: run `spectra archive <name> --skip-specs` — the sync above already applied the delta, so the archive step must NOT re-apply it.
```

## Guardrails

- Don't guess file paths for `code:`/`tests:` in the trace block when `.spectra/touched/<name>.json` is missing — omit those keys instead of fabricating them.
- Don't touch the trace block of a requirement this change didn't add/modify.
- Don't invent a match for a MODIFIED/REMOVED requirement that doesn't exist in the main spec — stop and ask.
- Don't skip `spectra validate --specs` at the end — a merge that "looks right" can still produce a structurally broken file.
- Always end by telling the caller to use `--skip-specs` on the subsequent `spectra archive` call.
