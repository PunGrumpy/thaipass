# thaipass

## 0.1.1

### Patch Changes

- [#19](https://github.com/PunGrumpy/thaipass/pull/19) [`823cbbc`](https://github.com/PunGrumpy/thaipass/commit/823cbbcee59ed960cab26739a436c7bb85678678) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - Report a failed AI Pass tool as an error instead of returning the apology that follows it. A turn that ends on `tool-calls` with no call made now finishes as `error`.

## 0.1.0

### Minor Changes

- [`c375dfd`](https://github.com/PunGrumpy/thaipass/commit/c375dfdb1b94192a8886462fdef7b204e3f8d0c9) Thanks [@PunGrumpy](https://github.com/PunGrumpy)! - First release: `createAipass` for the AI SDK, with attachments, reasoning levels, tool calling over text and the credit balance in `providerMetadata`.
