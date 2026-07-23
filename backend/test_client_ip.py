import unittest
from unittest.mock import Mock

from client_ip import get_client_ip


def request(peer: str, headers: dict[str, str] | None = None) -> Mock:
    req = Mock()
    req.client.host = peer
    req.headers = headers or {}
    return req


class ClientIpTests(unittest.TestCase):
    def test_uses_forwarded_ip_from_private_proxy(self) -> None:
        req = request("172.18.0.2", {"x-forwarded-for": "8.8.8.8, 172.18.0.1"})
        self.assertEqual(get_client_ip(req), "8.8.8.8")

    def test_ignores_spoofed_header_from_public_peer(self) -> None:
        req = request("8.8.8.8", {"x-forwarded-for": "1.1.1.1"})
        self.assertEqual(get_client_ip(req), "8.8.8.8")

    def test_uses_rightmost_public_ip_when_client_spoofs_xff(self) -> None:
        req = request(
            "172.18.0.2",
            {"x-forwarded-for": "1.1.1.1, 9.9.9.9"},
        )
        self.assertEqual(get_client_ip(req), "9.9.9.9")


if __name__ == "__main__":
    unittest.main()
