# thaipass

## 0.1.2

### Patch Changes

- [#21](https://github.com/PunGrumpy/thaipass/pull/21) [`c4589f6`](https://github.com/PunGrumpy/thaipass/commit/c4589f6e08a9546cbb4027baf74bd61c356a9956) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Name the caller's own tool in a failed tool call, rather than reporting it as a tool of AI Pass's. The error part now reads `upstream failed on <tool>: <detail>`.

## 0.1.1

### Patch Changes

- [#19](https://github.com/PunGrumpy/thaipass/pull/19) [`823cbbc`](https://github.com/PunGrumpy/thaipass/commit/823cbbcee59ed960cab26739a436c7bb85678678) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Report a failed AI Pass tool as an error instead of returning the apology that follows it. A turn that ends on `tool-calls` with no call made now finishes as `error`.

## 0.1.0

### Minor Changes

- [`c375dfd`](https://github.com/PunGrumpy/thaipass/commit/c375dfdb1b94192a8886462fdef7b204e3f8d0c9) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - First release: `createAipass` for the AI SDK, with attachments, reasoning levels, tool calling over text and the credit balance in `providerMetadata`.
