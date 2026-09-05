/**
 * What `@elysiajs/openapi` cannot derive from a route: that a reply may be an
 * event stream, and which error shape a status carries.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const json = (name: string, description: string) => ({
  content: { "application/json": { schema: ref(name) } },
  description,
});

export const jsonOrStream = (
  name: string,
  description: string,
  stream: string
) => ({
  content: {
    "application/json": { schema: ref(name) },
    "text/event-stream": { schema: { description: stream, type: "string" } },
  },
  description,
});
