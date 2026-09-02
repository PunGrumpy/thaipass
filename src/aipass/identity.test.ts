import { afterEach, expect, test } from "bun:test";

import { sseResponse, stubUpstream } from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { fetchIdentity } from "./identity";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const IDENTITY_PATH = "/lms/api/v1/session/session-tier";

interface SessionMember {
  readonly currentTierExp?: string | number | null;
  readonly tierName?: string | null;
}

interface SessionUser {
  readonly email?: string;
  readonly id?: string;
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

const stubIdentity = (body: SessionEnvelope, status = 200): Upstream =>
  stubUpstream(sseResponse([]), (path) =>
    path === IDENTITY_PATH ? Response.json(body, { status }) : undefined
  );

const FULL = envelope({
  member: { currentTierExp: "100", tierName: "ผู้สร้างสรรค์" },
  user: {
    email: "someone@example.com",
    id: "216048737100554638",
    name: "Grumpy",
  },
});

const identityCalls = (): string[] =>
  upstream.calls.filter((path) => path === IDENTITY_PATH);

afterEach(() => {
  upstream.restore();
});

test("reads the id, name and tier off the session", async () => {
  upstream = stubIdentity(FULL);
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity).toEqual({
    userId: "216048737100554638",
    userName: "Grumpy",
    userTier: "ผู้สร้างสรรค์",
    userTierExp: 100,
  });
});

test("never carries the email through", async () => {
  upstream = stubIdentity(FULL);
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(JSON.stringify(identity)).not.toContain("example.com");
});

test("keeps the id when the membership block is absent", async () => {
  upstream = stubIdentity(envelope({ user: { id: "42" } }));
  const identity = await fetchIdentity(nextClient(), COOKIE);
  expect(identity).toEqual({
    userId: "42",
    userName: undefined,
    userTier: undefined,
    userTierExp: undefined,
  });
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

test("asks the upstream once per client and serves the rest from cache", async () => {
  upstream = stubIdentity(FULL);
  const client = nextClient();
  await fetchIdentity(client, COOKIE);
  await fetchIdentity(client, COOKIE);
  expect(identityCalls()).toHaveLength(1);
});

test("does not cache a failed lookup", async () => {
  upstream = stubIdentity(envelope({ user: { id: "42" } }), 500);
  const client = nextClient();
  await fetchIdentity(client, COOKIE);
  await fetchIdentity(client, COOKIE);
  expect(identityCalls()).toHaveLength(2);
});
