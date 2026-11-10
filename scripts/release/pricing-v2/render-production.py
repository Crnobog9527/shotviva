"""Render one reviewed release statement. The Supabase CLI cannot bind query parameters."""

import json
import os
from pathlib import Path
import re
import sys


def render():
    baseline = json.loads(os.environ.get("PRICING_V2_APPROVED_BASELINE", ""))
    amounts = ("accounts", "paid_credits", "free_credits", "last_ledger", "payments")
    if not isinstance(baseline, dict) or set(baseline) != {"digest", *amounts}:
        raise ValueError()
    digest = baseline["digest"]
    if not isinstance(digest, str) or not re.fullmatch("[a-f0-9]{64}", digest):
        raise ValueError()
    if any(type(baseline[key]) is not int or not 0 <= baseline[key] <= 2**63 - 1 for key in amounts):
        raise ValueError()

    sql = Path(__file__).with_name("production.sql").read_text()
    for key, value in baseline.items():
        sql = sql.replace("{{" + key + "}}", str(value))
    return sql


try:
    sys.stdout.write(render())
except (ValueError, RecursionError):
    sys.exit("Invalid or missing PRICING_V2_APPROVED_BASELINE")
