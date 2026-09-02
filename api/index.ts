import { app } from "../src/app";

export default {
  fetch: (request: Request): Response | Promise<Response> => app.fetch(request),
};
