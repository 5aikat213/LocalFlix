import { describe, expect, it } from "vitest";
import { srtToWebVtt } from "./subtitle-conversion";

describe("subtitle conversion", () => {
  it("converts SRT timestamps and removes a byte-order mark", () => {
    expect(
      srtToWebVtt("\uFEFF1\r\n00:00:01,250 --> 00:00:03,000\r\nHello\r\n")
    ).toBe("WEBVTT\n\n1\n00:00:01.250 --> 00:00:03.000\nHello\n");
  });

  it("does not duplicate a valid WebVTT header", () => {
    expect(srtToWebVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n")).toBe(
      "WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n"
    );
  });
});
