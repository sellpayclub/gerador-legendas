import unittest
from unittest.mock import patch

import user_secrets


class UserOpenAIKeyStatusTests(unittest.TestCase):
    def test_missing_key(self) -> None:
        with patch.object(user_secrets, "rest_get", return_value=[]):
            state = user_secrets.get_user_openai_key_status("user-1")
        self.assertEqual(state["status"], "missing")
        self.assertFalse(state["configured"])

    def test_ready_key(self) -> None:
        rows = [{"openai_api_key_encrypted": "cipher"}]
        with (
            patch.object(user_secrets, "rest_get", return_value=rows),
            patch.object(user_secrets, "decrypt_text", return_value="sk-test"),
        ):
            state = user_secrets.get_user_openai_key_status("user-1")
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["key"], "sk-test")

    def test_unreadable_key_is_not_reported_as_configured(self) -> None:
        rows = [{"openai_api_key_encrypted": "old-cipher"}]
        with (
            patch.object(user_secrets, "rest_get", return_value=rows),
            patch.object(user_secrets, "decrypt_text", side_effect=RuntimeError("bad key")),
        ):
            state = user_secrets.get_user_openai_key_status("user-1")
        self.assertEqual(state["status"], "unreadable")
        self.assertFalse(state["configured"])


if __name__ == "__main__":
    unittest.main()
