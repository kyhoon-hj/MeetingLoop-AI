import { NextResponse } from "next/server";
import { MinutesProviderError } from "@meetingloop/ai";
import { recordExternalAiConsent } from "@meetingloop/db";
import { z } from "zod";
import { databaseErrorResponse } from "../../../../../api-errors";
import { assertRequestScope, maxGenerationRequestBytes, readLimitedJson } from "../../../../../api-request";
import {
  analysisQueueMode,
  enqueueMinutesGeneration,
  generateMinutesForMeeting,
  getMinutesGenerationJob,
  MinutesGenerationInProgressError
} from "../../../../../minutes-generation";
import { getSessionPayload } from "../../../../../session";
import { logUnexpectedServerError } from "../../../../../server-error";

const requestSchema = z.object({
  provider: z.enum(["ollama", "gemini"]).default("ollama"),
  externalAiConsent: z.boolean().optional(),
  consentId: z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/).optional()
}).superRefine((value, context) => {
  if (value.provider === "gemini" && (value.externalAiConsent !== true || !value.consentId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "EXTERNAL_AI_CONSENT_REQUIRED" });
  }
});

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const body = await readLimitedJson(request, maxGenerationRequestBytes);
    assertRequestScope(body, { organizationId: session.organizationId, meetingId });
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      const consentRequired = parsed.error.issues.some((issue) => issue.message === "EXTERNAL_AI_CONSENT_REQUIRED");
      return NextResponse.json({ error: consentRequired ? "EXTERNAL_AI_CONSENT_REQUIRED" : "INVALID_INPUT" }, { status: consentRequired ? 428 : 400 });
    }
    const generationInput = {
      userId: session.userId,
      organizationId: session.organizationId,
      meetingId,
      provider: parsed.data.provider
    };
    if (parsed.data.provider === "gemini") {
      await recordExternalAiConsent(session.userId, {
        organizationId: session.organizationId, meetingId, provider: "gemini",
        idempotencyKey: parsed.data.consentId!
      });
    }
    if (analysisQueueMode() === "redis") {
      const job = await enqueueMinutesGeneration(generationInput);
      return NextResponse.json({ status: "QUEUED", job }, { status: 202 });
    }
    const generated = await generateMinutesForMeeting(generationInput);
    return NextResponse.json({ status: "GENERATED", ...generated });
  } catch (error) {
    if (error instanceof MinutesGenerationInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MinutesProviderError) {
      const status = error.code === "AI_RATE_LIMITED" ? 429
        : error.code === "AI_TIMEOUT" ? 504
          : error.code === "AI_RESPONSE_INVALID" ? 502 : 503;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("minutes.generate", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  if (!jobId || jobId.length > 180) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const status = await getMinutesGenerationJob({
      userId: session.userId,
      organizationId: session.organizationId,
      meetingId,
      jobId
    });
    return NextResponse.json(status, { status: status.status === "FAILED" ? 502 : 200 });
  } catch (error) {
    const response = databaseErrorResponse(error);
    if (response) return response;
    if (error instanceof Error && error.message === "ANALYSIS_JOB_NOT_FOUND") return NextResponse.json({ error: error.message }, { status: 404 });
    logUnexpectedServerError("minutes.generate.status", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
