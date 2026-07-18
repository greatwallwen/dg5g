import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_5g.p1_demo_content import P1_ACTIVITY_SPECS, write_p1_demo_content


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
EXPECTED_VERIFIED_MANIM = {
    "P01": {
        "/media/manim/p01/p01-site-survey-map/manifest.json",
        "/media/manim/p01/p01-site-survey-map/p01-p01-site-survey-map.webm",
        "/media/manim/p01/p01-site-survey-map/poster.png",
    },
    "P02": {
        "/media/manim/p02/p02-outdoor-site-survey/manifest.json",
        "/media/manim/p02/p02-outdoor-site-survey/p02-p02-outdoor-site-survey.webm",
        "/media/manim/p02/p02-outdoor-site-survey/poster.png",
    },
    "P03": {
        "/media/manim/p03/p03-complaint-evidence-loop/manifest.json",
        "/media/manim/p03/p03-complaint-evidence-loop/p03-p03-complaint-evidence-loop.webm",
        "/media/manim/p03/p03-complaint-evidence-loop/poster.png",
    },
}


class P1DemoContentMediaTest(unittest.TestCase):
    def test_p02_activities_are_distinct_workplace_actions_not_one_generic_record(self) -> None:
        expected_kinds = {
            "P1T2-N01-micro-01": "scope-classification",
            "P1T2-N02-foundation-01": "evidence-classification",
            "P1T2-N02-application-01": "link-reconstruction",
            "P1T2-N02-transfer-01": "structured-record",
            "P1T2-N03-micro-01": "four-state-judgement",
            "P1T2-N04-micro-01": "defective-sheet-revision",
        }
        self.assertEqual(
            {activity_id: P1_ACTIVITY_SPECS[activity_id]["activityKind"] for activity_id in expected_kinds},
            expected_kinds,
        )

        self.assertGreaterEqual(len(P1_ACTIVITY_SPECS["P1T2-N01-micro-01"]["materials"]), 4)
        self.assertGreaterEqual(len(P1_ACTIVITY_SPECS["P1T2-N02-foundation-01"]["materials"]), 4)
        revision = P1_ACTIVITY_SPECS["P1T2-N04-micro-01"]
        self.assertGreaterEqual(len(revision["materials"]), 3)
        self.assertGreaterEqual(len(revision["interaction"]["fields"]), 4)

    def test_p03_activities_require_fact_extraction_timeline_judgement_and_sheet_repair(self) -> None:
        expected_kinds = {
            "P1T3-N01-micro-01": "structured-record",
            "P1T3-N02-foundation-01": "structured-record",
            "P1T3-N02-application-01": "link-reconstruction",
            "P1T3-N02-transfer-01": "structured-record",
            "P1T3-N03-micro-01": "four-state-judgement",
            "P1T3-N04-micro-01": "defective-sheet-revision",
        }
        self.assertEqual(
            {activity_id: P1_ACTIVITY_SPECS[activity_id]["activityKind"] for activity_id in expected_kinds},
            expected_kinds,
        )

        for activity_id in [
            "P1T3-N01-micro-01",
            "P1T3-N02-foundation-01",
            "P1T3-N02-transfer-01",
        ]:
            field_ids = [field["id"] for field in P1_ACTIVITY_SPECS[activity_id]["interaction"]["fields"]]
            self.assertGreaterEqual(len(field_ids), 4, activity_id)
            self.assertNotEqual(field_ids, ["response"], activity_id)

        timeline = P1_ACTIVITY_SPECS["P1T3-N02-application-01"]
        self.assertGreaterEqual(len(timeline["materials"]), 5)
        revision = P1_ACTIVITY_SPECS["P1T3-N04-micro-01"]
        self.assertGreaterEqual(len(revision["materials"]), 3)
        self.assertGreaterEqual(len(revision["interaction"]["fields"]), 5)

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
            manim_media = {
                ref for ref in task["source"]["mediaRefs"] if ref.startswith("/media/manim/")
            }
            self.assertEqual(manim_media, EXPECTED_VERIFIED_MANIM[task["taskId"]])

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
