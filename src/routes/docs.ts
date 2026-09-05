import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import type { AnyElysia } from "elysia/base";
import { z } from "zod";

const SPEC_PATH = "/openapi.json";
const JSON_MEDIA_TYPE = "application/json";

const jsonRouteSchema = z.object({
  body: z.string(),
  parse: z.literal("json"),
});

const routeSchema = z.object({
  hooks: z.unknown(),
  method: z.string(),
  path: z.string(),
});

const operationSchema = z.looseObject({
  requestBody: z
    .looseObject({ content: z.record(z.string(), z.unknown()) })
    .optional(),
});

const documentSchema = z.looseObject({
  paths: z.record(z.string(), z.record(z.string(), operationSchema)),
});

type Document = z.infer<typeof documentSchema>;

/**
 * Fills in the request body of every route that forces JSON parsing.
 *
 * `@elysiajs/openapi` 2.0.0-exp.0 reads a route's parse hook in the container
 * shape Elysia 1 stored it in, while Elysia 2 keeps `parse: "json"` as the
 * bare string, so such a route is documented with an empty request body. The
 * body model the route names is put back here until the plugin catches up.
 */
const withJsonBodies = (host: AnyElysia, document: Document): Document => {
  for (const route of host.routes) {
    const known = routeSchema.safeParse(route);
    if (!known.success) {
      continue;
    }
    const hooks = jsonRouteSchema.safeParse(known.data.hooks);
    if (!hooks.success) {
      continue;
    }
    const operation =
      document.paths[known.data.path]?.[known.data.method.toLowerCase()];
    if (operation?.requestBody) {
      operation.requestBody.content[JSON_MEDIA_TYPE] = {
        schema: { $ref: `#/components/schemas/${hooks.data.body}` },
      };
    }
  }
  return document;
};

/**
 * Each route registers its Zod schemas as models and describes in `detail`
 * what the plugin cannot see; only document-wide settings live here.
 */
export const docsRoutes = (host: AnyElysia) =>
  host
    .use(
      new Elysia({ name: "openapi-json-bodies" })
        .afterHandle(({ path, responseValue }) => {
          if (path !== SPEC_PATH) {
            return;
          }
          const document = documentSchema.safeParse(responseValue);
          return document.success
            ? withJsonBodies(host, document.data)
            : undefined;
        })
        .as("global")
    )
    .use(
      openapi({
        documentation: {
          components: {
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
          tags: [
            { description: "OpenAI-compatible endpoints", name: "Chat" },
            { description: "Anthropic-compatible endpoint", name: "Messages" },
            {
              description: "Images, video and music, which answer with a file",
              name: "Media",
            },
            {
              description: "Documentation, health and credit usage",
              name: "Meta",
            },
          ],
        },
        path: "/",
        scalar: {
          customCss: "",
        },
        specPath: SPEC_PATH,
      })
    );
