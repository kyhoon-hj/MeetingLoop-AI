import { createHmac, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { roleSchema, type Role } from "@meetingloop/domain";

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
}

export function canManageProject(user: SessionUser): boolean {
  const role = roleSchema.parse(user.role);
  return role === "ORG_ADMIN" || role === "PROJECT_ADMIN";
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export interface SessionPayload {
  userId: string;
  organizationId: string;
  role: Role;
  expiresAt: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
  if (parsed.expiresAt < Date.now()) {
    return null;
  }

  return {
    ...parsed,
    role: roleSchema.parse(parsed.role)
  };
}
