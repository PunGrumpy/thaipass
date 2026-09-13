---
"thaipass": patch
---

Take a thaipass token where the Cookie header goes, and say so when it cannot be opened. The gateway can now seal an AI Pass session into a `tp_…` token that an app carries instead of the cookie, and `thaipass login` hands one out, so a token will be pasted into `createAipass` sooner or later. This provider is not a gateway — it talks to AI Pass directly — so a token only works in a process that also holds the `THAIPASS_TOKEN_KEY` that sealed it. Where it does, the token is opened and the session inside it used; where it does not, `createAipass` throws and names what it needs rather than letting AI Pass refuse the first request for reasons of its own. A credential carrying no `__Secure-ai_passport_auth.session_token` is refused at `createAipass` too, instead of failing upstream a call later.
