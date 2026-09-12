---
"thaipass": patch
---

Read a tool call the model wrote without the fence around it. Some models write the body the guide asks for and drop the ` ```tool_call ` fence, and the call was then delivered to the caller as prose with a `stop` finish reason — a finished-looking answer narrating a call nobody ran. A reply that opens with an object naming a tool the caller offered is now split out as a call, which recovers it for a streaming caller too, where the existing retry cannot reach. An object quoted later in a reply is still text.
