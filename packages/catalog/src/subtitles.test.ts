import { describe, expect, it } from "vitest";
import { scoreSubtitle } from "./subtitles";

describe("subtitle matching", () => {
  it("strongly matches the same movie basename and extracts language", () => {
    expect(
      scoreSubtitle(
        { kind: "movie", title: "Interstellar", year: 2014 },
        "Subs/Interstellar.2014.eng.srt"
      )
    ).toMatchObject({ accepted: true, language: "en" });
  });

  it("rejects a subtitle for a different episode", () => {
    expect(
      scoreSubtitle(
        { kind: "episode", seriesTitle: "Dark", season: 1, episode: 2 },
        "Dark.S01E03.English.srt"
      )
    ).toMatchObject({ accepted: false });
  });
});
