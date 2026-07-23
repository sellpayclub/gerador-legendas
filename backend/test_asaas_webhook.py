from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

import routes_me


def _request(payload: dict, token: str = "secure-token") -> Request:
    body = json.dumps(payload).encode()
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/webhooks/asaas",
            "headers": [(b"asaas-access-token", token.encode())],
        },
        receive,
    )


class AsaasWebhookTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_invalid_token(self) -> None:
        with (
            patch.dict(os.environ, {"ASAAS_WEBHOOK_TOKEN": "secure-token"}),
            patch.object(routes_me, "is_multi_tenant", return_value=True),
        ):
            with self.assertRaises(HTTPException) as caught:
                await routes_me.asaas_webhook(_request({}, "wrong"))
        self.assertEqual(caught.exception.status_code, 401)

    async def test_accepts_matching_received_payment(self) -> None:
        payload = {
            "event": "PAYMENT_RECEIVED",
            "payment": {"id": "pay_1", "externalReference": "order-1", "value": 37},
        }
        order = {"openpix_charge_id": "pay_1", "total_cents": 3700}
        with (
            patch.dict(os.environ, {"ASAAS_WEBHOOK_TOKEN": "secure-token"}),
            patch.object(routes_me, "is_multi_tenant", return_value=True),
            patch.object(routes_me, "_get_checkout_order", return_value=order),
            patch.object(routes_me, "_fulfill_if_paid", return_value={"ok": True}),
        ):
            result = await routes_me.asaas_webhook(_request(payload))
        self.assertTrue(result["fulfilled"])

    async def test_rejects_value_mismatch(self) -> None:
        payload = {
            "event": "PAYMENT_RECEIVED",
            "payment": {"id": "pay_1", "externalReference": "order-1", "value": 1},
        }
        order = {"openpix_charge_id": "pay_1", "total_cents": 3700}
        with (
            patch.dict(os.environ, {"ASAAS_WEBHOOK_TOKEN": "secure-token"}),
            patch.object(routes_me, "is_multi_tenant", return_value=True),
            patch.object(routes_me, "_get_checkout_order", return_value=order),
        ):
            with self.assertRaises(HTTPException) as caught:
                await routes_me.asaas_webhook(_request(payload))
        self.assertEqual(caught.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
