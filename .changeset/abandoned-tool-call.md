---
"thaipass": patch
---

Report a failed AI Pass tool as an error instead of returning the apology that follows it. A turn that ends on `tool-calls` with no call made now finishes as `error`.
