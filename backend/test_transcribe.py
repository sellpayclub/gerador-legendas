import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import transcribe


class OpenAITranscriptionRetryTests(unittest.TestCase):
    def test_retries_temporary_server_failure(self) -> None:
        failed = Mock(status_code=503, text="busy", headers={})
        succeeded = Mock(status_code=200)
        succeeded.json.return_value = {"words": []}

        with tempfile.TemporaryDirectory() as temp_dir:
            audio = Path(temp_dir) / "audio.mp3"
            audio.write_bytes(b"audio")
            with (
                patch.object(transcribe, "get_openai_api_key", return_value="test"),
                patch.object(transcribe, "get_openai_model", return_value="whisper-1"),
                patch.object(
                    transcribe,
                    "get_openai_transcribe_url",
                    return_value="https://example.invalid/transcribe",
                ),
                patch("requests.post", side_effect=[failed, succeeded]) as post,
                patch.object(transcribe.time, "sleep"),
            ):
                result = transcribe._call_openai_transcribe(audio, "pt")

        self.assertEqual(result, {"words": []})
        self.assertEqual(post.call_count, 2)

    def test_chunk_checkpoint_round_trip(self) -> None:
        words = [{"w": "teste", "start": 0.2, "end": 0.7}]
        with tempfile.TemporaryDirectory() as temp_dir:
            audio = Path(temp_dir) / "chunk_000.mp3"
            audio.write_bytes(b"audio chunk")
            with patch.object(transcribe, "get_openai_model", return_value="whisper-1"):
                transcribe._save_chunk_cache(audio, "pt", words)
                cached = transcribe._load_chunk_cache(audio, "pt")
                wrong_language = transcribe._load_chunk_cache(audio, "en")

        self.assertEqual(cached, words)
        self.assertIsNone(wrong_language)


if __name__ == "__main__":
    unittest.main()
