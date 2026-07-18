import { NextResponse } from "next/server";
import { setFavorite } from "../../../../../../src/server/catalog";
import { getDatabase } from "../../../../../../src/server/database";

export async function PUT(
  request: Request,
  context: { params: Promise<{ profileId: string; mediaItemId: string }> }
) {
  const { profileId, mediaItemId } = await context.params;
  const body: unknown = await request.json();
  const favorite =
    typeof body === "object" && body !== null && (body as { favorite?: unknown }).favorite === true;
  return NextResponse.json(setFavorite(getDatabase(), profileId, mediaItemId, favorite));
}
