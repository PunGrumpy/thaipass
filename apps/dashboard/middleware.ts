import { internationalizationMiddleware } from "@thaipass/internationalization/middleware";
import type { NextRequest } from "next/server";

export const middleware = (request: NextRequest) =>
  internationalizationMiddleware(request);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
