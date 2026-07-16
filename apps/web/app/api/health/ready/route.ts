import { NextResponse } from "next/server";
import { checkDatabaseHealth, checkRequiredSchemaMigration } from "@meetingloop/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, schema] = await Promise.all([checkDatabaseHealth(), checkRequiredSchemaMigration()]);
  const ready = database.status === "ok" && schema.status === "ok";

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      database,
      schema,
      worker: { requiredForWebReadiness: false, statusEndpoint: "/api/ai/status" }
    },
    { status: ready ? 200 : 503 }
  );
}
