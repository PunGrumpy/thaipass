import { afterEach, expect, test } from "bun:test";

import { sseResponse, stubUpstream } from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { fetchIdentity } from "./identity";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const TIER_PATH = "/lms/api/v1/session/session-tier";
const SESSION_PATH = "/lms/api/v1/session/";

interface SessionMember {
  readonly currentTierExp?: string | number | null;
  readonly tierName?: string | null;
}

interface SessionUser {
  readonly email?: string | null;
  readonly familyName?: string | null;
  readonly givenName?: string | null;
  readonly id?: string;
  readonly middleName?: string | null;
  readonly name?: string | null;
}

interface SessionData {
  readonly member?: SessionMember | null;
  readonly user?: SessionUser;
}

interface SessionEnvelope {
  readonly data: SessionData;
  readonly message: string;
  readonly statusCode: number;
  readonly success: boolean;
}

let upstream: Upstream;
let clients = 0;

const nextClient = (): string => {
  clients += 1;
  return `client-${clients}`;
};

const envelope = (data: SessionData): SessionEnvelope => ({
  data,
  message: "Request was successful",
  statusCode: 200,
  success: true,
});

interface LiveSessionEnvelope {
  readonly data: {
    readonly session: {
      readonly member?: { readonly organizationName?: string | null };
      readonly session?: { readonly expiresAt?: string | null };
      readonly user?: { readonly role?: string | null };
    };
  };
}

const stubIdentity = (
  body: SessionEnvelope,
  status = 200,
  session?: LiveSessionEnvelope
): Upstream =>
  stubUpstream(sseResponse([]), (path) => {
    if (path === TIER_PATH) {
      return Response.json(body, { status });
    }
    if (path === SESSION_PATH && session) {
      return Response.json(session);
    }
  });

const FULL = envelope({
  member: { currentTierExp: "100", tierName: "ผู้สร้างสรรค์" },
  user: {
    email: "someone@example.com",
    id: "216048737100554638",
    name: "Grumpy",
  },
});

const LIVE_SESSION = {
  data: {
    session: {
      member: { organizationName: "Example Org" },
      session: { expiresAt: "2026-09-09T05:53:06.436Z" },
      user: { role: "user" },
    },
  },
};

const callsTo = (path: string): string[] =>
  upstream.calls.filter((called) => called === path);

afterEach(() => {
  upstream.restore();
});

test("reads the id, name, email and tier off the session", async () => {
  upstream = stubIdentity(FULL);
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity).toEqual({
    orgName: undefined,
    sessionExpiresAt: undefined,
    userEmail: "someone@example.com",
    userId: "216048737100554638",
    userName: "Grumpy",
    userRole: undefined,
    userTier: "ผู้สร้างสรรค์",
    userTierExp: 100,
  });
});

test("merges the organization, role and cookie expiry from the session endpoint", async () => {
  upstream = stubIdentity(FULL, 200, LIVE_SESSION);
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity).toEqual({
    orgName: "Example Org",
    sessionExpiresAt: "2026-09-09T05:53:06.436Z",
    userEmail: "someone@example.com",
    userId: "216048737100554638",
    userName: "Grumpy",
    userRole: "user",
    userTier: "ผู้สร้างสรรค์",
    userTierExp: 100,
  });
});

test("keeps the profile fields when the session call fails", async () => {
  upstream = stubIdentity(FULL);
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity?.userId).toBe("216048737100554638");
  expect(identity?.userTier).toBe("ผู้สร้างสรรค์");
  expect(identity?.sessionExpiresAt).toBeUndefined();
});

test("joins the given, middle and family names", async () => {
  upstream = stubIdentity(
    envelope({
      user: {
        familyName: "Lovelace",
        givenName: "Ada",
        id: "42",
        middleName: "Byron",
        name: "Grumpy",
      },
    })
  );
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity?.userName).toBe("Ada Byron Lovelace");
});

test("skips a null middle name", async () => {
  upstream = stubIdentity(
    envelope({
      user: {
        familyName: "Lovelace",
        givenName: "Ada",
        id: "42",
        middleName: null,
      },
    })
  );
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity?.userName).toBe("Ada Lovelace");
});

test("keeps the id when the membership block is absent", async () => {
  upstream = stubIdentity(envelope({ user: { id: "42" } }));
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity).toEqual({
    orgName: undefined,
    sessionExpiresAt: undefined,
    userEmail: undefined,
    userId: "42",
    userName: undefined,
    userRole: undefined,
    userTier: undefined,
    userTierExp: undefined,
  });
});

test("treats a blank name and email as absent", async () => {
  upstream = stubIdentity(
    envelope({ user: { email: "  ", id: "42", name: "" } })
  );
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity?.userName).toBeUndefined();
  expect(identity?.userEmail).toBeUndefined();
});

test("leaves the tier balance undefined when it is not a number", async () => {
  upstream = stubIdentity(
    envelope({ member: { currentTierExp: "many" }, user: { id: "42" } })
  );
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity?.userTierExp).toBeUndefined();
});

test("returns null when the session call fails", async () => {
  upstream = stubIdentity(envelope({ user: { id: "42" } }), 401);
  expect(await fetchIdentity(nextClient(), COOKIE)).toBeNull();
});

test("returns null when the payload has no user id", async () => {
  upstream = stubIdentity(envelope({ member: null }));
  expect(await fetchIdentity(nextClient(), COOKIE)).toBeNull();
});

test("asks each endpoint once per client and serves the rest from cache", async () => {
  upstream = stubIdentity(FULL, 200, LIVE_SESSION);
  const client = nextClient();
  await fetchIdentity(client, COOKIE);
  await fetchIdentity(client, COOKIE);
  expect(callsTo(TIER_PATH)).toHaveLength(1);
  expect(callsTo(SESSION_PATH)).toHaveLength(1);
});

test("does not cache a failed lookup", async () => {
  upstream = stubIdentity(envelope({ user: { id: "42" } }), 500);
  const client = nextClient();
  await fetchIdentity(client, COOKIE);
  await fetchIdentity(client, COOKIE);
  expect(callsTo(TIER_PATH)).toHaveLength(2);
});
