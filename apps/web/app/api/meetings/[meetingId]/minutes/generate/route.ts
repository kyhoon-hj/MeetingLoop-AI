import { NextResponse } from "next/server";
import { MinutesProviderError } from "@meetingloop/ai";
import { z } from "zod";
import { databaseErrorResponse } from "../../../../../api-errors";
import { generateMinutesForMeeting, MinutesGenerationInProgressError } from "../../../../../minutes-generation";
import { getSessionPayload } from "../../../../../session";
import { logUnexpectedServerError } from "../../../../../server-error";

const requestSchema = z.object({
  provider: z.enum(["ollama", "gemini"]).default("ollama")
});

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const generated = await generateMinutesForMeeting({
      userId: session.userId,
      organizationId: session.organizationId,
      meetingId,
      provider: parsed.data.provider
    });
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
