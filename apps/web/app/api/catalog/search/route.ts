import { NextRequest, NextResponse } from "next/server";
import { searchCatalog } from "../../../../src/server/catalog";
import { getDatabase } from "../../../../src/server/database";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.json({
    results: searchCatalog(getDatabase(), request.nextUrl.searchParams.get("q") ?? "")
  });
}
