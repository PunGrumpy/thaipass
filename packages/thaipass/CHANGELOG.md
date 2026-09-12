# thaipass

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
