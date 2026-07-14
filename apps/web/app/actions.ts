"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken } from "@meetingloop/auth";
import { archiveDemoProject, authenticateDemoUser, createDemoMeeting, createDemoProject, registerDemoOrganization, restoreDemoProject, updateDemoProject } from "@meetingloop/db";
import { archiveProjectInputSchema, createMeetingInputSchema, createProjectInputSchema, registerOrganizationInputSchema, restoreProjectInputSchema, updateProjectInputSchema } from "@meetingloop/domain";
import { getSessionPayload, getSessionSecret, sessionCookieName } from "./session";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(formData: FormData): Promise<void> {
  const session = await authenticateDemoUser(formValue(formData, "email"), formValue(formData, "password"));
  if (!session) {
    redirect("/?error=login");
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, createSessionToken({
    userId: session.user.id,
    organizationId: session.organization.id,
    role: session.membership.role,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8
  }, getSessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  redirect("/");
}

export async function registerAction(formData: FormData): Promise<void> {
  try {
    const session = await registerDemoOrganization(registerOrganizationInputSchema.parse({
      email: formValue(formData, "email"),
      password: formValue(formData, "password"),
      displayName: formValue(formData, "displayName"),
      organizationName: formValue(formData, "organizationName"),
      organizationSlug: formValue(formData, "organizationSlug").toLowerCase(),
      timezone: "Asia/Seoul"
    }));

    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, createSessionToken({
      userId: session.user.id,
      organizationId: session.organization.id,
      role: session.membership.role,
      expiresAt: Date.now() + 1000 * 60 * 60 * 8
    }, getSessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "register";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  const input = createProjectInputSchema.parse({
    organizationId: payload.organizationId,
    name: formValue(formData, "name"),
    key: formValue(formData, "key").toUpperCase(),
    description: formValue(formData, "description")
  });

  try {
    await createDemoProject(payload.userId, payload.role, input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "project";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  const input = updateProjectInputSchema.parse({
    organizationId: payload.organizationId,
    projectId: formValue(formData, "projectId"),
    name: formValue(formData, "name"),
    description: formValue(formData, "description")
  });

  try {
    await updateDemoProject(payload.userId, payload.role, input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "project";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  const input = archiveProjectInputSchema.parse({
    organizationId: payload.organizationId,
    projectId: formValue(formData, "projectId")
  });

  try {
    await archiveDemoProject(payload.userId, payload.role, input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "project";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  const input = restoreProjectInputSchema.parse({
    organizationId: payload.organizationId,
    projectId: formValue(formData, "projectId")
  });

  try {
    await restoreDemoProject(payload.userId, payload.role, input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "project";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function createMeetingAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  const participants = lines(formValue(formData, "participants")).map((line) => {
    const [displayName = "", roleLabel = "", organizationLabel = ""] = line.split("/").map((part) => part.trim());
    return { displayName, roleLabel, organizationLabel };
  });
  const agendas = lines(formValue(formData, "agendas")).map((line) => {
    const [title = "", summary = ""] = line.split(":").map((part) => part.trim());
    return { title, summary };
  });

  const input = createMeetingInputSchema.parse({
    organizationId: payload.organizationId,
    projectId: formValue(formData, "projectId"),
    title: formValue(formData, "title"),
    meetingType: formValue(formData, "meetingType"),
    participants,
    agendas,
    consentConfirmed: formData.get("consentConfirmed") === "on",
    fixtureFileName: formValue(formData, "fixtureFileName"),
    fixtureMimeType: "audio/wav",
    fixtureSizeBytes: 4096
  });

  try {
    await createDemoMeeting(payload.userId, payload.role, input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "meeting";
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}
