import unittest
from datetime import datetime

import routes_admin


class SalesDashboardTests(unittest.TestCase):
    def test_groups_paid_orders_and_calculates_monthly_projection(self) -> None:
        now = datetime.now(routes_admin.BRAZIL_TZ).isoformat()
        data = routes_admin._sales_dashboard([
            {
                "status": "paid", "total_cents": 9700, "paid_at": now,
                "customer_name": "Ana", "customer_email": "ana@example.com",
            },
            {
                "status": "paid", "total_cents": 990, "paid_at": now,
                "customer_name": "Ana", "customer_email": "ana@example.com",
            },
            {
                "status": "pending", "total_cents": 9700, "paid_at": now,
                "customer_name": "Ignorar", "customer_email": "ignore@example.com",
            },
        ])

        self.assertEqual(data["total_sales_count"], 2)
        self.assertEqual(data["total_revenue_cents"], 10690)
        self.assertEqual(data["month_revenue_cents"], 10690)
        self.assertEqual(data["annualized_revenue_cents"], 128280)
        self.assertEqual(data["customers_count"], 1)
        self.assertEqual(data["clients"][0]["purchases_count"], 2)


if __name__ == "__main__":
    unittest.main()
