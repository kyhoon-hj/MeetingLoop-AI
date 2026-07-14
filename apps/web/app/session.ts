import { cookies } from "next/headers";
import { verifySessionToken, type SessionPayload } from "@meetingloop/auth";
import { getDemoSession } from "@meetingloop/db";

export const sessionCookieName = "meetingloop_session";

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET !== "replace-with-long-random-value"
    ? process.env.SESSION_SECRET
    : "meetingloop-local-development-secret";
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionCookieName)?.value, getSessionSecret());
}

export async function getCurrentDemoSession() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  return getDemoSession(payload.userId, payload.organizationId);
}
