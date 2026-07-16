from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PARAMIKO_DEPLOY = ROOT / "scripts" / "deploy-web-source-paramiko.py"


def load_paramiko_deploy():
    spec = importlib.util.spec_from_file_location("deploy_web_source_paramiko", PARAMIKO_DEPLOY)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load Paramiko deploy script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeChannel:
    def __init__(self, exit_code: int = 0) -> None:
        self.exit_code = exit_code

    def shutdown_write(self) -> None:
        pass

    def recv_exit_status(self) -> int:
        return self.exit_code


class FakeInput:
    def __init__(self) -> None:
        self.channel = FakeChannel()

    def write(self, _value: str) -> None:
        pass


class FakeOutput:
    def __init__(self, value: str, exit_code: int = 0) -> None:
        self.value = value.encode("utf-8")
        self.channel = FakeChannel(exit_code)

    def read(self) -> bytes:
        return self.value


class FakeSsh:
    def __init__(self, *, stdout: str, stderr: str, exit_code: int) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code

    def exec_command(self, _command: str, timeout: int):
        del timeout
        return (
            FakeInput(),
            FakeOutput(self.stdout, self.exit_code),
            FakeOutput(self.stderr),
        )


class FakeHttpResponse:
    def __init__(self, body: object, status: int = 200) -> None:
        self.body = json.dumps(body).encode("utf-8") if not isinstance(body, bytes) else body
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, _exception_type, _exception, _traceback) -> None:
        pass

    def read(self) -> bytes:
        return self.body


class ParamikoRemoteDiagnosticsTests(unittest.TestCase):
    def test_execute_plan_surfaces_both_activation_and_rollback_failures(self) -> None:
        module = load_paramiko_deploy()
        plan = {
            "remote": {
                "prepare": "prepare",
                "preSwitch": "pre-switch",
                "switchAndHealth": "activate",
                "rollbackAfterExternalFailure": "rollback",
                "prune": "retire",
            },
            "uploads": {"archive": "/remote/archive", "manifest": "/remote/manifest"},
        }
        events: list[str] = []

        def run_remote(_ssh, phase: str, _script: str):
            events.append(phase)
            if phase == "switch-and-health":
                raise RuntimeError("activation failed")
            if phase == "rollback":
                raise RuntimeError("rollback failed")
            return ""

        with (
            patch.object(module, "run_remote", side_effect=run_remote),
            patch.object(module, "upload_files"),
            patch.object(module, "verify_external_health"),
        ):
            with self.assertRaisesRegex(RuntimeError, "activation failed and rollback also failed") as captured:
                module.execute_plan(object(), plan, Path("archive"), Path("manifest"), "http://example.test")

        self.assertEqual(events, ["prepare", "pre-switch", "switch-and-health", "rollback"])
        self.assertTrue(hasattr(captured.exception, "activation_error"))
        self.assertTrue(hasattr(captured.exception, "rollback_error"))

    def test_failed_phase_reports_bounded_sanitized_stderr_tail(self) -> None:
        module = load_paramiko_deploy()
        stderr = "\n".join(
            ["old diagnostic that must be dropped"]
            + [f"noise {index}" for index in range(20)]
            + [
                "DGBOOK_WEB_DEPLOY_PASSWORD=do-not-leak",
                "Authorization: Bearer do-not-leak-either",
                "tar: final useful diagnostic",
            ]
        )

        with self.assertRaises(RuntimeError) as captured:
            module.run_remote(
                FakeSsh(stdout="", stderr=stderr, exit_code=25),
                "pre-switch",
                "exit 25",
            )

        message = str(captured.exception)
        self.assertIn("pre-switch failed with exit code 25", message)
        self.assertIn("tar: final useful diagnostic", message)
        self.assertNotIn("old diagnostic", message)
        self.assertNotIn("do-not-leak", message)
        self.assertNotIn("DGBOOK_WEB_DEPLOY_PASSWORD", message)
        rendered = module.deployment_failure_message(captured.exception)
        self.assertIn("pre-switch failed with exit code 25", rendered)
        self.assertNotIn("do-not-leak", rendered)
        self.assertEqual(
            module.deployment_failure_message(RuntimeError("PASSWORD=must-not-leak")),
            "DGBook web deployment failed; inspect the retained release diagnostics.",
        )

    def test_failed_phase_never_reports_the_helper_token_from_a_unit_diagnostic(self) -> None:
        module = load_paramiko_deploy()

        with self.assertRaises(RuntimeError) as captured:
            module.run_remote(
                FakeSsh(
                    stdout="",
                    stderr='systemd: Environment="DGBOOK_HELPER_TOKEN=private-helper-value" is invalid',
                    exit_code=1,
                ),
                "switch-and-health",
                "exit 1",
            )

        message = str(captured.exception)
        self.assertNotIn("private-helper-value", message)
        self.assertIn("[REDACTED]", message)

    def test_external_health_rejects_a_course_route_5xx_after_release_identity_matches(self) -> None:
        module = load_paramiko_deploy()
        requested_urls: list[str] = []
        plan = {"releaseId": "release-1", "archiveSha256": "a" * 64}

        def urlopen(url: str, timeout: int):
            self.assertEqual(timeout, 8)
            requested_urls.append(url)
            if url.endswith("/api/build-info"):
                return FakeHttpResponse({"releaseId": plan["releaseId"], "sourceSha256": plan["archiveSha256"]})
            return FakeHttpResponse(b"server error", status=500)

        with (
            patch.object(module, "bounded_integer", return_value=1),
            patch.object(module.urllib.request, "urlopen", side_effect=urlopen),
        ):
            with self.assertRaisesRegex(RuntimeError, "public release health"):
                module.verify_external_health("http://example.test", plan)

        self.assertEqual(
            requested_urls,
            ["http://example.test/api/build-info", "http://example.test/course"],
        )

    def test_external_health_accepts_an_unauthenticated_course_redirect(self) -> None:
        module = load_paramiko_deploy()
        plan = {"releaseId": "release-1", "archiveSha256": "a" * 64}

        class HealthyRoleOpener:
            def open(self, _request, timeout: int):
                self.assert_timeout(timeout)
                return FakeHttpResponse(b"", status=200)

            @staticmethod
            def assert_timeout(timeout: int) -> None:
                if timeout != 8:
                    raise AssertionError(f"unexpected timeout: {timeout}")

        def urlopen(url: str, timeout: int):
            self.assertEqual(timeout, 8)
            if url.endswith("/api/build-info"):
                return FakeHttpResponse({"releaseId": plan["releaseId"], "sourceSha256": plan["archiveSha256"]})
            self.assertEqual(url, "http://example.test/course")
            return FakeHttpResponse(b"", status=307)

        with (
            patch.object(module, "bounded_integer", return_value=1),
            patch.object(module.urllib.request, "urlopen", side_effect=urlopen),
            patch.object(module.urllib.request, "build_opener", return_value=HealthyRoleOpener()),
        ):
            module.verify_external_health("http://example.test", plan)

    def test_external_health_rejects_a_non_2xx_teacher_home_after_both_role_logins(self) -> None:
        module = load_paramiko_deploy()
        plan = {"releaseId": "release-1", "archiveSha256": "a" * 64}
        role_requests: list[tuple[str, str, dict[str, object] | None]] = []

        def urlopen(url: str, timeout: int):
            self.assertEqual(timeout, 8)
            if url.endswith("/api/build-info"):
                return FakeHttpResponse({"releaseId": plan["releaseId"], "sourceSha256": plan["archiveSha256"]})
            self.assertEqual(url, "http://example.test/course")
            return FakeHttpResponse(b"", status=307)

        class RoleOpener:
            def open(self, request, timeout: int):
                self_url = request.full_url
                self_method = request.get_method()
                self.assert_timeout(timeout)
                body = json.loads(request.data.decode("utf-8")) if request.data else None
                role_requests.append((self_method, self_url, body))
                if self_url.endswith("/teacher/workbench"):
                    return FakeHttpResponse(b"server error", status=500)
                return FakeHttpResponse(b"", status=200)

            @staticmethod
            def assert_timeout(timeout: int) -> None:
                if timeout != 8:
                    raise AssertionError(f"unexpected timeout: {timeout}")

        with (
            patch.object(module, "bounded_integer", return_value=1),
            patch.object(module.urllib.request, "urlopen", side_effect=urlopen),
            patch.object(module.urllib.request, "build_opener", return_value=RoleOpener()),
        ):
            with self.assertRaisesRegex(RuntimeError, "public release health"):
                module.verify_external_health("http://example.test", plan)

        login_bodies = [body for method, url, body in role_requests if method == "POST" and url.endswith("/api/auth/login")]
        self.assertEqual(
            login_bodies,
            [
                {"username": "student01", "password": "123456"},
                {"username": "teacher01", "password": "123456"},
            ],
        )
        self.assertIn(("GET", "http://example.test/student/home", None), role_requests)
        self.assertIn(("GET", "http://example.test/teacher/workbench", None), role_requests)


if __name__ == "__main__":
    unittest.main()
