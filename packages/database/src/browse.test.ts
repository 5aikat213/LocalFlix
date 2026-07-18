import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

function addMovie(
  database: ReturnType<typeof createTestDatabase>,
  input: {
    title: string;
    year: number;
    genres: string[];
    director: string;
    cast?: string[];
    language?: string;
    collections?: Array<{
      name: string;
      kind: "franchise" | "universe" | "curated";
      position?: number;
    }>;
  }
) {
  const root =
    database.catalog.findLibraryRoot("movie", "/movies") ??
    database.catalog.createLibraryRoot({ kind: "movie", path: "/movies" });
  const item = database.catalog.createMediaItem({
    kind: "movie",
    title: input.title,
    releaseYear: input.year
  });
  const file = database.catalog.createMediaFile({
    libraryRootId: root.id,
    mediaItemId: item.id,
    relativePath: `${input.title}.mkv`,
    fingerprint: input.title,
    sizeBytes: 100,
    modifiedAtMs: input.year
  });
  database.catalog.applyMetadata(item.id, {
    canonicalTitle: input.title,
    releaseYear: input.year,
    overview: `${input.title} overview`,
    runtimeMinutes: 120,
    originalLanguage: input.language ?? "en",
    genres: input.genres,
    directors: [input.director],
    cast: (input.cast ?? []).map((name) => ({ name })),
    collections: (input.collections ?? []).map((collection) => ({
      ...collection,
      position: collection.position ?? null,
      overview: ""
    })),
    artwork: [],
    trailers: [],
    source: "test",
    confidence: 1
  });
  return { item, file };
}

describe("profile catalog browsing", () => {
  it("creates one default profile and keeps history and favorites profile-specific", () => {
    const database = createTestDatabase();
    const { item, file } = addMovie(database, {
      title: "Interstellar",
      year: 2014,
      genres: ["Science Fiction", "Drama"],
      director: "Christopher Nolan"
    });
    const saikat = database.profiles.ensureDefault();
    expect(database.profiles.ensureDefault()).toEqual(saikat);
    expect(database.profiles.list()).toEqual([saikat]);

    database.profiles.setFavorite(saikat.id, item.id, true);
    database.profiles.saveProgress({
      profileId: saikat.id,
      mediaFileId: file.id,
      positionMs: 60_000,
      durationMs: 120_000,
      completed: false
    });

    expect(database.profiles.isFavorite(saikat.id, item.id)).toBe(true);
    expect(database.profiles.listContinueWatching(saikat.id)).toEqual([
      expect.objectContaining({ mediaItemId: item.id, progress: 0.5 })
    ]);
    database.close();
  });

  it("builds genre and personalized rails and searches people through FTS", () => {
    const database = createTestDatabase();
    const interstellar = addMovie(database, {
      title: "Interstellar",
      year: 2014,
      genres: ["Science Fiction", "Drama"],
      director: "Christopher Nolan"
    });
    addMovie(database, {
      title: "Arrival",
      year: 2016,
      genres: ["Science Fiction", "Drama"],
      director: "Denis Villeneuve"
    });
    addMovie(database, {
      title: "Memento",
      year: 2000,
      genres: ["Thriller"],
      director: "Christopher Nolan"
    });
    const profile = database.profiles.ensureDefault();
    database.profiles.setFavorite(profile.id, interstellar.item.id, true);

    const home = database.browse.home(profile.id);
    expect(home.hero?.title).toBe("Interstellar");
    expect(home.rails.map(({ title }) => title)).toEqual(
      expect.arrayContaining(["My List", "Science Fiction", "Because you liked Interstellar"])
    );
    expect(database.browse.search("Nolan").map(({ title }) => title)).toEqual([
      "Interstellar",
      "Memento"
    ]);
    database.close();
  });

  it("ranks exact collection members first and exposes ordered collection rails", () => {
    const database = createTestDatabase();
    const collection = {
      name: "John Wick Collection",
      kind: "franchise" as const
    };
    const chapterTwo = addMovie(database, {
      title: "John Wick: Chapter 2",
      year: 2017,
      genres: ["Action", "Thriller"],
      director: "Chad Stahelski",
      cast: ["Keanu Reeves"],
      collections: [{ ...collection, position: 2 }]
    });
    addMovie(database, {
      title: "John Wick: Chapter 4",
      year: 2023,
      genres: ["Action", "Thriller"],
      director: "Chad Stahelski",
      cast: ["Keanu Reeves"],
      collections: [{ ...collection, position: 4 }]
    });
    addMovie(database, {
      title: "John Wick: Chapter 3 — Parabellum",
      year: 2019,
      genres: ["Action", "Thriller"],
      director: "Chad Stahelski",
      cast: ["Keanu Reeves"],
      collections: [{ ...collection, position: 3 }]
    });
    addMovie(database, {
      title: "Speed",
      year: 1994,
      genres: ["Action", "Thriller"],
      director: "Jan de Bont",
      cast: ["Keanu Reeves"]
    });

    const similar = database.browse.similarTo(chapterTwo.item.id);
    expect(similar.map(({ title }) => title)).toEqual([
      "John Wick: Chapter 3 — Parabellum",
      "John Wick: Chapter 4",
      "Speed"
    ]);
    expect(similar[0]).toEqual(
      expect.objectContaining({
        reason: "John Wick Collection",
        score: expect.any(Number)
      })
    );

    const profile = database.profiles.ensureDefault();
    const rail = database.browse
      .home(profile.id)
      .rails.find(({ id }) => id === "collection-john-wick-collection");
    expect(rail?.items.map(({ title }) => title)).toEqual([
      "John Wick: Chapter 2",
      "John Wick: Chapter 3 — Parabellum",
      "John Wick: Chapter 4"
    ]);
    database.close();
  });
});
