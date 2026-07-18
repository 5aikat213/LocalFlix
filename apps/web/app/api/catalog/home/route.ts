import { NextRequest, NextResponse } from "next/server";
import { loadHome } from "../../../../src/server/catalog";
import { getDatabase } from "../../../../src/server/database";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  return NextResponse.json(loadHome(getDatabase(), profileId));
}
