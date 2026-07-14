import { NextResponse } from "next/server";
import { getAiStatus } from "../../../ai-config";
import { getSessionPayload } from "../../../session";

export async function GET() {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  return NextResponse.json(await getAiStatus());
}
