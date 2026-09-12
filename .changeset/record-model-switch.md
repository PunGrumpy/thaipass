---
"thaipass": patch
---

Record the model AI Pass answered on. The upstream stream carries a `data-model_switched` frame, and the parser dropped it as undecodable, so `model` on `aipass_proxy_request` has only ever been the model the caller asked for. The frame appears on 173 of 226 `gpt-5.6-sol` requests over 14 days. Within one hour, the requests carrying it called tools 96% of the time against 25% for the requests without it. Any reading of behaviour by model has therefore drawn on requests that may not have run on the model named. The parser now decodes the frame and reports it as `switchedModel`. It takes a named field when the payload has one, and keeps the payload verbatim when the payload does not.
