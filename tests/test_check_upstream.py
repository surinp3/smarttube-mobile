import unittest

from scripts.check_upstream import is_watched, inspect_source, needs_review, render_report


class UpstreamCheckTest(unittest.TestCase):
    def test_relevant_and_unrelated_paths(self):
        prefixes = ["MediaServiceCore", "youtubeapi/src/main/"]
        self.assertTrue(is_watched("MediaServiceCore", prefixes))
        self.assertTrue(is_watched("youtubeapi/src/main/VideoInfo.java", prefixes))
        self.assertFalse(is_watched("smarttubetv/build.gradle", prefixes))

    def test_compare_and_report(self):
        def request(path, token):
            if "/branches/" in path:
                return {"commit": {"sha": "new123"}}
            return {
                "status": "ahead", "total_commits": 2,
                "files": [
                    {"filename": "youtubeapi/src/main/VideoInfo.java"},
                    {"filename": "README.md"},
                ],
            }

        found = inspect_source("media", {
            "repo": "example/media", "branch": "master",
            "pinned": "old123", "watch": ["youtubeapi/src/main/"],
        }, "token", request)
        self.assertEqual(found["commits"], 2)
        self.assertEqual(found["watched_files"], ["youtubeapi/src/main/VideoInfo.java"])
        self.assertTrue(needs_review([found]))
        self.assertIn("VideoInfo.java", render_report([found]))

    def test_truncated_comparison_needs_review(self):
        def request(path, token):
            if "/branches/" in path:
                return {"commit": {"sha": "new123"}}
            return {"status": "ahead", "total_commits": 251, "files": []}

        found = inspect_source("media", {
            "repo": "example/media", "branch": "master",
            "pinned": "old123", "watch": [],
        }, "token", request)
        self.assertTrue(found["uncertain"])
        self.assertTrue(needs_review([found]))


if __name__ == "__main__":
    unittest.main()
