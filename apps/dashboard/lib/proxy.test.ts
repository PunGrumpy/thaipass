import { describe, expect, it } from "bun:test";

import { hasSessionToken, normalizeCookie } from "./proxy";

const VALID_TOKEN =
  "app_lang=th; __Secure-ai_passport_auth.session_token=eyJh...; other=1";

describe("normalizeCookie", () => {
  it("leaves clean cookie strings intact", () => {
    expect(normalizeCookie(VALID_TOKEN)).toBe(VALID_TOKEN);
  });

  it("strips Cookie: prefix", () => {
    expect(normalizeCookie(`Cookie: ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
    expect(normalizeCookie(`cookie: ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
  });

  it("strips Authorization: Bearer prefix", () => {
    expect(normalizeCookie(`Authorization: Bearer ${VALID_TOKEN}`)).toBe(
      VALID_TOKEN
    );
    expect(normalizeCookie(`Bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
  });

  it("extracts cookie from cURL with -H 'cookie: ...'", () => {
    const curl = `curl 'https://de.aipass.net/chat' \\
  -H 'accept: */*' \\
  -H 'cookie: ${VALID_TOKEN}' \\
  --compressed`;
    expect(normalizeCookie(curl)).toBe(VALID_TOKEN);
  });

  it('extracts cookie from cURL with double quotes -H "cookie: ..."', () => {
    const curl = `curl "https://de.aipass.net/chat" -H "cookie: ${VALID_TOKEN}"`;
    expect(normalizeCookie(curl)).toBe(VALID_TOKEN);
  });

  it("extracts cookie from cURL with -b / --cookie flag", () => {
    const curl = `curl 'https://de.aipass.net/chat' --cookie '${VALID_TOKEN}'`;
    expect(normalizeCookie(curl)).toBe(VALID_TOKEN);

    const curlB = `curl 'https://de.aipass.net/chat' -b '${VALID_TOKEN}'`;
    expect(normalizeCookie(curlB)).toBe(VALID_TOKEN);
  });

  it("extracts cookie from raw multi-line DevTools request headers", () => {
    const headers = `
GET /chat HTTP/2
Host: de.aipass.net
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
Accept: text/html,application/xhtml+xml
Cookie: ${VALID_TOKEN}
Sec-Fetch-Site: same-origin
`;
    expect(normalizeCookie(headers)).toBe(VALID_TOKEN);
  });

  it("extracts cookie from shell env assignment", () => {
    expect(normalizeCookie(`AIPASS_COOKIE="${VALID_TOKEN}"`)).toBe(VALID_TOKEN);
    expect(normalizeCookie(`export AIPASS_COOKIE='${VALID_TOKEN}'`)).toBe(
      VALID_TOKEN
    );
    expect(normalizeCookie(`set -x COOKIE '${VALID_TOKEN}'`)).toBe(VALID_TOKEN);
  });

  it("extracts cookie from JSON snippet", () => {
    expect(normalizeCookie(`{ "cookie": "${VALID_TOKEN}" }`)).toBe(VALID_TOKEN);
  });

  it("names a bare session token value, as the Application panel copies it", () => {
    const value = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..7Qk-x_1";
    expect(normalizeCookie(value)).toBe(
      `__Secure-ai_passport_auth.session_token=${value}`
    );
    expect(hasSessionToken(normalizeCookie(value))).toBe(true);
  });

  it("leaves anything that is not a bare token alone", () => {
    expect(normalizeCookie("short")).toBe("short");
    expect(normalizeCookie("http://127.0.0.1:3001/v1")).toBe(
      "http://127.0.0.1:3001/v1"
    );
    expect(normalizeCookie("app_lang=th; theme=dark")).toBe(
      "app_lang=th; theme=dark"
    );
  });

  it("strips wrapping quotes", () => {
    expect(normalizeCookie(`"${VALID_TOKEN}"`)).toBe(VALID_TOKEN);
    expect(normalizeCookie(`'${VALID_TOKEN}'`)).toBe(VALID_TOKEN);
  });
});

describe("hasSessionToken", () => {
  it("detects valid session token", () => {
    expect(hasSessionToken(VALID_TOKEN)).toBe(true);
    expect(hasSessionToken("__Secure-ai_passport_auth.session_token=123")).toBe(
      true
    );
  });

  it("rejects cookies without the session token", () => {
    expect(hasSessionToken("app_lang=th; other=123")).toBe(false);
    expect(hasSessionToken("")).toBe(false);
  });
});
