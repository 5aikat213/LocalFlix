import { NextResponse } from "next/server";
import { loadMediaDetails } from "../../../../../src/server/catalog";
import { getDatabase } from "../../../../../src/server/database";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const item = loadMediaDetails(getDatabase(), id);
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ error: "Media item not found" }, { status: 404 });
}
