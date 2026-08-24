import { buildCorsOriginChecker } from "./cors-origin";

function check(checker: ReturnType<typeof buildCorsOriginChecker>, origin: string | undefined) {
  return new Promise<boolean>((resolve) => {
    checker(origin, (err, allow) => resolve(!err && !!allow));
  });
}

describe("buildCorsOriginChecker", () => {
  const originalEnv = process.env.CORS_ORIGIN;
  afterEach(() => {
    process.env.CORS_ORIGIN = originalEnv;
  });

  it("allows requests with no Origin header (curl, server-to-server)", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, undefined)).toBe(true);
  });

  it("allows localhost and 127.0.0.1 on the frontend's port", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "http://localhost:4001")).toBe(true);
    expect(await check(checker, "http://127.0.0.1:4001")).toBe(true);
  });

  it("allows a LAN IP (192.168.x.x) on the frontend's port", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "http://192.168.1.8:4001")).toBe(true);
  });

  it("allows a Tailscale CGNAT address (100.64.0.0/10) on the frontend's port", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "http://100.90.12.4:4001")).toBe(true);
  });

  it("rejects a public internet IP even on the right port — never opens to the open web", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "http://8.8.8.8:4001")).toBe(false);
  });

  it("rejects a private-range IP on the wrong port", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "http://192.168.1.8:9999")).toBe(false);
  });

  it("still honours an explicit CORS_ORIGIN entry regardless of host/port rules", async () => {
    process.env.CORS_ORIGIN = "https://shop.example.com";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "https://shop.example.com")).toBe(true);
  });

  it("rejects a malformed Origin header", async () => {
    process.env.CORS_ORIGIN = "";
    const checker = buildCorsOriginChecker("4001");
    expect(await check(checker, "not-a-url")).toBe(false);
  });
});
