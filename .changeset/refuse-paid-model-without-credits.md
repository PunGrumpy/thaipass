---
"@thaipass/proxy": patch
---

Refuse a paid model with a `429` once the account's credits are spent. AI Pass would otherwise answer it from a free model without saying so. The error names the reset time and the free models, sets `retry-after`, and carries the `usage_limit_reached` type and `resets_at` that Codex reads. A free model still goes through.
