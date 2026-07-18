import { NextResponse } from "next/server";
import { createProfile, loadBootstrap } from "../../../src/server/catalog";
import { getDatabase } from "../../../src/server/database";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(loadBootstrap(getDatabase()));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; avatar?: unknown };
    if (typeof body.name !== "string" || typeof body.avatar !== "string") {
      return NextResponse.json({ error: "name and avatar are required" }, { status: 400 });
    }
    return NextResponse.json(
      createProfile(getDatabase(), { name: body.name, avatar: body.avatar }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create profile" },
      { status: 400 }
    );
  }
}
