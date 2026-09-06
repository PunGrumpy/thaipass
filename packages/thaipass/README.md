# thaipass

AI SDK provider for [AI Pass](https://de.aipass.net). `streamText` and `generateText` run against the models your account already sees in the web UI, with your own session cookie and no server in between.

```bash
bun add thaipass
```

```ts
import { streamText } from "ai";
import { createAipass } from "thaipass";

const aipass = createAipass({ cookie: process.env.AIPASS_COOKIE ?? "" });

const result = streamText({
  model: aipass("claude-sonnet-5@default"),
  prompt: "hi",
});
```

The cookie is the full `Cookie` header of a browser signed in to AI Pass. It must contain `__Secure-ai_passport_auth.session_token`.

The provider implements `LanguageModelV2` for `ai` v5. File parts upload as attachments, and a generated file comes back as the SDK's own file part. `providerOptions.aipass.thinkingLevel` picks a reasoning level, and sampling settings come back as `unsupported-setting` warnings. `usage` holds token estimates, and `providerMetadata.aipass.credits` holds the credit balance.

`createAipass` also takes `origin` for a different AI Pass host and `logger` for the warnings the provider has no reply to attach to. Both apply to the whole process.

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own. The code is MIT, and the rest of the story, from attachments to the edge's refusals, is in the [aipass-proxy README](https://github.com/PunGrumpy/aipass-proxy#readme).
