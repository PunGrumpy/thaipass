---
"@thaipass/core": patch
---

Lead the prompt with an implied system line when a caller attaches tools but sends no system message, so the tool guide reads as instruction rather than as a description of tools that live elsewhere. Measured across ten models: without it, two never called an attached tool and four more were unreliable; with it, all ten called it on every round.
