import { NextResponse } from "next/server";
import { loadBootstrap } from "../../../src/server/catalog";
import { getDatabase } from "../../../src/server/database";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(loadBootstrap(getDatabase()));
}
