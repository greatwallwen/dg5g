# 5G Cloud Sample Deployment

This note defines the minimal cloud sample package for 5G textbook preview.

For automated deployment, see
[`ci-cd-cloud-sample.md`](./ci-cd-cloud-sample.md).

## Scope

- Homepage
- Chapter 1 index
- `P01`
- `P02`
- `P03`
- Required Astro chunks, avatars, Manim media, 5G images, and cached Qwen audio

The package is only a deployment sample. It is not the full textbook release.
Links to routes outside the homepage, chapter 1 index, and `P01`-`P03` are
disabled during packaging, so the uploaded preview does not expose broken
navigation.
Links to included project routes are normalized as directory URLs such as
`/projects/P01/`, reducing reliance on cloud-host redirects.
The sample root includes `deploy-manifest.json`; browser smoke tests read this
manifest to confirm the uploaded directory is the intended chapter 1 / P01-P03
package and comes from a clean source commit.

## Build

```powershell
pnpm --filter @dgbook/site build
pnpm deploy:sample:5g
pnpm deploy:sample:5g:verify
pnpm deploy:sample:5g:portability
pnpm deploy:sample:5g:smoke
pnpm deploy:sample:5g:archive
pnpm deploy:sample:5g:verify:archive
pnpm deploy:sample:5g:smoke:archive
pnpm deploy:sample:5g:preflight
```

After `site/dist` is built, the sample release flow can be run with:

```powershell
pnpm deploy:sample:5g:ready
```

`deploy:sample:5g:ready` runs the full sequence above, including the final
preflight check.

To rebuild the site from source and then run the same ready flow, use:

```powershell
pnpm deploy:sample:5g:build-ready
```

The output directory is:

```text
artifacts/cloud-samples/5g-p01-p03
```

The optional upload archive is:

```text
artifacts/cloud-samples/5g-p01-p03.zip
```

The archive command also writes:

```text
artifacts/cloud-samples/5g-p01-p03.zip.sha256
artifacts/cloud-samples/5g-p01-p03.release-note.md
artifacts/cloud-samples/5g-p01-p03.deployment-ticket.md
artifacts/cloud-samples/5g-p01-p03.upload-manifest.json
```

## Cloud Host Requirements

- Static file hosting
- Direct route folders, such as `/projects/P01/`
- Default entry file `index.html`
- Upload the sample directory as the static site root. Root asset paths such as
  `/_astro`, `/media`, and `/avatars` must resolve inside the uploaded sample.
- No runtime TTS service required
- No Python, Manim, or build-time tooling required on the host
- No `localhost`, loopback, `file://`, plugin URL, or Windows absolute path in
  the deployable sample shell files
- `deploy-manifest.json`, the release note, and the deployment ticket include a
  static asset summary. The host must serve the listed extensions, especially
  `.wav` cached narration audio and `.webm` animation media.
- Remote smoke also requests one sampled file for each required extension from
  the manifest, so path or static-file serving mistakes fail before review.

## Upload Checklist

- Upload `5g-p01-p03.zip` or the unpacked `5g-p01-p03` directory.
- Keep `5g-p01-p03.release-note.md` and
  `5g-p01-p03.upload-manifest.json` with the deployment ticket.
- Use `5g-p01-p03.deployment-ticket.md` as the cloud deployer checklist.
- Keep the `deployNotes` field from the upload manifest visible to the cloud
  deployer; it lists the hosting constraints that must be satisfied.
- Copy `remoteSmokeCommand` from the upload manifest after replacing the example
  base URL with the real cloud sample URL.
- Compare the uploaded archive SHA256 with `5g-p01-p03.zip.sha256`.
- Check `sourceGit.commit` in the upload manifest; it records the exact commit
  used to create the sample. `sourceGit.sourceDirty` must be `false`.
- Run `pnpm deploy:sample:5g:verify:archive` after creating the archive; it
  checks the zip checksum, the `.sha256` file, upload manifest consistency,
  release note consistency, source Git metadata, then extracts the package and
  verifies extracted routes.
- Run `pnpm deploy:sample:5g:portability` to check deployable shell files for
  local-only URLs or absolute filesystem paths before upload.
- Run `pnpm deploy:sample:5g:smoke:archive` to unzip the archive and browser-test
  the extracted static site. This catches problems that only appear after zip
  packaging.
- Run `pnpm deploy:sample:5g:preflight` as the final upload check. It prints
  the exact files to upload, SHA256, source commit, included routes, source
  deploy manifest consistency, current HEAD freshness, and the remote smoke-test
  command.

## Smoke Checks

After upload, verify these routes:

```text
/
/chapters/ch1/
/projects/P01/
/projects/P02/
/projects/P03/
```

Expected behavior:

- Homepage loads the capability map entry.
- The chapter 1 course index is clickable and opens.
- P01-P03 pages load without missing media.
- Links to pages outside this sample are visibly inert instead of navigating to
  missing cloud routes.
- Included project links use trailing slashes, such as `/projects/P01/`.
- Narration audio uses cached `/media/tts/...` files.
- Animation playback dock, avatar, captions, and focus effects are visible.

Local browser smoke output is written to:

```text
output/playwright/cloud-sample/cloud-sample-runtime-report.json
output/playwright/cloud-sample-archive/cloud-sample-runtime-report.json
```

After the archive is uploaded, run the same browser smoke against the cloud URL:

```powershell
pnpm deploy:sample:5g:smoke:remote -- --base-url https://your-cloud-host.example/ --manifest artifacts/cloud-samples/5g-p01-p03.upload-manifest.json --out output/playwright/cloud-sample-remote
```

Use the public root URL that serves the uploaded sample directory. The command
requires `--base-url`; without it, the command fails instead of falling back to
a local static server. It checks the homepage, chapter 1 index, `P01`-`P03`, cached media,
disabled sample-out links, the deployment manifest identity and source commit,
the animation dock, and the interactive game container. By default it compares
the remote `deploy-manifest.json` source commit with the local upload manifest
commit, so an older valid sample package cannot pass as the current upload.
The command writes screenshots and `cloud-sample-runtime-report.json` to
`output/playwright/cloud-sample-remote` unless another `--out` path is passed.
If the cloud host serves the sample below a nested URL path, pass that exact
URL to `--base-url`; the smoke test will fail if root asset paths are not mapped
back to the sample package.

## Rollback

If the cloud sample fails, upload the previous `5g-p01-p03.zip` archive or rerun
the build commands from the last known-good commit.
