#!/usr/bin/env python3
"""Read-only DGBook deployment diagnostics over SSH."""

from __future__ import annotations

import os

import paramiko


REMOTE_SCRIPT = r"""set -u
echo NODE=$(node -v 2>&1)
echo PNPM=$(pnpm --version 2>&1)
echo SERVICE=$(systemctl is-active dgbook-web 2>&1)
echo CURRENT=$(readlink -f /var/www/dgbook-web/current 2>&1)
echo FILESYSTEMS_BEGIN
df -h /var/www/dgbook-web /tmp
df -i /var/www/dgbook-web /tmp
echo FILESYSTEMS_END
latest=$(ls -1dt /var/www/dgbook-web/releases/* 2>/dev/null | head -n 1)
echo LATEST=$latest
if [ -n "$latest" ]; then
  echo RELEASE_STAT_PRE
  stat "$latest"
  echo DEPLOY_FILES
  find "$latest/.deploy" -maxdepth 1 -type f -printf "%f %s bytes\n" 2>/dev/null | sort
  if [ -f "$latest/.deploy/archive-entries.log" ]; then
    echo ARCHIVE_ENTRY_MATCHES_BEGIN
    grep -nE '(^/|(^|/)\.\.(/|$))' "$latest/.deploy/archive-entries.log" | head -n 30 || true
    echo ARCHIVE_ENTRY_MATCHES_END
    echo ARCHIVE_ENTRIES_HEAD
    head -n 5 "$latest/.deploy/archive-entries.log"
    echo ARCHIVE_ENTRIES_TAIL
    tail -n 5 "$latest/.deploy/archive-entries.log"
  fi
  release_id=$(basename "$latest")
  remote_archive="/var/www/dgbook-web/.drop/$release_id/dgbook-web-source.tar.gz"
  remote_manifest="/var/www/dgbook-web/.drop/$release_id/dgbook-web-source.upload-manifest.json"
  if [ -f "$remote_archive" ]; then
    echo ARCHIVE_SPECIAL_TYPES_BEGIN
    tar -tvzf "$remote_archive" | awk '$1 !~ /^[-d]/ { print }' | head -n 30 || true
    echo ARCHIVE_SPECIAL_TYPES_END
    archive_read_error=$(tar -xOzf "$remote_archive" --strip-components=1 >/dev/null 2>&1) || archive_read_code=$?
    echo ARCHIVE_READ_EXIT=${archive_read_code:-0}
    if [ -n "$archive_read_error" ]; then echo "$archive_read_error"; fi
    probe_dir=$(mktemp -d /tmp/dgbook-preflight.XXXXXX)
    case "$probe_dir" in /tmp/dgbook-preflight.*) ;; *) exit 99 ;; esac
    probe_output=$(tar -xzf "$remote_archive" -C "$probe_dir" --strip-components=1 2>&1)
    probe_code=$?
    echo ARCHIVE_PROBE_EXIT=$probe_code
    if [ -n "$probe_output" ]; then echo "$probe_output"; fi
    echo ARCHIVE_PROBE_FILE_COUNT=$(find "$probe_dir" -type f | wc -l)
    rm -rf -- "$probe_dir"
  fi
  echo RELEASE_CONTENT_COUNTS
  find "$latest" -mindepth 1 -maxdepth 4 -printf '%y %p\n' 2>/dev/null | awk '{ counts[$1]++ } END { for (kind in counts) print kind, counts[kind] }'
  echo RELEASE_CONTENT_SAMPLE
  find "$latest" -mindepth 1 -maxdepth 3 -printf '%y %p\n' 2>/dev/null | head -n 30
  if [ -f "$remote_manifest" ]; then
    echo LOG_BEGIN=remote-upload-manifest.json
    cat "$remote_manifest"
    echo LOG_END=remote-upload-manifest.json
  fi
  if [ -f "$latest/.deploy/source-manifest.json" ]; then
    echo LOG_BEGIN=source-manifest.json
    cat "$latest/.deploy/source-manifest.json"
    echo LOG_END=source-manifest.json
  fi
  for f in install.log build.log sqlite-online-backup.log db-migrate.log db-seed-base.log db-seed-demo.log db-verify.log rollback.log external-rollback.log build-info.json; do
    if [ -f "$latest/.deploy/$f" ]; then
      echo LOG_BEGIN=$f
      tail -n 100 "$latest/.deploy/$f"
      echo LOG_END=$f
    fi
  done
fi
"""


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=os.environ["DGBOOK_WEB_DEPLOY_HOST"],
        username=os.environ.get("DGBOOK_WEB_DEPLOY_USER", "root"),
        password=os.environ["DGBOOK_WEB_DEPLOY_PASSWORD"],
        timeout=30,
        banner_timeout=30,
        auth_timeout=30,
    )
    try:
        stdin, stdout, stderr = client.exec_command("bash -s", timeout=120)
        stdin.write(REMOTE_SCRIPT)
        stdin.channel.shutdown_write()
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        client.close()
    print(output, end="")
    print(error, end="")
    print(f"REMOTE_EXIT={code}")


if __name__ == "__main__":
    main()
