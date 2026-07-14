import unittest

import clips


class LongVideoClipTests(unittest.TestCase):
    def test_target_never_exceeds_output_limit(self) -> None:
        self.assertEqual(clips._clip_target_count(60 * 60), clips.MAX_CLIPS)
        self.assertEqual(clips._clip_target_count(2 * 60 * 60), clips.MAX_CLIPS)

    def test_segment_edits_are_used_for_subtitle_timeline(self) -> None:
        words = [
            {"w": "gancho", "start": 10.0, "end": 11.0},
            {"w": "removida", "start": 20.0, "end": 21.0},
            {"w": "corpo", "start": 22.0, "end": 23.0},
        ]
        segments = [
            {
                "role": "hook",
                "start_word_idx": 0,
                "end_word_idx": 0,
                "start_s": 10.0,
                "end_s": 11.0,
            },
            {
                "role": "body",
                # Original AI bounds included word 1, but the user moved the
                # start forward to 22 seconds in the bounds editor.
                "start_word_idx": 1,
                "end_word_idx": 2,
                "start_s": 22.0,
                "end_s": 23.0,
            },
        ]

        merged = clips.merge_segment_words(words, segments)

        self.assertEqual([w["w"] for w in merged], ["gancho", "corpo"])
        self.assertEqual(merged[1]["start"], 1.0)


if __name__ == "__main__":
    unittest.main()
