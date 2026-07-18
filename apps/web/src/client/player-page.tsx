"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatPlayerTime,
  keyboardPlayerAction,
  mergeReadySubtitleTracks,
  nextSubtitleSelection,
  progressPercent,
  shouldHandlePlayerShortcut,
  SUBTITLE_SIZE_OPTIONS,
  subtitleSizeClass
} from "./player-model";
import type { SubtitleSize } from "./player-model";
import type { MediaDetails, SubtitleTrack } from "./types";

interface PlaybackInfo {
  mode: "direct" | "hls";
  status: "ready" | "pending";
  url: string | null;
  reason: string;
}

function PlayerIcon({ name }: { name: "play" | "pause" | "back" | "forward" | "volume" | "muted" | "fullscreen" | "captions" | "arrow" }) {
  const path = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    back: <><path d="M9 7 5 11l4 4" /><path d="M5 11h8a5 5 0 0 1 5 5" /></>,
    forward: <><path d="m15 7 4 4-4 4" /><path d="M19 11h-8a5 5 0 0 0-5 5" /></>,
    volume: <><path d="M5 10v4h3l4 4V6l-4 4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
    muted: <><path d="M5 10v4h3l4 4V6l-4 4zM16 10l5 5M21 10l-5 5" /></>,
    fullscreen: <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />,
    captions: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 10a3 3 0 1 0 0 4M17 10a3 3 0 1 0 0 4" /></>,
    arrow: <path d="m15 18-6-6 6-6" />
  } as const;
  return <svg aria-hidden="true" viewBox="0 0 24 24">{path[name]}</svg>;
}

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Playback request failed (${response.status})`);
  return (await response.json()) as T;
}

export default function PlayerPage({ itemId, profileId, fileId }: { itemId: string; profileId: string; fileId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeMsRef = useRef(0);
  const lastCheckpointRef = useRef(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleSelectionTouchedRef = useRef(false);
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [readySubtitles, setReadySubtitles] = useState<SubtitleTrack[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [selectedSubtitleId, setSelectedSubtitleId] = useState("off");
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>("medium");
  const [captionMenuOpen, setCaptionMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const file = details?.files.find(({ id }) => id === fileId) ?? null;
  const nextEpisode = useMemo(() => {
    const episodes = details?.seasons.flatMap((season) => season.episodes) ?? [];
    const currentIndex = episodes.findIndex((episode) => episode.mediaFileId === fileId);
    return currentIndex >= 0 ? episodes[currentIndex + 1] ?? null : null;
  }, [details, fileId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      json<MediaDetails>(`/api/catalog/items/${encodeURIComponent(itemId)}`, { signal: controller.signal }),
      json<{ positionMs: number }>(`/api/profiles/${encodeURIComponent(profileId)}/progress/${encodeURIComponent(fileId)}`, { signal: controller.signal })
    ]).then(([loadedDetails, progress]) => {
      setDetails(loadedDetails);
      resumeMsRef.current = progress.positionMs;
    }).catch((caught: unknown) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : String(caught));
    });
    return () => controller.abort();
  }, [fileId, itemId, profileId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const info = await json<PlaybackInfo>(`/api/playback/${encodeURIComponent(fileId)}`);
        if (cancelled) return;
        setPlayback(info);
        if (info.status === "pending") timer = setTimeout(load, 1500);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [fileId]);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let cancelled = false;
    setReadySubtitles([]);
    setSelectedSubtitleId("off");
    subtitleSelectionTouchedRef.current = false;
    if (file.subtitles.length === 0) {
      setSubtitleStatus("idle");
      return () => controller.abort();
    }
    setSubtitleStatus("loading");
    const waitForTrack = async (track: SubtitleTrack): Promise<SubtitleTrack | null> => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(track.url, { signal: controller.signal });
          if (response.status === 200 && response.headers.get("content-type")?.includes("text/vtt")) return track;
          if (response.status !== 202) return null;
        } catch (caught) {
          if (controller.signal.aborted) return null;
          if (attempt === 7) return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      return null;
    };
    const sourceOrder = file.subtitles.map(({ id }) => id);
    void Promise.all(file.subtitles.map(async (track) => {
      const available = await waitForTrack(track);
      if (!available || cancelled) return null;
      setReadySubtitles((current) => mergeReadySubtitleTracks(current, available, sourceOrder));
      setSelectedSubtitleId((current) => nextSubtitleSelection(
        current,
        available,
        subtitleSelectionTouchedRef.current
      ));
      return available;
    })).then((tracks) => {
      if (cancelled) return;
      const available = tracks.filter((track): track is SubtitleTrack => track !== null);
      setSubtitleStatus(available.length > 0 ? "ready" : "unavailable");
    });
    return () => { cancelled = true; controller.abort(); };
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const trackElements = Array.from(video.querySelectorAll<HTMLTrackElement>("track[data-track-id]"));
    trackElements.forEach((element) => {
      element.track.mode = element.dataset.trackId === selectedSubtitleId ? "showing" : "disabled";
    });
  }, [readySubtitles, selectedSubtitleId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playback?.status !== "ready" || !playback.url) return;
    let cancelled = false;
    let hls: { destroy(): void } | null = null;
    if (playback.mode === "direct" || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playback.url;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError("This browser cannot play the generated HLS stream.");
          return;
        }
        const instance = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls = instance;
        instance.loadSource(playback.url!);
        instance.attachMedia(video);
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setError(`Playback failed: ${data.details}`);
        });
      });
    }
    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [playback]);

  const saveProgress = useCallback((completed = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    void fetch(`/api/profiles/${encodeURIComponent(profileId)}/progress/${encodeURIComponent(fileId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionMs: video.currentTime * 1000, durationMs: video.duration * 1000, completed }),
      keepalive: true
    });
  }, [fileId, profileId]);

  useEffect(() => {
    const persist = () => saveProgress(false);
    window.addEventListener("pagehide", persist);
    return () => { window.removeEventListener("pagehide", persist); saveProgress(false); };
  }, [saveProgress]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        setPlaying(false);
        setControlsVisible(true);
      });
    }
    else video.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (rootRef.current) void rootRef.current.requestFullscreen();
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && captionMenuOpen) {
        event.preventDefault();
        setCaptionMenuOpen(false);
        return;
      }
      if (event.target instanceof HTMLElement && !shouldHandlePlayerShortcut(event.target.tagName)) return;
      const action = keyboardPlayerAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === "toggle") togglePlayback();
      if (action === "backward") seekBy(-10);
      if (action === "forward") seekBy(10);
      if (action === "fullscreen") toggleFullscreen();
      if (action === "mute" && videoRef.current) videoRef.current.muted = !videoRef.current.muted;
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [captionMenuOpen, seekBy, toggleFullscreen, togglePlayback]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (playing && !captionMenuOpen) controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2600);
  }, [captionMenuOpen, playing]);

  useEffect(() => {
    if (!captionMenuOpen) return;
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, [captionMenuOpen]);

  if (error) return <main className="player-error"><strong>Couldn&apos;t play this title.</strong><p>{error}</p><a href="/">Return to LocalFlix</a></main>;

  return (
    <main
      className={`player-shell ${controlsVisible ? "controls-visible" : "controls-hidden"} ${subtitleSizeClass(subtitleSize)}`}
      ref={rootRef}
      onPointerMove={revealControls}
      onClick={revealControls}
    >
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlayback}
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); saveProgress(false); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          if (resumeMsRef.current > 0 && resumeMsRef.current / 1000 < video.duration * .95) {
            video.currentTime = resumeMsRef.current / 1000;
          }
        }}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          setCurrent(next);
          if (Math.abs(next - lastCheckpointRef.current) >= 10) {
            lastCheckpointRef.current = next;
            saveProgress(false);
          }
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onEnded={() => { setPlaying(false); saveProgress(true); }}
      >
        {readySubtitles.map((track) => (
          <track
            key={track.id}
            data-track-id={track.id}
            kind="subtitles"
            src={track.url}
            srcLang={track.language ?? "und"}
            label={track.label}
          />
        ))}
      </video>

      <div className="player-topbar">
        <a href="/" className="player-icon-button" aria-label="Back to LocalFlix"><PlayerIcon name="arrow" /></a>
        <div><strong>{details?.title ?? "Loading title…"}</strong><span>{file?.height ? `${file.height >= 2160 ? "4K" : `${file.height}p`}${file.hdr ? " · HDR" : ""}` : ""}</span></div>
      </div>

      {(!playback || playback.status === "pending") && (
        <div className="player-preparing"><span /><strong>Preparing this title for your browser</strong><p>The cached stream will be reused next time.</p></div>
      )}
      {buffering && playback?.status === "ready" && <div className="player-spinner" />}
      {!playing && playback?.status === "ready" && (
        <button className="player-center-play" onClick={togglePlayback} aria-label="Play"><PlayerIcon name="play" /></button>
      )}

      <div className="player-controls">
        <input
          className="player-progress"
          aria-label="Seek"
          type="range"
          min="0"
          max={duration || 0}
          step=".1"
          value={Math.min(current, duration || 0)}
          style={{ "--played": `${progressPercent(current, duration)}%` } as React.CSSProperties}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = value;
            setCurrent(value);
          }}
        />
        <div className="player-control-row">
          <button onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}><PlayerIcon name={playing ? "pause" : "play"} /></button>
          <button onClick={() => seekBy(-10)} aria-label="Back 10 seconds"><PlayerIcon name="back" /><small>10</small></button>
          <button onClick={() => seekBy(10)} aria-label="Forward 10 seconds"><PlayerIcon name="forward" /><small>10</small></button>
          <button onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} aria-label={muted ? "Unmute" : "Mute"}><PlayerIcon name={muted ? "muted" : "volume"} /></button>
          <input className="volume-slider" aria-label="Volume" type="range" min="0" max="1" step=".05" value={muted ? 0 : volume} onChange={(event) => {
            const value = Number(event.target.value);
            if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; }
          }} />
          <span className="player-time">{formatPlayerTime(current)} / {formatPlayerTime(duration)}</span>
          <div className="player-spacer" />
          {nextEpisode?.mediaFileId && <a className="next-episode" href={`/watch/${itemId}?profile=${profileId}&file=${nextEpisode.mediaFileId}`}>Next episode <strong>{nextEpisode.title}</strong></a>}
          {(file?.subtitles.length ?? 0) > 0 && (
            <div className="subtitle-control">
              <button
                className={`caption-button ${selectedSubtitleId !== "off" ? "is-active" : ""}`}
                onClick={() => setCaptionMenuOpen((open) => !open)}
                aria-label="Subtitles and caption size"
                aria-expanded={captionMenuOpen}
                aria-haspopup="dialog"
              >
                <PlayerIcon name="captions" />
              </button>
              {captionMenuOpen && (
                <section className="subtitle-menu" role="dialog" aria-label="Subtitle settings">
                  <div className="subtitle-menu-heading">
                    <strong>Subtitles</strong>
                    {subtitleStatus === "loading" && <span>Preparing…</span>}
                  </div>
                  <div className="subtitle-track-options" role="radiogroup" aria-label="Subtitle track">
                    <button
                      role="radio"
                      aria-checked={selectedSubtitleId === "off"}
                      className={selectedSubtitleId === "off" ? "is-selected" : ""}
                      onClick={() => {
                        subtitleSelectionTouchedRef.current = true;
                        setSelectedSubtitleId("off");
                      }}
                    >
                      Off
                    </button>
                    {readySubtitles.map((track) => (
                      <button
                        key={track.id}
                        role="radio"
                        aria-checked={selectedSubtitleId === track.id}
                        className={selectedSubtitleId === track.id ? "is-selected" : ""}
                        onClick={() => {
                          subtitleSelectionTouchedRef.current = true;
                          setSelectedSubtitleId(track.id);
                        }}
                      >
                        <span>{track.label}</span>
                        {track.forced && <small>Forced</small>}
                      </button>
                    ))}
                    {subtitleStatus === "unavailable" && <p>No compatible subtitle track is available.</p>}
                  </div>
                  <div className="subtitle-size-setting">
                    <strong>Text size</strong>
                    <div role="radiogroup" aria-label="Subtitle size">
                      {SUBTITLE_SIZE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          role="radio"
                          aria-checked={subtitleSize === option.value}
                          className={subtitleSize === option.value ? "is-selected" : ""}
                          onClick={() => setSubtitleSize(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
          <button onClick={toggleFullscreen} aria-label="Fullscreen"><PlayerIcon name="fullscreen" /></button>
        </div>
      </div>
    </main>
  );
}
