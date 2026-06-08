import { describe, expect, it } from "vitest";

import {
  createAdminSessionCookie,
  credentialsMatch,
  verifyAdminRequest,
  type AuthEnv,
} from "./_shared";

const adminEnv: AuthEnv = {
  TEAM_DREAM_ADMIN_ID: "admin",
  TEAM_DREAM_ADMIN_PASSWORD: "admin",
  TEAM_DREAM_AUTH_SECRET: "test-secret",
};

describe("admin auth functions", () => {
  it("accepts the configured shared admin credentials", () => {
    expect(credentialsMatch(adminEnv, "admin", "admin")).toBe(true);
  });

  it("rejects incorrect shared admin credentials", () => {
    expect(credentialsMatch(adminEnv, "admin", "wrong-password")).toBe(false);
    expect(credentialsMatch(adminEnv, "guest", "admin")).toBe(false);
  });

  it("creates a signed admin cookie that can be verified", async () => {
    const issuedAt = new Date("2026-06-08T00:00:00.000Z");
    const cookie = await createAdminSessionCookie(adminEnv, issuedAt);
    const request = {
      headers: new Headers({
        Cookie: cookie.split(";")[0],
      }),
    } as Request;

    await expect(verifyAdminRequest(request, adminEnv, new Date("2026-06-08T00:01:00.000Z"))).resolves.toBe(true);
  });
});
