---
"@thaipass/core": patch
"@thaipass/proxy": patch
---

Report which model answered. A request for `auto` came back with `model: "auto"` and nothing naming what ran. AI Pass does say: every stream names the model in `messageMetadata` on `start` and `finish`, and a request for `auto` carries a `data-router_decision` frame ahead of both. The parser dropped all three as undecodable. It now reads them, and the proxy reports the model as `usage.resolved_model` beside `usage.credits` on `/v1/messages`, `/v1/chat/completions` and `/v1/responses`, buffered and streamed. The top-level `model` stays the id the request named. `usage.cost` is priced at the resolved model, since `auto` has no price of its own, and each request logs it as `resolvedModel`.
