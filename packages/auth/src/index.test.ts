import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./index";

describe("signed session token", () => {
  it("round-trips a valid session and rejects tampering", () => {
    const token = createSessionToken({
      userId: "user-1",
      organizationId: "org-1",
      role: "ORG_ADMIN",
      expiresAt: Date.now() + 60000
    }, "test-secret");

    expect(verifySessionToken(token, "test-secret")?.userId).toBe("user-1");
    expect(verifySessionToken(`${token}x`, "test-secret")).toBeNull();
  });
});
