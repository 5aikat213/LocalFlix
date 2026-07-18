import { NextResponse } from "next/server";
import { getDatabase } from "../../../../src/server/database";
import { getLibraryStatus } from "../../../../src/server/sync";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getLibraryStatus(getDatabase()));
}
