import { app } from "../src/app";

const handler = (request: Request): Response | Promise<Response> =>
  app.fetch(request);

export const GET = handler;
export const POST = handler;
export default handler;
