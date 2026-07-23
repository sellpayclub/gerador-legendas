from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, patch

import asaas


class AsaasCheckoutTests(unittest.TestCase):
    def test_uses_sandbox_and_required_headers(self) -> None:
        with patch.dict(os.environ, {"ASAAS_ENVIRONMENT": "sandbox", "ASAAS_API_KEY": "secret"}):
            self.assertEqual(asaas._base_url(), "https://api-sandbox.asaas.com/v3")
            self.assertEqual(asaas._headers()["access_token"], "secret")
            self.assertIn("ClipSaaS", asaas._headers()["User-Agent"])

    @patch.object(asaas, "_request")
    def test_creates_customer_payment_and_qr(self, request: Mock) -> None:
        request.side_effect = [
            {"data": []},
            {"id": "cus_1"},
            {"id": "pay_1", "invoiceUrl": "https://example.test/invoice"},
            {"encodedImage": "aW1hZ2U=", "payload": "pix-copy"},
        ]
        result = asaas.create_pix_charge(
            3700,
            "order-1",
            {"name": "Buyer", "email": "buyer@example.com", "taxID": "123", "phone": "5511999999999"},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["charge_id"], "pay_1")
        self.assertEqual(result["brCode"], "pix-copy")
        payment_payload = request.call_args_list[2].kwargs["json"]
        self.assertEqual(payment_payload["value"], 37.0)
        self.assertEqual(payment_payload["externalReference"], "order-1")

    @patch.object(asaas, "_request")
    def test_maps_received_status_to_completed(self, request: Mock) -> None:
        request.return_value = {"id": "pay_1", "status": "RECEIVED"}
        self.assertEqual(asaas.get_charge_status("pay_1")["status"], "COMPLETED")


if __name__ == "__main__":
    unittest.main()

