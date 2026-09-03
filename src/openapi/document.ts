import { z } from "zod";

import { DEFAULT_MODEL } from "../aipass/models";
import { anthropicErrorSchema } from "../anthropic/errors";
import { messagesRequestSchema } from "../anthropic/schema";
import { messageSchema, messageStreamEventSchema } from "../anthropic/wire";
import { apiErrorSchema, upstreamErrorSchema } from "../openai/errors";
import { chatRequestSchema } from "../openai/schema";
import {
  chatCompletionChunkSchema,
  chatCompletionSchema,
} from "../openai/wire";
import { healthSchema } from "../routes/health";
import { modelListSchema } from "../routes/models";

const schemaOf = (schema: z.ZodType, io: "input" | "output") => {
  const { $schema: _drafted, ...rest } = z.toJSONSchema(schema, { io });
  return rest;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const json = (name: string) => ({
  content: { "application/json": { schema: ref(name) } },
});

const TOOLS_NOTE =
  "Tools are offered to the model through the prompt and its calls are parsed back out of the reply, since AI Pass carries text only; how well that works depends on the model following the format.";

export const openapiDocument = {
  components: {
    schemas: {
      AnthropicError: schemaOf(anthropicErrorSchema, "output"),
      ApiError: schemaOf(apiErrorSchema, "output"),
      ChatCompletion: schemaOf(chatCompletionSchema, "output"),
      ChatCompletionChunk: schemaOf(chatCompletionChunkSchema, "output"),
      ChatRequest: schemaOf(chatRequestSchema, "input"),
      Health: schemaOf(healthSchema, "output"),
      Message: schemaOf(messageSchema, "output"),
      MessageStreamEvent: schemaOf(messageStreamEventSchema, "output"),
      MessagesRequest: schemaOf(messagesRequestSchema, "input"),
      ModelList: schemaOf(modelListSchema, "output"),
      UpstreamError: schemaOf(upstreamErrorSchema, "output"),
    },
    securitySchemes: {
      aipassCookie: {
        description:
          "The whole Cookie header from a logged-in AI Pass browser session. It must contain __Secure-ai_passport_auth.session_token. In an OpenAI client, paste it into the API key field.",
        scheme: "bearer",
        type: "http",
      },
      aipassCookieKey: {
        description:
          "The same Cookie header, sent where an Anthropic client puts its API key.",
        in: "header",
        name: "x-api-key",
        type: "apiKey",
      },
    },
  },
  info: {
    description:
      "An OpenAI- and Anthropic-compatible proxy in front of the AI Pass chat backend. The proxy stores no credential: every request carries the caller's own AI Pass session cookie. Each call opens a throwaway conversation upstream, sends the whole conversation flattened into one turn, streams the reply back, and deletes the conversation.",
    title: "AIPass Proxy",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  paths: {
    "/health": {
      get: {
        description:
          "Reports the upstream origin and how many chat models the proxy serves. Needs no credential.",
        responses: { "200": { ...json("Health"), description: "Healthy" } },
        summary: "Health",
        tags: ["Meta"],
      },
    },
    "/openapi.json": {
      get: {
        description: "This document. Needs no credential.",
        responses: { "200": { description: "The OpenAPI document" } },
        summary: "OpenAPI document",
        tags: ["Meta"],
      },
    },
    "/v1/chat/completions": {
      post: {
        description: `Streams by default. Send stream: false for one buffered reply. Multi-turn conversations are flattened into a single role-labelled turn before they reach AI Pass, and usage is always zero because the upstream reports no token counts. Omitting model uses ${DEFAULT_MODEL}. ${TOOLS_NOTE}`,
        requestBody: { ...json("ChatRequest"), required: true },
        responses: {
          "200": {
            content: {
              "application/json": { schema: ref("ChatCompletion") },
              "text/event-stream": {
                schema: {
                  description:
                    "A data: line per ChatCompletionChunk, closed by data: [DONE].",
                  type: "string",
                },
              },
            },
            description: "The reply, streamed or buffered",
          },
          "400": {
            ...json("ApiError"),
            description: "Malformed body, or a model outside the catalog",
          },
          "401": {
            ...json("ApiError"),
            description: "Missing or malformed session cookie",
          },
          "502": {
            ...json("UpstreamError"),
            description: "AI Pass refused the request, often a stale cookie",
          },
        },
        security: [{ aipassCookie: [] }],
        summary: "Create a chat completion",
        tags: ["Chat"],
      },
    },
    "/v1/messages": {
      post: {
        description: `Buffered by default, as the Anthropic API is. Send stream: true for the event stream. The system prompt and the conversation are flattened into a single role-labelled turn before they reach AI Pass, images and documents are dropped, max_tokens and the sampling settings are accepted and ignored, and usage is always zero because the upstream reports no token counts. Omitting model uses ${DEFAULT_MODEL}. ${TOOLS_NOTE}`,
        requestBody: { ...json("MessagesRequest"), required: true },
        responses: {
          "200": {
            content: {
              "application/json": { schema: ref("Message") },
              "text/event-stream": {
                schema: {
                  description:
                    "An event: and data: pair per MessageStreamEvent, from message_start to message_stop.",
                  type: "string",
                },
              },
            },
            description: "The reply, buffered or streamed",
          },
          "400": {
            ...json("AnthropicError"),
            description: "Malformed body, or a model outside the catalog",
          },
          "401": {
            ...json("AnthropicError"),
            description: "Missing or malformed session cookie",
          },
          "502": {
            ...json("AnthropicError"),
            description: "AI Pass refused the request, often a stale cookie",
          },
        },
        security: [{ aipassCookieKey: [] }, { aipassCookie: [] }],
        summary: "Create a message",
        tags: ["Messages"],
      },
    },
    "/v1/models": {
      get: {
        description:
          "The chat models the proxy accepts. Ids are case-sensitive and Claude carries a @provider suffix. Needs no credential.",
        responses: {
          "200": { ...json("ModelList"), description: "The catalog" },
        },
        summary: "List models",
        tags: ["Chat"],
      },
    },
  },
  tags: [
    { description: "OpenAI-compatible endpoints", name: "Chat" },
    { description: "Anthropic-compatible endpoint", name: "Messages" },
    { description: "Documentation and health", name: "Meta" },
  ],
};
