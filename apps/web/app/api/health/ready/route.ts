import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@meetingloop/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseHealth();
  const ready = database.status === "ok";

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      database
    },
    { status: ready ? 200 : 503 }
  );
}
