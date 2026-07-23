from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

import routes_me


class CheckoutStorageGuardTests(unittest.TestCase):
    def test_allows_checkout_when_order_storage_is_available(self) -> None:
        with patch.object(routes_me, "rest_get", return_value=[]):
            routes_me._ensure_checkout_storage_available()

    def test_quota_failure_blocks_checkout_before_charge_creation(self) -> None:
        error = RuntimeError(
            "Supabase GET orders: 402 exceed_cached_egress_quota"
        )
        with patch.object(routes_me, "rest_get", side_effect=error):
            with self.assertRaises(HTTPException) as caught:
                routes_me._ensure_checkout_storage_available()

        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn("Nenhuma cobrança foi criada", caught.exception.detail)

    def test_recent_pending_order_blocks_duplicate_charge(self) -> None:
        with patch.object(routes_me, "rest_get", return_value=[{"correlation_id": "existing"}]):
            with self.assertRaises(HTTPException) as caught:
                routes_me._ensure_no_recent_checkout("buyer@example.com")
        self.assertEqual(caught.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
