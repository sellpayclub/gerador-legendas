import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import jobs


class RehydrateJobsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.original_store = jobs._STORE.copy()
        jobs._STORE.clear()

    def tearDown(self) -> None:
        jobs._STORE.clear()
        jobs._STORE.update(self.original_store)
        self.temp_dir.cleanup()

    def test_ignores_delete_tombstones(self) -> None:
        tombstone = self.root / "job-123.deleted.123456"
        tombstone.mkdir()
        (tombstone / "words.json").write_text(
            json.dumps({"words": []}), encoding="utf-8"
        )

        with patch.object(jobs, "ROOT", self.root):
            jobs.rehydrate_jobs()

        self.assertEqual(jobs._STORE, {})


if __name__ == "__main__":
    unittest.main()
