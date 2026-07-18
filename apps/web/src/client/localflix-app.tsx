"use client";

import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { LocalFlixLogo } from "./localflix-logo";
import { profileEntranceDuration } from "./logo-model";
import { initialPreviewState, previewReducer } from "./preview-model";
import { playLoginSting, previewSoundLabel } from "./sound-effects";
import { formatRuntime } from "./ui-model";
import type { CatalogCard, CatalogRail, HomeCatalog, MediaDetails, Profile } from "./types";

const ACTIVE_PROFILE_KEY = "localflix.v1.activeProfile";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`LocalFlix request failed (${response.status})`);
  return (await response.json()) as T;
}

function artworkUrl(itemId: string, kind: "poster" | "backdrop"): string {
  return `/api/artwork/${encodeURIComponent(itemId)}/${kind}`;
}

function Icon({ name }: { name: "play" | "info" | "search" | "plus" | "close" | "check" | "spark" | "volume" | "mute" }) {
  const paths = {
    play: <path d="M8 5v14l11-7z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 8h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.3 4.3L17 9l-3.7 1.7L12 15l-1.3-4.3L7 9l3.7-1.7z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12" /></>,
    mute: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 5M21 9l-5 5" /></>
  } as const;
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

const MediaCard = memo(function MediaCard({
  item,
  onOpen
}: {
  item: CatalogCard;
  onOpen: (item: CatalogCard) => void;
}) {
  return (
    <button className="media-card" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`}>
      <span
        className="media-card-art"
        style={{ backgroundImage: `linear-gradient(145deg, rgba(22,25,33,.12), rgba(5,6,9,.76)), url("${artworkUrl(item.id, "backdrop")}")` }}
      >
        <span className="media-card-monogram">{item.title.slice(0, 1)}</span>
      </span>
      <span className="media-card-shade" />
      <span className="media-card-copy">
        <strong>{item.title}</strong>
        <small>{[item.releaseYear, item.kind === "series" ? "Series" : null].filter(Boolean).join(" · ")}</small>
      </span>
      {item.progress !== null && (
        <span className="progress-track"><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></span>
      )}
    </button>
  );
});

const Rail = memo(function Rail({ rail, onOpen }: { rail: CatalogRail; onOpen: (item: CatalogCard) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <section className="rail" aria-labelledby={`rail-${rail.id}`}>
      <div className="rail-heading">
        <h2 id={`rail-${rail.id}`}>{rail.title}</h2>
        {rail.reason && <span>{rail.reason}</span>}
      </div>
      <div className="rail-shell">
        <button className="rail-arrow rail-arrow-left" aria-label={`Scroll ${rail.title} left`} onClick={() => scroller.current?.scrollBy({ left: -700, behavior: "smooth" })}>‹</button>
        <div className="rail-track" ref={scroller}>
          {rail.items.map((item) => <MediaCard key={item.id} item={item} onOpen={onOpen} />)}
        </div>
        <button className="rail-arrow rail-arrow-right" aria-label={`Scroll ${rail.title} right`} onClick={() => scroller.current?.scrollBy({ left: 700, behavior: "smooth" })}>›</button>
      </div>
    </section>
  );
});

function ProfilePicker({ profiles, onChoose, onCreate }: {
  profiles: Profile[];
  onChoose: (profile: Profile) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const duration = profileEntranceDuration(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    if (duration === 0) {
      setEntering(false);
      return;
    }
    const timer = window.setTimeout(() => setEntering(false), duration);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className={`profile-screen ${entering ? "is-entering" : "is-ready"}`}>
      {entering && (
        <div className="profile-intro" aria-hidden="true">
          <span className="profile-light profile-light-left" />
          <span className="profile-light profile-light-right" />
          <LocalFlixLogo variant="intro" animated decorative />
        </div>
      )}
      <LocalFlixLogo variant="compact" className="profile-brand" />
      <section className="profile-panel" aria-hidden={entering} inert={entering}>
        <p className="eyebrow">Private cinema</p>
        <h1>Who&apos;s watching?</h1>
        <div className="profile-grid">
          {profiles.map((profile, index) => (
            <button className="profile-choice" key={profile.id} onClick={() => onChoose(profile)}>
              <span className={`profile-avatar avatar-${index % 5}`}><b>{profile.name.slice(0, 1).toUpperCase()}</b><i /></span>
              <span>{profile.name}</span>
            </button>
          ))}
          <button className="profile-choice" onClick={() => setAdding(true)}>
            <span className="profile-avatar add-avatar"><Icon name="plus" /></span>
            <span>Add profile</span>
          </button>
        </div>
        {adding && (
          <form className="profile-form" onSubmit={(event) => {
            event.preventDefault();
            void onCreate(name).then(() => { setName(""); setAdding(false); });
          }}>
            <label htmlFor="profile-name">Profile name</label>
            <input id="profile-name" autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} />
            <button type="submit" disabled={!name.trim()}>Create profile</button>
            <button type="button" onClick={() => setAdding(false)}>Cancel</button>
          </form>
        )}
      </section>
    </main>
  );
}

function SimilarCard({ item, onOpen }: {
  item: MediaDetails["similar"][number];
  onOpen: (item: CatalogCard) => void;
}) {
  return (
    <button className="similar-card" onClick={() => onOpen(item)}>
      <span
        className="similar-card-art"
        style={{ backgroundImage: `linear-gradient(0deg, rgba(5,6,8,.82), transparent 65%), url("${artworkUrl(item.id, "backdrop")}")` }}
      />
      <span className="similar-card-copy">
        <strong>{item.title}</strong>
        <small>{item.reason}</small>
      </span>
    </button>
  );
}

function DetailModal({ item, profile, onClose, onFavorite, onOpen }: {
  item: MediaDetails;
  profile: Profile;
  onClose: () => void;
  onFavorite: (favorite: boolean) => Promise<void>;
  onOpen: (item: CatalogCard) => void;
}) {
  const [favorite, setFavorite] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [preview, dispatchPreview] = useReducer(previewReducer, initialPreviewState);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const file = item.files[0];

  const startPreviewPlayback = useCallback((video: HTMLVideoElement) => {
    video.volume = 0.48;
    video.muted = previewMuted;
    void video.play()
      .then(() => {
        setSoundBlocked(false);
        dispatchPreview({ type: "ready" });
      })
      .catch(() => {
        if (previewMuted) {
          dispatchPreview({ type: "failed" });
          return;
        }
        video.muted = true;
        setPreviewMuted(true);
        setSoundBlocked(true);
        void video.play()
          .then(() => dispatchPreview({ type: "ready" }))
          .catch(() => dispatchPreview({ type: "failed" }));
      });
  }, [previewMuted]);

  const togglePreviewSound = useCallback(() => {
    const nextMuted = !previewMuted;
    const video = previewVideo.current;
    setPreviewMuted(nextMuted);
    setSoundBlocked(false);
    if (!video) return;
    video.muted = nextMuted;
    if (!nextMuted) {
      void video.play().catch(() => {
        video.muted = true;
        setPreviewMuted(true);
        setSoundBlocked(true);
      });
    }
  }, [previewMuted]);

  useEffect(() => {
    if (!file || preview.phase !== "waiting") return;
    const timer = window.setTimeout(() => dispatchPreview({ type: "idle" }), 6_000);
    return () => window.clearTimeout(timer);
  }, [file, preview.cycle, preview.phase]);

  useEffect(() => {
    let lastWaitingActivity = 0;
    const stopPreview = () => {
      const now = window.performance.now();
      if (
        preview.phase === "loading" ||
        preview.phase === "playing" ||
        now - lastWaitingActivity >= 250
      ) {
        lastWaitingActivity = now;
        dispatchPreview({ type: "activity" });
      }
    };
    window.addEventListener("pointermove", stopPreview, { passive: true });
    window.addEventListener("touchstart", stopPreview, { passive: true });
    window.addEventListener("keydown", stopPreview);
    return () => {
      window.removeEventListener("pointermove", stopPreview);
      window.removeEventListener("touchstart", stopPreview);
      window.removeEventListener("keydown", stopPreview);
    };
  }, [preview.phase]);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={item.title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="detail-modal">
        <div className="detail-backdrop" style={{ backgroundImage: `linear-gradient(0deg, #111318 2%, rgba(17,19,24,.2) 65%), url("${artworkUrl(item.id, "backdrop")}")` }}>
          {file && (preview.phase === "loading" || preview.phase === "playing") && (
            <video
              ref={previewVideo}
              key={`${file.id}-${preview.cycle}`}
              className={`detail-preview ${preview.phase === "playing" ? "is-playing" : ""}`}
              src={file.previewUrl}
              muted={previewMuted}
              playsInline
              preload="auto"
              aria-label={`Preview of ${item.title}`}
              onCanPlay={(event) => startPreviewPlayback(event.currentTarget)}
              onEnded={() => dispatchPreview({ type: "ended" })}
              onError={() => dispatchPreview({ type: "failed" })}
            />
          )}
          <button className="round-button close-button" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
          {file && (
            <button
              className={`round-button preview-sound-button ${soundBlocked ? "is-blocked" : ""}`}
              onClick={togglePreviewSound}
              aria-label={previewSoundLabel(previewMuted)}
              title={soundBlocked ? "Your browser blocked sound. Select to enable it for the next preview." : undefined}
            >
              <Icon name={previewMuted ? "mute" : "volume"} />
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {soundBlocked ? "Preview is muted because the browser blocked automatic sound." : ""}
          </span>
          <div className="detail-title-block">
            <p className="eyebrow">{item.kind === "movie" ? "Feature film" : "Series"}</p>
            <h2>{item.title}</h2>
            <div className="detail-actions">
              <a className={`primary-button ${file ? "" : "is-disabled"}`} href={file ? `/watch/${item.id}?profile=${profile.id}&file=${file.id}` : undefined}><Icon name="play" /> Play</a>
              <button className="round-button" onClick={() => {
                const next = !favorite;
                setFavorite(next);
                void onFavorite(next);
              }} aria-label={favorite ? "Remove from My List" : "Add to My List"}><Icon name={favorite ? "check" : "plus"} /></button>
              {item.similar.length > 0 && (
                <button className="secondary-button similar-button" onClick={() => setShowSimilar((visible) => !visible)}>
                  <Icon name="spark" /> More like this
                </button>
              )}
            </div>
          </div>
        </div>
        {showSimilar && item.similar.length > 0 && (
          <section className="detail-similar" aria-labelledby="detail-similar-title">
            <div className="detail-similar-heading">
              <div>
                <p className="eyebrow">From your library</p>
                <h3 id="detail-similar-title">More like this</h3>
              </div>
              <span>{item.similar.length} matches</span>
            </div>
            <div className="detail-similar-track">
              {item.similar.map((similar) => (
                <SimilarCard key={similar.id} item={similar} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
        <div className="detail-body">
          <div>
            <div className="meta-row">
              {item.releaseYear && <span>{item.releaseYear}</span>}
              {formatRuntime(item.runtimeMs) && <span>{formatRuntime(item.runtimeMs)}</span>}
              {file?.height && <span className="quality-badge">{file.height >= 2160 ? "4K" : `${file.height}p`}</span>}
              {file?.hdr && <span className="quality-badge">HDR</span>}
            </div>
            <p className="detail-overview">{item.overview}</p>
          </div>
          <dl className="detail-facts">
            <div><dt>Cast</dt><dd>{item.cast.slice(0, 6).map(({ name }) => name).join(", ") || "Not indexed"}</dd></div>
            <div><dt>Director</dt><dd>{item.directors.join(", ") || "Not indexed"}</dd></div>
            <div><dt>Genres</dt><dd>{item.genres.join(", ")}</dd></div>
          </dl>
        </div>
        {item.seasons.map((season) => (
          <section className="episode-section" key={season.id}>
            <h3>{season.title ?? `Season ${season.seasonNumber}`}</h3>
            {season.episodes.map((episode) => (
              <a className="episode-row" key={episode.id} href={episode.mediaFileId ? `/watch/${item.id}?profile=${profile.id}&file=${episode.mediaFileId}` : undefined}>
                <span>{episode.episodeNumber}</span><strong>{episode.title}</strong><Icon name="play" />
              </a>
            ))}
          </section>
        ))}
        {item.trailers[0] && <a className="trailer-link" href={item.trailers[0].youtubeUrl} target="_blank" rel="noreferrer">Watch {item.trailers[0].title} ↗</a>}
      </article>
    </div>
  );
}

export default function LocalFlixApp() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [home, setHome] = useState<HomeCatalog | null>(null);
  const [booting, setBooting] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MediaDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHome = useCallback(async (selectedProfile: Profile) => {
    setHome(await requestJson<HomeCatalog>(`/api/catalog/home?profileId=${encodeURIComponent(selectedProfile.id)}`));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<{ profiles: Profile[] }>("/api/bootstrap", { signal: controller.signal })
      .then(async ({ profiles: loadedProfiles }) => {
        setProfiles(loadedProfiles);
        const storedId = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
        const stored = loadedProfiles.find(({ id }) => id === storedId);
        if (stored) {
          setProfile(stored);
          await loadHome(stored);
        }
      })
      .finally(() => setBooting(false));
    return () => controller.abort();
  }, [loadHome]);

  useEffect(() => {
    if (!searchOpen || !query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestJson<{ results: CatalogCard[] }>(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(({ results: next }) => setResults(next))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, searchOpen]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); setSearchOpen(false); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const chooseProfile = useCallback((next: Profile) => {
    void playLoginSting();
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, next.id);
    setProfile(next);
    setHome(null);
    void loadHome(next);
  }, [loadHome]);

  const createProfile = useCallback(async (name: string) => {
    await requestJson<Profile>("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, avatar: "ocean" })
    });
    const bootstrap = await requestJson<{ profiles: Profile[] }>("/api/bootstrap");
    setProfiles(bootstrap.profiles);
  }, []);

  const openDetails = useCallback((item: CatalogCard) => {
    setDetailLoading(true);
    void requestJson<MediaDetails>(`/api/catalog/items/${encodeURIComponent(item.id)}`)
      .then(setSelected)
      .finally(() => setDetailLoading(false));
  }, []);

  const hero = home?.hero;
  const heroMeta = hero
    ? [hero.releaseYear, formatRuntime(hero.runtimeMs), hero.kind === "series" ? "Series" : null].filter(Boolean)
    : [];

  if (booting) return <main className="loading-screen"><LocalFlixLogo animated /><span /></main>;
  if (!profile) return <ProfilePicker profiles={profiles} onChoose={chooseProfile} onCreate={createProfile} />;

  return (
    <main className="app-shell">
      <header className="top-nav">
        <button className="wordmark" aria-label="Return to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><LocalFlixLogo variant="compact" decorative /></button>
        <nav aria-label="Primary navigation"><a href="#home">Home</a><a href="#movies">Movies</a><a href="#series">Series</a><a href="#my-list">My List</a><a href="/admin">Library</a></nav>
        <button className="nav-search" onClick={() => setSearchOpen(true)}><Icon name="search" /><span>Search</span></button>
        <button className="nav-profile" onClick={() => { window.localStorage.removeItem(ACTIVE_PROFILE_KEY); setProfile(null); setHome(null); }} aria-label="Switch profile"><span>{profile.name.slice(0, 1)}</span><b>{profile.name}</b></button>
      </header>

      {hero ? (
        <section id="home" className="hero" style={{ backgroundImage: `linear-gradient(90deg, #050608 0%, rgba(5,6,8,.92) 25%, rgba(5,6,8,.34) 63%, rgba(5,6,8,.12) 100%), linear-gradient(0deg, #050608 0%, rgba(5,6,8,.1) 48%, rgba(5,6,8,.2) 100%), url("${artworkUrl(hero.id, "backdrop")}")` }}>
          <div className="hero-copy">
            <p className="eyebrow">Now in your library</p>
            <h1>{hero.title}</h1>
            <div className="hero-meta">{heroMeta.map((value) => <span key={String(value)}>{value}</span>)}</div>
            <p className="hero-overview">{hero.overview}</p>
            <div className="hero-actions">
              {hero.mediaFileId && <a className="primary-button" href={`/watch/${hero.id}?profile=${profile.id}&file=${hero.mediaFileId}`}><Icon name="play" /> Play</a>}
              <button className="secondary-button" onClick={() => openDetails(hero)}><Icon name="info" /> More info</button>
            </div>
          </div>
          <div className="hero-vignette" />
        </section>
      ) : <section className="empty-hero"><strong>Your cinema is ready.</strong><p>Use Sync library to discover films and series.</p></section>}

      <div className="catalog-rails">
        {home?.rails.map((rail) => <Rail key={rail.id} rail={rail} onOpen={openDetails} />)}
      </div>

      {searchOpen && (
        <div className="search-layer" role="dialog" aria-modal="true" aria-label="Search your library">
          <div className="search-bar"><Icon name="search" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titles, people, genres, languages…" /><button onClick={() => setSearchOpen(false)}><Icon name="close" /></button></div>
          <p className="search-hint">Search only what you own. Try “Nolan”, “Science Fiction”, or “en”.</p>
          <div className="search-results">
            {results.map((item) => <MediaCard key={item.id} item={item} onOpen={(card) => { setSearchOpen(false); openDetails(card); }} />)}
            {query && searching && <p className="no-results">Searching your library…</p>}
            {query && !searching && results.length === 0 && <p className="no-results">No matching titles in your library.</p>}
          </div>
        </div>
      )}
      {detailLoading && <div className="detail-loading" aria-label="Loading title"><span /></div>}
      {selected && <DetailModal key={selected.id} item={selected} profile={profile} onOpen={openDetails} onClose={() => setSelected(null)} onFavorite={async (favorite) => {
        await requestJson(`/api/profiles/${profile.id}/favorites/${selected.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorite })
        });
        await loadHome(profile);
      }} />}
    </main>
  );
}
