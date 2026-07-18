import { describe, expect, it } from "vitest";
import { parseEpisodeCandidate, parseMovieCandidate } from "./release-parser";

describe("release parsing", () => {
  it.each([
    ["Bullet.Train.2022.1080p.WEBRip.x264.mkv", "Bullet Train", 2022],
    ["Midsommar.2019.Directors.Cut.1080p.HDRip.mkv", "Midsommar", 2019],
    ["The_Day_After_1983.avi", "The Day After", 1983],
    ["Reservoir Dogs.1992.BluRay.1080p.x264.YIFY.mp4", "Reservoir Dogs", 1992]
  ])("parses movie release %s", (name, title, year) => {
    expect(parseMovieCandidate(name)).toMatchObject({ title, year });
  });

  it("keeps a readable title when the year is absent", () => {
    expect(parseMovieCandidate("Oldboy.1080p.BluRay.x264.mkv")).toMatchObject({
      title: "Oldboy",
      year: null,
      confidence: 0.55
    });
  });

  it.each([
    ["Show.Name.S02E04.1080p.mkv", "Show Name", 2, 4],
    ["Show Name - 2x04 - The Return.mp4", "Show Name", 2, 4],
    ["My Show/Season 03/Episode 07.mkv", "My Show", 3, 7]
  ])("parses episode release %s", (name, seriesTitle, season, episode) => {
    expect(parseEpisodeCandidate(name)).toMatchObject({
      seriesTitle,
      season,
      episode
    });
  });

  it("returns null when an episode identity is not present", () => {
    expect(parseEpisodeCandidate("Interstellar.2014.mkv")).toBeNull();
  });
});
