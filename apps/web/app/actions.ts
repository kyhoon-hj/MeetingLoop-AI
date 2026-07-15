"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createSessionToken } from "@meetingloop/auth";
import { archiveProject, authenticateUser, createMeeting, createProject, registerOrganization, restoreProject, updateProject } from "@meetingloop/db";
import { archiveProjectInputSchema, createMeetingInputSchema, createProjectInputSchema, registerOrganizationInputSchema, restoreProjectInputSchema, updateProjectInputSchema } from "@meetingloop/domain";
import { getSessionPayload, getSessionSecret, sessionCookieName } from "./session";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).flatMap((value) => typeof value === "string" ? [value.trim()] : []);
}

const publicErrorCodes = new Set([
  "EMAIL_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_EXISTS",
  "PROJECT_KEY_ALREADY_EXISTS",
  "PROJECT_MANAGE_FORBIDDEN",
  "MEETING_CREATE_FORBIDDEN",
  "MEMBERSHIP_INACTIVE",
  "PROJECT_NOT_FOUND"
]);

function actionErrorCode(error: unknown, invalidInputCode: string): string {
  if (error instanceof ZodError) return invalidInputCode;
  if (error instanceof Error && publicErrorCodes.has(error.message)) return error.message;
  return "SYSTEM_ERROR";
}

export async function loginAction(formData: FormData): Promise<void> {
  const session = await authenticateUser(formValue(formData, "email"), formValue(formData, "password"));
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
    const session = await registerOrganization(registerOrganizationInputSchema.parse({
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
    const code = actionErrorCode(error, "REGISTER_INPUT_INVALID");
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  try {
    const input = createProjectInputSchema.parse({
      organizationId: payload.organizationId,
      name: formValue(formData, "name"),
      key: formValue(formData, "key").toUpperCase(),
      description: formValue(formData, "description")
    });
    await createProject(payload.userId, input);
  } catch (error) {
    const code = actionErrorCode(error, "PROJECT_INPUT_INVALID");
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  try {
    const input = updateProjectInputSchema.parse({
      organizationId: payload.organizationId,
      projectId: formValue(formData, "projectId"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description")
    });
    await updateProject(payload.userId, input);
  } catch (error) {
    const code = actionErrorCode(error, "PROJECT_INPUT_INVALID");
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  try {
    const input = archiveProjectInputSchema.parse({
      organizationId: payload.organizationId,
      projectId: formValue(formData, "projectId")
    });
    await archiveProject(payload.userId, input);
  } catch (error) {
    const code = actionErrorCode(error, "PROJECT_INPUT_INVALID");
    redirect(`/?error=${encodeURIComponent(code)}`);
  }

  redirect("/");
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/?error=session");
  }

  try {
    const input = restoreProjectInputSchema.parse({
      organizationId: payload.organizationId,
      projectId: formValue(formData, "projectId")
    });
    await restoreProject(payload.userId, input);
  } catch (error) {
    const code = actionErrorCode(error, "PROJECT_INPUT_INVALID");
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

  const participantNames = formValues(formData, "participantName");
  const participantRoles = formValues(formData, "participantRole");
  const participantOrganizations = formValues(formData, "participantOrganization");
  const participants = participantNames.length > 0
    ? participantNames.map((displayName, index) => ({
      displayName,
      roleLabel: participantRoles[index] ?? "",
      organizationLabel: participantOrganizations[index] ?? ""
    })).filter((participant) => participant.displayName)
    : lines(formValue(formData, "participants")).map((line) => {
      const [displayName = "", roleLabel = "", organizationLabel = ""] = line.split("/").map((part) => part.trim());
      return { displayName, roleLabel, organizationLabel };
    });
  const agendaTitles = formValues(formData, "agendaTitle");
  const agendaSummaries = formValues(formData, "agendaSummary");
  const agendas = agendaTitles.length > 0
    ? agendaTitles.map((title, index) => ({ title, summary: agendaSummaries[index] ?? "" })).filter((agenda) => agenda.title)
    : lines(formValue(formData, "agendas")).map((line) => {
      const separator = line.indexOf(":");
      return separator < 0
        ? { title: line, summary: "" }
        : { title: line.slice(0, separator).trim(), summary: line.slice(separator + 1).trim() };
    });

  let meetingId = "";
  try {
    const input = createMeetingInputSchema.parse({
      organizationId: payload.organizationId,
      projectId: formValue(formData, "projectId"),
      title: formValue(formData, "title"),
      meetingType: formValue(formData, "meetingType"),
      participants,
      agendas,
      consentConfirmed: formData.get("consentConfirmed") === "on",
      fixtureFileName: formValue(formData, "fixtureFileName") || "local-browser-recording.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 4096
    });
    const created = await createMeeting(payload.userId, input);
    meetingId = created.meeting.id;
  } catch (error) {
    const code = actionErrorCode(error, "MEETING_INPUT_INVALID");
    redirect(`/meetings/new?error=${encodeURIComponent(code)}`);
  }

  redirect(`/?meetingId=${encodeURIComponent(meetingId)}&created=1`);
}
