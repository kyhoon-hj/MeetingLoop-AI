import { cookies } from "next/headers";
import { verifySessionToken, type SessionPayload } from "@meetingloop/auth";
import { getSession } from "@meetingloop/db";

export const sessionCookieName = "meetingloop_session";

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret !== "replace-with-long-random-value") {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production");
  }
  return "meetingloop-local-development-secret";
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const tokenPayload = verifySessionToken(cookieStore.get(sessionCookieName)?.value, getSessionSecret());
  if (!tokenPayload) {
    return null;
  }

  const session = await getSession(tokenPayload.userId, tokenPayload.organizationId);
  if (!session) {
    return null;
  }

  return {
    ...tokenPayload,
    role: session.membership.role
  };
}

export async function getCurrentSession() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  return getSession(payload.userId, payload.organizationId);
}
