import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_5g.p1_demo_content import write_p1_demo_content


ROOT = Path(__file__).resolve().parents[2]
EXPECTED_SOURCE_MEDIA = {
    "P01": {
        "/media/5g/image2.jpeg",
        "/media/5g/image3.png",
        "/media/5g/image4.png",
        "/media/5g/image29.png",
        "/media/5g/image30.png",
        "/media/5g/image31.png",
    },
    "P02": {
        "/media/5g/image54.jpeg",
        "/media/5g/image55.png",
        "/media/5g/image56.png",
        "/media/5g/image57.png",
        "/media/5g/image58.jpeg",
        "/media/5g/image62.png",
        "/media/5g/image65.png",
    },
    "P03": set(),
}


class P1DemoContentMediaTest(unittest.TestCase):
    def test_writer_recovers_source_owned_runtime_media_without_losing_remediation(self) -> None:
        widget_manifest = json.loads(
            (ROOT / "textbook/5g/animations/published.json").read_text(encoding="utf-8")
        )
        source_artifacts = {}
        for task_id in EXPECTED_SOURCE_MEDIA:
            lesson_ast = json.loads(
                (ROOT / f"textbook/5g/generated/lesson-ast/{task_id}.json").read_text(encoding="utf-8")
            )
            widget_ids = widget_manifest["projects"][task_id]
            source_artifacts[task_id] = {
                "lessonAst": lesson_ast,
                "storyboard": {
                    **lesson_ast["content"]["storyboard"],
                    "pageId": task_id,
                },
                "widgets": [
                    json.loads((ROOT / f"textbook/5g/widgets/{widget_id}.json").read_text(encoding="utf-8"))
                    for widget_id in widget_ids
                ],
            }

        with tempfile.TemporaryDirectory() as directory:
            content = write_p1_demo_content(
                ROOT,
                Path(directory) / "p1-demo-content.json",
                source_artifacts=source_artifacts,
                widget_manifest=widget_manifest,
                media_manifest={},
            )

        for task in content["tasks"]:
            source_media = {
                ref for ref in task["source"]["mediaRefs"] if ref.startswith("/media/5g/")
            }
            self.assertEqual(source_media, EXPECTED_SOURCE_MEDIA[task["taskId"]])

        activity_ids = set()

        def collect_activity_ids(value: object) -> None:
            if isinstance(value, dict):
                if "activityKind" in value and isinstance(value.get("id"), str):
                    activity_ids.add(value["id"])
                for item in value.values():
                    collect_activity_ids(item)
            elif isinstance(value, list):
                for item in value:
                    collect_activity_ids(item)

        collect_activity_ids(content)
        self.assertTrue({
            "P1T1-N02-remediation-revision-01",
            "P1T1-N02-remediation-conclusion-01",
        }.issubset(activity_ids))


if __name__ == "__main__":
    unittest.main()
