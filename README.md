# LocalFlix

### Your library. Your screen. Your rules.

LocalFlix turns movie and TV folders into a polished, private streaming experience for your home. Point it at your library and browse rich artwork, collections, recommendations, profiles, subtitles, and watch progress from a cinematic web interface.

No subscription. No remote media server. Your videos stay on your machine.

## Highlights

- Cinematic browsing with artwork, trailers, genres, cast, and directors
- Movies, seasons, episodes, external drives, and multiple library folders
- Personal profiles with watch progress, favorites, and continue watching
- Franchise collections and smart “More like this” recommendations
- Muted scene previews generated on demand from your local videos
- Subtitles, responsive playback, keyboard controls, and fullscreen
- Localhost by default, with an optional trusted home-network mode

## Quick start

### Requirements

- Node.js 22+
- npm 11+
- `ffmpeg` and `ffprobe` available on `PATH`

### Install and run

```bash
npm install
npm run index
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Choose your library folders

Edit `localflix.config.json` and add one or more movie and series locations:

```json
{
  "movieDirectories": [
    "/path/to/Movies",
    "/Volumes/Media/Movies"
  ],
  "seriesDirectories": [
    "/path/to/Series",
    "/Volumes/Media/Series"
  ]
}
```

Run `npm run index` after changing folders. LocalFlix keeps unavailable external-drive titles indexed and restores them after the drive returns.

## Useful commands

```bash
npm run dev               # Start locally
npm run dev:lan           # Start on a trusted home network
npm run sync              # Discover library changes
npm run index             # Sync and finish queued indexing work
npm run refresh-metadata  # Refresh title metadata and artwork
```

Library status and manual sync controls are available at [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin).

## Privacy

LocalFlix is designed for personal use on a trusted machine or private home network. Media files are streamed directly from your computer and are not uploaded. Optional online metadata enrichment makes network requests only when you enable it.

Watch history, profiles, cached artwork, and library data remain local and can be rebuilt from your media folders.
