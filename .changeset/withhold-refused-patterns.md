---
"thaipass": patch
---

Name the strings that made the AI Pass edge refuse a prompt, and offer to drop them. The edge answers some requests with a 403 before the model runs, scoring what the prompt contains; until now the proxy could only say that it had happened. Three strings were measured one at a time on 2026-09-12: `document.cookie`, `document.write` and `eval()`. A 403 now names whichever of them the prompt carried. A caller that sends `x-thaipass-withhold: 1` gets those strings replaced with a marker saying so before the prompt goes upstream, and the count on `withheld`. The header is off by default, because editing a caller's prompt without being asked is worse than refusing it.
