import os
import unittest
from unittest.mock import patch

import pix_pending_email
import purchase_email


class TransactionalEmailRetryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.env = patch.dict(
            os.environ,
            {
                "RESEND_API_KEY": "test-key",
                "RESEND_FROM_EMAIL": "ClipSaaS <test@example.com>",
                "APP_PUBLIC_URL": "https://example.com",
            },
        )
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()

    def test_pix_email_retries_connection_failure(self) -> None:
        with (
            patch("resend.Emails.send", side_effect=[ConnectionError("reset"), {"id": "email-1"}]) as send,
            patch.object(pix_pending_email.time, "sleep"),
        ):
            result = pix_pending_email.send_pix_pending_email(
                to_email="buyer@example.com",
                customer_name="Buyer",
                total_cents=3700,
                items=[{"name": "ClipSaaS", "price_cents": 3700}],
                br_code="pix-code",
                qr_code_image_url="",
                payment_link_url="",
                correlation_id="order-1",
            )
        self.assertTrue(result["ok"])
        self.assertEqual(send.call_count, 2)

    def test_purchase_email_retries_connection_failure(self) -> None:
        with (
            patch("resend.Emails.send", side_effect=[ConnectionError("reset"), {"id": "email-2"}]) as send,
            patch.object(purchase_email.time, "sleep"),
            patch.object(purchase_email, "_purchase_attachments", return_value=None),
        ):
            result = purchase_email.send_purchase_approved_email(
                to_email="buyer@example.com",
                customer_name="Buyer",
                product_name="ClipSaaS",
                access_link="https://example.com/access",
                login_password="temporary",
                order_id="order-2",
            )
        self.assertTrue(result["ok"])
        self.assertEqual(send.call_count, 2)


if __name__ == "__main__":
    unittest.main()
