# Runtime cleanup guard

`cleanup-runtime-artifacts.mjs` is manifest-first and dry-run by default. It never searches the workspace for deletable files: callers provide path decisions, and the workspace policy independently permits only proven regenerable caches, superseded Playwright output, or superseded source-release history.

Protected inputs are recorded in `protectedRefusals` and remain untouched. Traversal, reparse points, protected roots, incorrect policy reasons, overlapping candidates, and unsealed manifests are rejected.

Run a dry-run first:

```powershell
node scripts/cleanup-runtime-artifacts.mjs --dry-run --decisions .\decisions.json --manifest .\cleanup-manifest.json --root .
```

The manifest's quarantine target is always the workspace-local, manifest-specific directory `.runtime-cleanup-quarantine/<manifest-id>`. Dry-run does not create it. `--apply-manifest` only consumes the sealed manifest, creates that timestamped directory, moves same-volume candidates into it, and emits a sealed receipt. There is no direct-delete mode. `--restore-manifest` uses the receipt to return quarantined payloads without overwriting an existing source.
