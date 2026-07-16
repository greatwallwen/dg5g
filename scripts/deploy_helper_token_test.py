from __future__ import annotations

import importlib.util
import inspect
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PARAMIKO_DEPLOY = ROOT / "scripts" / "deploy-web-source-paramiko.py"


def load_paramiko_deploy():
    spec = importlib.util.spec_from_file_location("deploy_web_source_paramiko", PARAMIKO_DEPLOY)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load Paramiko deploy script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HelperTokenDeploymentTests(unittest.TestCase):
    def test_paramiko_service_unit_injects_helper_token(self) -> None:
        module = load_paramiko_deploy()
        self.assertIn("helper_token", inspect.signature(module.service_unit).parameters)
        unit = module.service_unit(
            "/var/www/dgbook-web/current",
            "3157",
            "127.0.0.1",
            "release-1",
            "a" * 64,
            "test-token_2026",
        )
        self.assertIn('Environment="DGBOOK_HELPER_TOKEN=test-token_2026"', unit)
        self.assertIn(
            "ExecStart=/usr/bin/env DGBOOK_SQLITE_PATH=/var/lib/dgbook/dgbook.sqlite "
            "DGBOOK_HELPER_TOKEN=test-token_2026 node runtime/apps/web/server.js",
            unit,
        )

    def test_all_deploy_paths_read_helper_token(self) -> None:
        paths = [
            ROOT / "scripts" / "deploy-web-source-paramiko.py",
            ROOT / "scripts" / "deploy-web-source-ssh.mjs",
            ROOT / "scripts" / "deploy-web-ssh.mjs",
        ]
        for path in paths:
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertIn("DGBOOK_HELPER_TOKEN", source)


if __name__ == "__main__":
    unittest.main()
