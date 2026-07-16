#!/usr/bin/env python3
"""Deploy the shared DGBook source-release plan with Paramiko.

This transport intentionally delegates release IDs, paths, shell phases, systemd,
SQLite migration order, rollback, and pruning to web-source-deploy-plan.mjs.
"""

from __future__ import annotations

import hashlib
import http.cookiejar
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path.cwd()
DEFAULT_BASE_DIR = "/var/www/dgbook-web"
DEFAULT_DROP_DIR = "/var/www/dgbook-web/.drop"
REMOTE_STDERR_TAIL_LINES = 8
REMOTE_STDERR_TAIL_CHARS = 1200
# Shared transport phases: prepare, pre-switch, switch-and-health, rollback, prune.


class RemotePhaseError(RuntimeError):
    """A remote phase failure whose message is safe for deployment diagnostics."""


class DeploymentRollbackError(RuntimeError):
    """Activation failed and the compensating rollback also failed."""

    def __init__(self, activation_error: Exception, rollback_error: Exception) -> None:
        super().__init__("activation failed and rollback also failed; inspect retained release diagnostics")
        self.activation_error = activation_error
        self.rollback_error = rollback_error


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep role-home redirects observable so only a direct 2xx is healthy."""

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        del request, file_pointer, code, message, headers, new_url
        return None


def read_arg(name: str, fallback: str = "") -> str:
    if name in sys.argv:
        index = sys.argv.index(name)
        if index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    prefix = f"{name}="
    for item in sys.argv:
        if item.startswith(prefix):
            return item[len(prefix) :]
    return fallback


def first_env(names: list[str], fallback: str = "") -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return fallback


def required(names: list[str]) -> str:
    value = first_env(names)
    if not value:
        raise ValueError(f"missing required configuration: {' or '.join(names)}")
    return value


def bounded_integer(names: list[str], fallback: int, minimum: int, maximum: int) -> int:
    try:
        value = int(first_env(names, str(fallback)))
    except ValueError as exc:
        raise ValueError("numeric deployment configuration is invalid") from exc
    if value < minimum or value > maximum:
        raise ValueError("numeric deployment configuration is invalid")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_shared_plan(
    *,
    cli_release_id: str,
    env_release_id: str,
    git_commit: str,
    archive_sha256: str,
    service: str,
    public_host: str,
    hostname: str,
    app_port: str,
    helper_token: str,
    keep_releases: int,
    nginx: bool,
) -> dict[str, Any]:
    payload = {
        "release": {
            "cliReleaseId": cli_release_id,
            "envReleaseId": env_release_id,
            "gitCommit": git_commit,
            "archiveSha256": archive_sha256,
        },
        "plan": {
            "archiveSha256": archive_sha256,
            "service": service,
            "publicHost": public_host,
            "hostname": hostname,
            "appPort": app_port,
            "helperToken": helper_token,
            "keepReleases": keep_releases,
            "nginx": nginx,
        },
    }
    result = subprocess.run(
        ["node", "scripts/web-source-deploy-plan.mjs", "--json"],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("shared deployment plan validation failed")
    return json.loads(result.stdout)


def service_unit(
    current_link: str,
    app_port: str,
    hostname: str,
    release_id: str,
    archive_sha256: str,
    helper_token: str,
) -> str:
    """Return the service unit from the shared planner; do not duplicate its template."""
    del current_link  # The shared planner owns the managed current-link invariant.
    plan = build_shared_plan(
        cli_release_id=release_id,
        env_release_id="",
        git_commit="",
        archive_sha256=archive_sha256,
        service="dgbook-web",
        public_host="127.0.0.1",
        hostname=hostname,
        app_port=app_port,
        helper_token=helper_token,
        keep_releases=3,
        nginx=False,
    )
    return str(plan["serviceUnit"])


def run_remote(ssh: Any, phase: str, script: str, timeout: int = 2400) -> str:
    stdin, stdout, stderr = ssh.exec_command("bash -s", timeout=timeout)
    stdin.write(script)
    stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", "replace")
    error_output = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        detail = safe_stderr_tail(error_output)
        suffix = f"; remote stderr tail:\n{detail}" if detail else ""
        raise RemotePhaseError(f"{phase} failed with exit code {code}{suffix}")
    return output


def safe_stderr_tail(value: str) -> str:
    lines = [line.strip() for line in value.splitlines() if line.strip()][-REMOTE_STDERR_TAIL_LINES:]
    safe_lines: list[str] = []
    for line in lines:
        if re.search(r"\bDGBOOK_HELPER_TOKEN\b", line, re.IGNORECASE):
            safe_lines.append("[REDACTED] helper token diagnostic")
            continue
        if re.match(r"^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=", line):
            safe_lines.append("[redacted environment assignment]")
            continue
        if re.match(r"^(?:authorization|cookie|set-cookie)\s*:", line, re.IGNORECASE):
            safe_lines.append("[redacted sensitive diagnostic]")
            continue
        line = re.sub(
            r"(?i)\b(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+",
            r"\1=[REDACTED]",
            line,
        )
        line = re.sub(r"(://)[^\s/@:]+:[^\s/@]+@", r"\1[REDACTED]@", line)
        safe_lines.append(line[:240])
    return "\n".join(safe_lines)[-REMOTE_STDERR_TAIL_CHARS:]


def deployment_failure_message(error: Exception) -> str:
    if isinstance(error, RemotePhaseError):
        return f"DGBook web deployment failed: {error}"
    return "DGBook web deployment failed; inspect the retained release diagnostics."


def upload_files(ssh: Any, archive: Path, manifest_path: Path, plan: dict[str, Any]) -> None:
    # Upload phases are archive and manifest; neither path contains authentication material.
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(archive), plan["uploads"]["archive"])
        sftp.put(str(manifest_path), plan["uploads"]["manifest"])
    finally:
        sftp.close()


def execute_plan(ssh: Any, plan: dict[str, Any], archive: Path, manifest_path: Path, public_url: str) -> dict[str, int]:
    remote = plan["remote"]
    run_remote(ssh, "prepare", remote["prepare"])
    upload_files(ssh, archive, manifest_path, plan)
    run_remote(ssh, "pre-switch", remote["preSwitch"])
    try:
        activation = run_remote(ssh, "switch-and-health", remote["switchAndHealth"])
        verify_external_health(public_url, plan)
    except Exception as activation_error:
        try:
            run_remote(ssh, "rollback", remote["rollbackAfterExternalFailure"])
        except Exception as rollback_error:
            raise DeploymentRollbackError(activation_error, rollback_error) from activation_error
        raise
    run_remote(ssh, "prune", remote["prune"])
    return parse_activation_summary(activation)


def parse_activation_summary(output: str) -> dict[str, int]:
    lines = [line for line in output.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("deployment activation did not return a summary")
    summary = json.loads(lines[-1])
    schema_version = int(summary["schemaVersion"])
    count = int(summary["count"])
    if schema_version < 1 or count < 0:
        raise RuntimeError("deployment activation summary is incomplete")
    return {"schemaVersion": schema_version, "count": count}


def probe_authenticated_page(public_url: str, username: str, page: str) -> bool:
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar),
        NoRedirectHandler(),
    )
    login_url = urllib.parse.urljoin(public_url.rstrip("/") + "/", "api/auth/login")
    page_url = urllib.parse.urljoin(public_url.rstrip("/") + "/", page.lstrip("/"))
    logout_url = urllib.parse.urljoin(public_url.rstrip("/") + "/", "api/auth/logout")
    login_request = urllib.request.Request(
        login_url,
        data=json.dumps({"username": username, "password": "123456"}).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with opener.open(login_request, timeout=8) as login_response:
            login_status = int(login_response.status)
    except Exception:
        cookie_jar.clear()
        return False
    if not 200 <= login_status < 300:
        cookie_jar.clear()
        return False

    page_succeeded = False
    try:
        page_request = urllib.request.Request(page_url, method="GET")
        with opener.open(page_request, timeout=8) as page_response:
            page_succeeded = 200 <= int(page_response.status) < 300
    except Exception:
        page_succeeded = False
    finally:
        try:
            logout_request = urllib.request.Request(logout_url, data=b"", method="POST")
            with opener.open(logout_request, timeout=8):
                pass
        except Exception:
            pass
        cookie_jar.clear()
    return page_succeeded


def verify_external_health(public_url: str, plan: dict[str, Any]) -> None:
    parsed = urllib.parse.urlsplit(public_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("public health URL is invalid")
    build_info_url = urllib.parse.urljoin(public_url.rstrip("/") + "/", "api/build-info")
    course_url = urllib.parse.urljoin(public_url.rstrip("/") + "/", "course")
    attempts = bounded_integer(["DGBOOK_WEB_DEPLOY_EXTERNAL_HEALTH_ATTEMPTS"], 6, 1, 30)
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(build_info_url, timeout=8) as response:  # noqa: S310 - URL scheme is restricted above.
                body = json.loads(response.read().decode("utf-8"))
            if body.get("releaseId") == plan["releaseId"] and body.get("sourceSha256") == plan["archiveSha256"]:
                with urllib.request.urlopen(course_url, timeout=8) as course_response:  # noqa: S310 - URL scheme is restricted above.
                    course_status = course_response.status
                if 200 <= course_status < 500:
                    student_healthy = probe_authenticated_page(public_url, "student01", "/student/home")
                    teacher_healthy = probe_authenticated_page(public_url, "teacher01", "/teacher/workbench")
                    if student_healthy and teacher_healthy:
                        return
                    break
        except Exception:
            pass
        if attempt + 1 < attempts:
            time.sleep(2)
    raise RuntimeError("public release health did not match the activated release")


def main() -> None:
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError("Paramiko is required for this transport") from exc

    archive = (ROOT / read_arg("--archive", "artifacts/web-source-release/dgbook-web-source.tar.gz")).resolve()
    manifest_path = (ROOT / read_arg("--manifest", "artifacts/web-source-release/dgbook-web-source.upload-manifest.json")).resolve()
    if not archive.is_file() or not manifest_path.is_file():
        raise ValueError("release archive or manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = sha256(archive)
    if manifest.get("sha256") != digest:
        raise ValueError("archive digest mismatch")

    configured_base = first_env(["DGBOOK_WEB_DEPLOY_BASE_DIR"], DEFAULT_BASE_DIR)
    configured_drop = first_env(["DGBOOK_WEB_DEPLOY_DROP_DIR"], DEFAULT_DROP_DIR)
    if configured_base != DEFAULT_BASE_DIR or configured_drop != DEFAULT_DROP_DIR:
        raise ValueError("deployment paths must use the managed DGBook roots")

    host = required(["DGBOOK_WEB_DEPLOY_HOST", "DGBOOK_DEPLOY_HOST"])
    user = first_env(["DGBOOK_WEB_DEPLOY_USER", "DGBOOK_DEPLOY_USER"], "root")
    port = bounded_integer(["DGBOOK_WEB_DEPLOY_PORT", "DGBOOK_DEPLOY_PORT"], 22, 1, 65535)
    password = first_env(["DGBOOK_WEB_DEPLOY_PASSWORD", "DGBOOK_DEPLOY_PASSWORD"])
    key_path = first_env(["DGBOOK_WEB_DEPLOY_SSH_KEY_PATH", "DGBOOK_DEPLOY_SSH_KEY_PATH"])
    if not password and not key_path:
        raise ValueError("SSH authentication is not configured")
    service = first_env(["DGBOOK_WEB_DEPLOY_SERVICE"], "dgbook-web")
    public_host = first_env(["DGBOOK_WEB_DEPLOY_PUBLIC_HOST"], host)
    hostname = first_env(["DGBOOK_WEB_DEPLOY_HOSTNAME"], "127.0.0.1")
    app_port = first_env(["DGBOOK_WEB_DEPLOY_APP_PORT"], "3157")
    helper_token = first_env(["DGBOOK_HELPER_TOKEN"])
    keep_releases = bounded_integer(["DGBOOK_WEB_DEPLOY_KEEP_RELEASES"], 3, 1, 20)
    nginx = first_env(["DGBOOK_WEB_DEPLOY_NGINX"], "1") != "0"
    public_url = first_env(["DGBOOK_WEB_DEPLOY_PUBLIC_URL"], f"http://{public_host}")
    plan = build_shared_plan(
        cli_release_id=read_arg("--release-id"),
        env_release_id=first_env(["DGBOOK_WEB_DEPLOY_RELEASE_ID"]),
        git_commit=str(manifest.get("sourceGit", {}).get("commit", "")),
        archive_sha256=digest,
        service=service,
        public_host=public_host,
        hostname=hostname,
        app_port=app_port,
        helper_token=helper_token,
        keep_releases=keep_releases,
        nginx=nginx,
    )

    ssh = paramiko.SSHClient()
    strict_hosts = first_env(["DGBOOK_WEB_DEPLOY_STRICT_HOST_KEY_CHECKING", "DGBOOK_DEPLOY_STRICT_HOST_KEY_CHECKING"], "no")
    if strict_hosts == "yes":
        ssh.load_system_host_keys()
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    elif strict_hosts in {"no", "accept-new"}:
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        raise ValueError("host-key policy is invalid")
    connect: dict[str, Any] = {
        "hostname": host,
        "username": user,
        "port": port,
        "timeout": 30,
        "banner_timeout": 30,
        "auth_timeout": 30,
    }
    if key_path:
        connect["key_filename"] = key_path
    if password:
        connect["password"] = password
    ssh.connect(**connect)
    try:
        activation = execute_plan(ssh, plan, archive, manifest_path, public_url)
    finally:
        ssh.close()
    safe_summary = {
        "host": host,
        "releaseId": plan["releaseId"],
        "sha": digest,
        "schemaVersion": activation["schemaVersion"],
        "count": activation["count"],
    }
    print(json.dumps(safe_summary, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(deployment_failure_message(error), file=sys.stderr)
        raise SystemExit(1)
