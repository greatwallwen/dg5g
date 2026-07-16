# Task 12 Post-release Quarantine Dry-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an immutable, reversible quarantine plan for proven redundant release artifacts without moving or deleting any repository content.

**Architecture:** The release-evidence index remains the sole authority for `current`, `previous`, and `final` roles. The existing runtime cleanup engine consumes an explicit allowlist, hashes every candidate into a sealed manifest, and fails closed for unknown evidence; this task stops after dry-run and never invokes apply.

**Tech Stack:** Node.js 20.20.2, pnpm 9.15.0, Node test runner, SHA-256 sealed JSON manifests.

## Global Constraints

- Do not modify `scripts/release-evidence-index.mjs` in this task.
- Do not run `--apply-manifest` and do not delete any file.
- Protect the P1 final evidence root, current P1 source release, previous S3 source release, Task 9 media evidence, all SQLite paths, and `site/public/media/`.
- Treat every unindexed or ambiguous historical artifact as `unknown` and keep it in place.

---

### Task 1: Lock evidence roles before candidate selection

**Files:**
- Read: `scripts/release-evidence-index.mjs`
- Read: `scripts/release-evidence-index.test.mjs`

**Interfaces:**
- Consumes: `loadDefaultReleaseEvidenceIndex()`.
- Produces: confirmed protection roots used by the explicit cleanup decisions.

- [x] **Step 1: Load the default evidence index and require `issues=[]`.**
- [x] **Step 2: Require current P1 and previous S3 releases to be `confirmed=true`.**
- [x] **Step 3: Require `p1-final-20260715t224419z` to be eligible final evidence.**

### Task 2: Extend the fail-closed cleanup policy narrowly

**Files:**
- Modify: `scripts/active-workspace-policy.mjs`
- Modify: `scripts/active-workspace-policy.test.mjs`
- Modify: `scripts/cleanup-runtime-artifacts.test.mjs`

**Interfaces:**
- Consumes: an exact release-history root with `evidenceRole: "superseded"`.
- Produces: `superseded-evidence:web-source-release-history` only for that exact root; children and unknown roles stay protected.

- [x] **Step 1: Add a failing policy test for one exact superseded release-history root.**
- [x] **Step 2: Add the minimal exact-root classifier.**
- [x] **Step 3: Add a cleanup-manifest test proving dry-run inventory without mutation.**
- [x] **Step 4: Run the complete workspace cleanup suite and require 34/34 passing.**

### Task 3: Seal the explicit dry-run and prove no mutation

**Files:**
- Create: `artifacts/runtime-cleanup/task12-post-release-20260715t2323z-decisions.json`
- Create: `artifacts/runtime-cleanup/task12-post-release-20260715t2323z-manifest.json`
- Create: `.superpowers/sdd/task12-post-release-quarantine-dry-run-report.md`

**Interfaces:**
- Consumes: nine explicit candidates and their replacement proof.
- Produces: immutable manifest SHA-256 `0148889d59b11588ad27b341db83354da6f2fdba078483a60a4eb3cb0b67cf5b`.

- [x] **Step 1: Inventory only the nine allowlisted candidates.**
- [x] **Step 2: Write the sealed manifest to the active repository.**
- [x] **Step 3: Verify all nine sources still exist and all nine targets are absent.**
- [x] **Step 4: Verify the external quarantine directory is empty.**
- [x] **Step 5: Stop without invoking apply.**

