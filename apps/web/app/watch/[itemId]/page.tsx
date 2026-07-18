import PlayerPage from "../../../src/client/player-page";

export default async function WatchPage({
  params,
  searchParams
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ profile?: string | string[]; file?: string | string[] }>;
}) {
  const { itemId } = await params;
  const query = await searchParams;
  const profileId = typeof query.profile === "string" ? query.profile : null;
  const fileId = typeof query.file === "string" ? query.file : null;
  if (!profileId || !fileId) {
    return <main className="player-error"><strong>Playback link is incomplete.</strong><a href="/">Return to LocalFlix</a></main>;
  }
  return <PlayerPage itemId={itemId} profileId={profileId} fileId={fileId} />;
}
