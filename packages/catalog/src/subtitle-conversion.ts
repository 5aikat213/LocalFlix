export function srtToWebVtt(input: string): string {
  const normalized = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trimEnd();
  if (normalized.startsWith("WEBVTT")) return `${normalized}\n`;
  return `WEBVTT\n\n${normalized}\n`;
}
