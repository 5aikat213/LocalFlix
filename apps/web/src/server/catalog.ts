import type { LocalFlixDatabase } from "@localflix/database";

export function loadBootstrap(database: LocalFlixDatabase) {
  database.profiles.ensureDefault();
  return { profiles: database.profiles.list() };
}

export function createProfile(
  database: LocalFlixDatabase,
  input: { name: string; avatar: string }
) {
  const name = input.name.trim();
  const avatar = input.avatar.trim();
  if (!name || name.length > 32) throw new Error("Profile name must be between 1 and 32 characters");
  if (!avatar || avatar.length > 32) throw new Error("Profile avatar is invalid");
  return database.profiles.create({ name, avatar });
}

export function loadHome(database: LocalFlixDatabase, profileId: string) {
  return database.browse.home(profileId);
}

export function searchCatalog(database: LocalFlixDatabase, query: string) {
  return database.browse.search(query);
}

export function loadMediaDetails(database: LocalFlixDatabase, id: string) {
  const details = database.catalog.getMediaItemDetails(id);
  if (!details) return null;
  const files = database.sqlite
    .prepare(
      `select id, relative_path as relativePath, duration_ms as durationMs,
              video_codec as videoCodec, audio_codec as audioCodec,
              width, height, hdr
       from media_files where media_item_id = ? and available = 1 order by created_at`
    )
    .all(id) as Array<{
    id: string;
    relativePath: string;
    durationMs: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    width: number | null;
    height: number | null;
    hdr: string | null;
  }>;
  const subtitles = database.sqlite
    .prepare(
      `select id, media_file_id as mediaFileId, language, label, format,
              is_default as isDefault, forced
       from subtitle_tracks
       where media_file_id in (select id from media_files where media_item_id = ?)
       order by is_default desc, language, label`
    )
    .all(id) as Array<{
    id: string;
    mediaFileId: string;
    language: string | null;
    label: string;
    format: string;
    isDefault: number;
    forced: number;
  }>;
  const seasons = database.sqlite
    .prepare(
      `select s.id, s.season_number as seasonNumber, s.title,
              e.id as episodeId, e.episode_number as episodeNumber,
              e.title as episodeTitle,
              (select id from media_files where episode_id = e.id and available = 1 limit 1) as mediaFileId
       from seasons s left join episodes e on e.season_id = s.id
       where s.series_id = ? order by s.season_number, e.episode_number`
    )
    .all(id) as Array<{
    id: string;
    seasonNumber: number;
    title: string | null;
    episodeId: string | null;
    episodeNumber: number | null;
    episodeTitle: string | null;
    mediaFileId: string | null;
  }>;
  const seasonMap = new Map<
    string,
    { id: string; seasonNumber: number; title: string | null; episodes: Array<Record<string, unknown>> }
  >();
  for (const row of seasons) {
    const season = seasonMap.get(row.id) ?? {
      id: row.id,
      seasonNumber: row.seasonNumber,
      title: row.title,
      episodes: []
    };
    if (row.episodeId) {
      season.episodes.push({
        id: row.episodeId,
        episodeNumber: row.episodeNumber,
        title: row.episodeTitle,
        mediaFileId: row.mediaFileId
      });
    }
    seasonMap.set(row.id, season);
  }
  return {
    ...details,
    artwork: details.artwork.map((art) => ({
      ...art,
      url: `/api/artwork/${encodeURIComponent(id)}/${art.kind}`
    })),
    files: files.map((file) => ({
      ...file,
      previewUrl: `/api/preview/${encodeURIComponent(file.id)}`,
      subtitles: subtitles
        .filter(({ mediaFileId }) => mediaFileId === file.id)
        .map((track) => ({
          ...track,
          isDefault: track.isDefault === 1,
          forced: track.forced === 1,
          url: `/api/subtitles/${encodeURIComponent(track.id)}`
        }))
    })),
    seasons: [...seasonMap.values()],
    similar: database.browse.similarTo(id)
  };
}

export function setFavorite(
  database: LocalFlixDatabase,
  profileId: string,
  mediaItemId: string,
  favorite: boolean
) {
  database.profiles.setFavorite(profileId, mediaItemId, favorite);
  return { favorite: database.profiles.isFavorite(profileId, mediaItemId) };
}
