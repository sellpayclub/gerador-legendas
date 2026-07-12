"""Multi-tenant (hosted SaaS) feature flags."""
from __future__ import annotations

import os


def is_multi_tenant() -> bool:
    return os.environ.get("MULTI_TENANT", "").strip().lower() in ("1", "true", "yes")


def job_max_age_hours() -> float:
    raw = os.environ.get("JOB_MAX_AGE_HOURS", "24").strip()
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 24.0
