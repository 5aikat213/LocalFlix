import type BetterSqlite3 from "better-sqlite3";

export interface CatalogCard {
  id: string;
  kind: "movie" | "series";
  title: string;
  releaseYear: number | null;
  overview: string;
  runtimeMs: number | null;
  originalLanguage: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  mediaFileId: string | null;
  progress: number | null;
}

export interface CatalogRail {
  id: string;
  title: string;
  reason?: string;
  items: CatalogCard[];
}

export interface SimilarCatalogCard extends CatalogCard {
  score: number;
  reason: string;
}

export interface HomeCatalog {
  hero: CatalogCard | null;
  rails: CatalogRail[];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export class BrowseRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  private cards(where: string, parameters: unknown[] = [], limit = 30): CatalogCard[] {
    const rows = this.sqlite
      .prepare(
        `select mi.id, mi.kind, mi.title, mi.release_year as releaseYear,
                mi.overview, mi.runtime_ms as runtimeMs,
                mi.original_language as originalLanguage,
                (select local_path from artwork where media_item_id = mi.id and kind = 'poster'
                 order by created_at desc limit 1) as posterPath,
                (select local_path from artwork where media_item_id = mi.id and kind = 'backdrop'
                 order by created_at desc limit 1) as backdropPath,
                (select id from media_files where media_item_id = mi.id and available = 1
                 order by created_at limit 1) as mediaFileId,
                null as progress
         from media_items mi where ${where}
         order by mi.release_year desc, mi.title asc limit ?`
      )
      .all(...parameters, limit) as CatalogCard[];
    return rows;
  }

  get(id: string): CatalogCard | null {
    return this.cards("mi.id = ?", [id], 1)[0] ?? null;
  }

  private cardsByIds(ids: string[]): CatalogCard[] {
    if (ids.length === 0) return [];
    const byId = new Map(
      this.cards(
        `mi.id in (${ids.map(() => "?").join(",")})`,
        ids,
        ids.length
      ).map((card) => [card.id, card])
    );
    return ids
      .map((id) => byId.get(id))
      .filter((card): card is CatalogCard => Boolean(card));
  }

  search(query: string, limit = 30): CatalogCard[] {
    const normalized = query.trim().replace(/["']/g, " ");
    if (!normalized) return [];
    const ids = this.sqlite
      .prepare(
        `select media_item_id as id from search_documents
         where search_documents match ? limit ?`
      )
      .all(`${normalized}*`, limit) as Array<{ id: string }>;
    if (ids.length === 0) return [];
    const byId = new Map(this.cards(`mi.id in (${ids.map(() => "?").join(",")})`, ids.map(({ id }) => id), limit).map((card) => [card.id, card]));
    return ids.map(({ id }) => byId.get(id)).filter((card): card is CatalogCard => Boolean(card));
  }

  similarTo(mediaItemId: string, limit = 18): SimilarCatalogCard[] {
    const signals = this.sqlite
      .prepare(
        `select candidate.id,
                min(shared_collection.position) as collectionPosition,
                (select c.name
                   from media_collections candidate_collection
                   join media_collections seed_collection
                     on seed_collection.collection_id = candidate_collection.collection_id
                   join collections c on c.id = candidate_collection.collection_id
                  where candidate_collection.media_item_id = candidate.id
                    and seed_collection.media_item_id = ?
                  order by candidate_collection.position, c.name limit 1) as collectionName,
                (select count(distinct candidate_collection.collection_id)
                   from media_collections candidate_collection
                   join media_collections seed_collection
                     on seed_collection.collection_id = candidate_collection.collection_id
                  where candidate_collection.media_item_id = candidate.id
                    and seed_collection.media_item_id = ?) as sharedCollections,
                (select count(distinct candidate_credit.person_id)
                   from credits candidate_credit
                   join credits seed_credit on seed_credit.person_id = candidate_credit.person_id
                  where candidate_credit.media_item_id = candidate.id
                    and seed_credit.media_item_id = ?
                    and candidate_credit.role = 'director'
                    and seed_credit.role = 'director') as sharedDirectors,
                (select p.name
                   from credits candidate_credit
                   join credits seed_credit on seed_credit.person_id = candidate_credit.person_id
                   join people p on p.id = candidate_credit.person_id
                  where candidate_credit.media_item_id = candidate.id
                    and seed_credit.media_item_id = ?
                    and candidate_credit.role = 'director'
                    and seed_credit.role = 'director'
                  order by candidate_credit.display_order limit 1) as directorName,
                (select count(distinct candidate_credit.person_id)
                   from credits candidate_credit
                   join credits seed_credit on seed_credit.person_id = candidate_credit.person_id
                  where candidate_credit.media_item_id = candidate.id
                    and seed_credit.media_item_id = ?
                    and candidate_credit.role = 'actor'
                    and seed_credit.role = 'actor') as sharedCast,
                (select p.name
                   from credits candidate_credit
                   join credits seed_credit on seed_credit.person_id = candidate_credit.person_id
                   join people p on p.id = candidate_credit.person_id
                  where candidate_credit.media_item_id = candidate.id
                    and seed_credit.media_item_id = ?
                    and candidate_credit.role = 'actor'
                    and seed_credit.role = 'actor'
                  order by candidate_credit.display_order limit 1) as castName,
                (select count(distinct candidate_genre.genre_id)
                   from media_genres candidate_genre
                   join media_genres seed_genre on seed_genre.genre_id = candidate_genre.genre_id
                  where candidate_genre.media_item_id = candidate.id
                    and seed_genre.media_item_id = ?) as sharedGenres,
                (select g.name
                   from media_genres candidate_genre
                   join media_genres seed_genre on seed_genre.genre_id = candidate_genre.genre_id
                   join genres g on g.id = candidate_genre.genre_id
                  where candidate_genre.media_item_id = candidate.id
                    and seed_genre.media_item_id = ?
                  order by g.name limit 1) as genreName,
                case when candidate.original_language is not null
                       and candidate.original_language = seed.original_language then 1 else 0 end as sameLanguage,
                case when candidate.release_year is not null and seed.release_year is not null
                       and abs(candidate.release_year - seed.release_year) <= 10 then 1 else 0 end as closeInYear
           from media_items candidate
           join media_items seed on seed.id = ?
           left join media_collections shared_collection
             on shared_collection.media_item_id = candidate.id
            and exists(select 1 from media_collections seed_collection
                        where seed_collection.media_item_id = seed.id
                          and seed_collection.collection_id = shared_collection.collection_id)
          where candidate.id != seed.id
            and exists(select 1 from media_files mf
                        where mf.media_item_id = candidate.id and mf.available = 1)
          group by candidate.id`
      )
      .all(
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId,
        mediaItemId
      ) as Array<{
        id: string;
        collectionPosition: number | null;
        collectionName: string | null;
        sharedCollections: number;
        sharedDirectors: number;
        directorName: string | null;
        sharedCast: number;
        castName: string | null;
        sharedGenres: number;
        genreName: string | null;
        sameLanguage: 0 | 1;
        closeInYear: 0 | 1;
      }>;

    const ranked = signals
      .map((signal) => {
        const score =
          Math.min(signal.sharedCollections * 100, 150) +
          Math.min(signal.sharedDirectors * 30, 60) +
          Math.min(signal.sharedCast * 12, 48) +
          Math.min(signal.sharedGenres * 10, 30) +
          signal.sameLanguage * 5 +
          signal.closeInYear * 5;
        const reason = signal.collectionName
          ? signal.collectionName
          : signal.directorName
            ? `Directed by ${signal.directorName}`
            : signal.castName
              ? `Featuring ${signal.castName}`
              : signal.genreName
                ? `More ${signal.genreName}`
                : signal.sameLanguage
                  ? "Same language"
                  : "From a similar era";
        return { ...signal, score, reason };
      })
      .filter(({ score }) => score >= 15)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (left.collectionName && left.collectionName === right.collectionName) {
          return (left.collectionPosition ?? Number.MAX_SAFE_INTEGER) -
            (right.collectionPosition ?? Number.MAX_SAFE_INTEGER);
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);
    const cards = new Map(this.cardsByIds(ranked.map(({ id }) => id)).map((card) => [card.id, card]));
    return ranked.flatMap(({ id, score, reason }) => {
      const card = cards.get(id);
      return card ? [{ ...card, score, reason }] : [];
    });
  }

  home(profileId: string): HomeCatalog {
    const favorites = this.cards(
      "exists(select 1 from favorites f where f.media_item_id = mi.id and f.profile_id = ?)",
      [profileId]
    );
    const recent = this.cards("exists(select 1 from media_files mf where mf.media_item_id = mi.id and mf.available = 1)");
    const progressRows = this.sqlite
      .prepare(
        `select mf.media_item_id as id, wp.position_ms * 1.0 / wp.duration_ms as progress
         from watch_progress wp join media_files mf on mf.id = wp.media_file_id
         where wp.profile_id = ? and wp.completed = 0 and wp.position_ms > 0
         order by wp.last_watched_at desc`
      )
      .all(profileId) as Array<{ id: string; progress: number }>;
    const progressMap = new Map(progressRows.map((row) => [row.id, row.progress]));
    const continueWatching = progressRows
      .map(({ id }) => this.get(id))
      .filter((card): card is CatalogCard => Boolean(card))
      .map((card) => ({ ...card, progress: progressMap.get(card.id) ?? null }));
    const rails: CatalogRail[] = [];
    if (continueWatching.length) rails.push({ id: "continue-watching", title: "Continue Watching", items: continueWatching });
    if (favorites.length) rails.push({ id: "my-list", title: "My List", items: favorites });
    const collectionRows = this.sqlite
      .prepare(
        `select c.id, c.name, c.slug, c.kind
           from collections c
           join media_collections mc on mc.collection_id = c.id
          where exists(select 1 from media_files mf
                        where mf.media_item_id = mc.media_item_id and mf.available = 1)
          group by c.id
         having count(distinct mc.media_item_id) >= 2
          order by c.name`
      )
      .all() as Array<{ id: string; name: string; slug: string; kind: string }>;
    for (const collection of collectionRows) {
      const itemRows = this.sqlite
        .prepare(
          `select mc.media_item_id as id
             from media_collections mc
            where mc.collection_id = ?
              and exists(select 1 from media_files mf
                          where mf.media_item_id = mc.media_item_id and mf.available = 1)
            order by mc.position is null, mc.position, mc.media_item_id`
        )
        .all(collection.id) as Array<{ id: string }>;
      rails.push({
        id: `collection-${collection.slug}`,
        title: collection.name,
        reason: collection.kind === "universe" ? "Cinematic universe" : "Complete the collection",
        items: this.cardsByIds(itemRows.map(({ id }) => id))
      });
    }
    rails.push({ id: "recently-added", title: "Recently Added", items: recent });

    const genreRows = this.sqlite
      .prepare(
        `select g.id, g.name from genres g
         join media_genres mg on mg.genre_id = g.id
         group by g.id order by count(*) desc, g.name`
      )
      .all() as Array<{ id: string; name: string }>;
    for (const genre of genreRows) {
      const items = this.cards(
        "exists(select 1 from media_genres mg where mg.media_item_id = mi.id and mg.genre_id = ?)",
        [genre.id]
      );
      if (items.length) rails.push({ id: `genre-${slug(genre.name)}`, title: genre.name, items });
    }

    const favorite = favorites[0];
    if (favorite) {
      const recommendations = this.cards(
        `mi.id != ? and (
           exists(
             select 1 from media_genres candidate
             join media_genres seed on seed.genre_id = candidate.genre_id
             where candidate.media_item_id = mi.id and seed.media_item_id = ?
           ) or exists(
             select 1 from credits candidate
             join credits seed on seed.person_id = candidate.person_id and seed.role = 'director'
             where candidate.media_item_id = mi.id and candidate.role = 'director'
               and seed.media_item_id = ?
           )
         )`,
        [favorite.id, favorite.id, favorite.id]
      );
      if (recommendations.length) {
        rails.splice(Math.min(2, rails.length), 0, {
          id: `because-${favorite.id}`,
          title: `Because you liked ${favorite.title}`,
          reason: "Shared genres or director",
          items: recommendations
        });
      }
    }
    return { hero: favorites[0] ?? recent[0] ?? null, rails };
  }
}
