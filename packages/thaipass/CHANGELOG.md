# thaipass

## 0.1.5

### Patch Changes

- [#41](https://github.com/PunGrumpy/thaipass/pull/41) [`03720b3`](https://github.com/PunGrumpy/thaipass/commit/03720b3cf4869cb3e46e2a76f05c1cd4ddd368cf) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Name the strings that made the AI Pass edge refuse a prompt, and offer to drop them. The edge answers some requests with a 403 before the model runs, scoring what the prompt contains; until now the proxy could only say that it had happened. Three strings were measured one at a time on 2026-09-12: `document.cookie`, `document.write` and `eval()`. A 403 now names whichever of them the prompt carried. A caller that sends `x-thaipass-withhold: 1` gets those strings replaced with a marker saying so before the prompt goes upstream, and the count on `withheld`. The header is off by default, because editing a caller's prompt without being asked is worse than refusing it.

## 0.1.4

### Patch Changes

- [#38](https://github.com/PunGrumpy/thaipass/pull/38) [`e963100`](https://github.com/PunGrumpy/thaipass/commit/e9631008340827ccdde945950ef88b068fb54728) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Record the model AI Pass answered on. The upstream stream carries a `data-model_switched` frame, and the parser dropped it as undecodable, so `model` on `aipass_proxy_request` has only ever been the model the caller asked for. The frame appears on 173 of 226 `gpt-5.6-sol` requests over 14 days. Within one hour, the requests carrying it called tools 96% of the time against 25% for the requests without it. Any reading of behaviour by model has therefore drawn on requests that may not have run on the model named. The parser now decodes the frame and reports it as `switchedModel`. It takes a named field when the payload has one, and keeps the payload verbatim when the payload does not.

## 0.1.3

### Patch Changes

- [#36](https://github.com/PunGrumpy/thaipass/pull/36) [`8f6cd17`](https://github.com/PunGrumpy/thaipass/commit/8f6cd17923b5f43203ab8bb2834ae316fd40a776) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Read a tool call the model wrote without the fence around it. Some models write the body the guide asks for and drop the ` ```tool_call ` fence, and the call was then delivered to the caller as prose with a `stop` finish reason — a finished-looking answer narrating a call nobody ran. A reply that opens with an object naming a tool the caller offered is now split out as a call, which recovers it for a streaming caller too, where the existing retry cannot reach. An object quoted later in a reply is still text.

## 0.1.2

### Patch Changes

- [#21](https://github.com/PunGrumpy/thaipass/pull/21) [`c4589f6`](https://github.com/PunGrumpy/thaipass/commit/c4589f6e08a9546cbb4027baf74bd61c356a9956) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Name the caller's own tool in a failed tool call, rather than reporting it as a tool of AI Pass's. The error part now reads `upstream failed on <tool>: <detail>`.

## 0.1.1

### Patch Changes

- [#19](https://github.com/PunGrumpy/thaipass/pull/19) [`823cbbc`](https://github.com/PunGrumpy/thaipass/commit/823cbbcee59ed960cab26739a436c7bb85678678) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Report a failed AI Pass tool as an error instead of returning the apology that follows it. A turn that ends on `tool-calls` with no call made now finishes as `error`.

## 0.1.0

### Minor Changes

- [`c375dfd`](https://github.com/PunGrumpy/thaipass/commit/c375dfdb1b94192a8886462fdef7b204e3f8d0c9) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - First release: `createAipass` for the AI SDK, with attachments, reasoning levels, tool calling over text and the credit balance in `providerMetadata`.
