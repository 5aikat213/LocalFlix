import {
  metadataCandidateSchema,
  metadataResultSchema,
  type MetadataCandidate,
  type MetadataProvider,
  type MetadataResult
} from "./types";

export class MetadataProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options: { code: string; retryable: boolean }) {
    super(message);
    this.name = "MetadataProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

interface OpenAiMetadataProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function outputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      canonicalTitle: { type: "string" },
      releaseYear: { type: ["integer", "null"] },
      overview: { type: "string" },
      runtimeMinutes: { type: ["integer", "null"] },
      originalLanguage: { type: ["string", "null"] },
      genres: { type: "array", items: { type: "string" } },
      collections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: ["franchise", "universe", "curated"] },
            position: { type: ["integer", "null"] },
            overview: { type: "string" }
          },
          required: ["name", "kind", "position", "overview"]
        }
      },
      directors: { type: "array", items: { type: "string" } },
      cast: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            character: { type: ["string", "null"] }
          },
          required: ["name", "character"]
        }
      },
      artwork: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["poster", "backdrop", "logo"] },
            url: { type: "string" },
            sourcePageUrl: { type: ["string", "null"] }
          },
          required: ["kind", "url", "sourcePageUrl"]
        }
      },
      trailers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            youtubeUrl: { type: "string" },
            official: { type: "boolean" }
          },
          required: ["title", "youtubeUrl", "official"]
        }
      },
      sourcePageUrls: { type: "array", items: { type: "string" } },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    },
    required: [
      "canonicalTitle",
      "releaseYear",
      "overview",
      "runtimeMinutes",
      "originalLanguage",
      "genres",
      "collections",
      "directors",
      "cast",
      "artwork",
      "trailers",
      "sourcePageUrls",
      "confidence"
    ]
  };
}

function collectImageUrls(value: unknown, destination: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectImageUrls(entry, destination);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      ["image_url", "imageUrl", "thumbnail_url", "thumbnailUrl"].includes(key) &&
      typeof entry === "string" &&
      /^https:\/\//.test(entry)
    ) {
      destination.add(entry);
    }
    collectImageUrls(entry, destination);
  }
}

function errorDetails(value: unknown): { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return { code: "openai_error", message: "OpenAI metadata request failed" };
  }
  const root = value as { error?: { code?: unknown; message?: unknown } };
  return {
    code: typeof root.error?.code === "string" ? root.error.code : "openai_error",
    message:
      typeof root.error?.message === "string"
        ? root.error.message
        : "OpenAI metadata request failed"
  };
}

export class OpenAiMetadataProvider implements MetadataProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiMetadataProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.6-luna";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async enrich(candidateInput: MetadataCandidate, signal?: AbortSignal): Promise<MetadataResult> {
    const candidate = metadataCandidateSchema.parse(candidateInput);
    const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search",
            search_content_types: ["image", "text"],
            search_context_size: "medium",
            image_settings: { max_results: 6, caption: true }
          }
        ],
        include: ["web_search_call.results"],
        input: [
          {
            role: "system",
            content:
              "Identify the exact film or series using title and year. Use web search. Never invent URLs. Return only direct artwork URLs present in image-search results. Prefer an official studio YouTube trailer. Add a collection only for a recognized direct franchise, film series, or cinematic universe; never group titles merely for shared words, genre, cast, or director. Return empty arrays when evidence is unavailable."
          },
          {
            role: "user",
            content: `Enrich ${candidate.kind}: title=${candidate.title}; year=${candidate.year ?? "unknown"}`
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "localflix_metadata",
            strict: true,
            schema: outputSchema()
          }
        }
      }),
      signal
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const details = errorDetails(body);
      throw new MetadataProviderError(details.message, {
        code: details.code,
        retryable:
          response.status === 429 ||
          response.status >= 500 ||
          ["insufficient_quota", "rate_limit_exceeded"].includes(details.code)
      });
    }
    const root = body as { output?: unknown[] };
    const output = Array.isArray(root.output) ? root.output : [];
    const searchCalls = output.filter(
      (entry) => typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "web_search_call"
    );
    const approvedImageUrls = new Set<string>();
    collectImageUrls(searchCalls, approvedImageUrls);
    const text = output
      .flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const content = (entry as { content?: unknown }).content;
        return Array.isArray(content) ? content : [];
      })
      .find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { type?: string }).type === "output_text"
      ) as { text?: unknown } | undefined;
    if (typeof text?.text !== "string") {
      throw new MetadataProviderError("OpenAI returned no structured metadata", {
        code: "missing_output",
        retryable: true
      });
    }
    const parsed = metadataResultSchema.parse(JSON.parse(text.text) as unknown);
    return {
      ...parsed,
      artwork: parsed.artwork.filter((candidateArtwork) =>
        approvedImageUrls.has(candidateArtwork.url)
      )
    };
  }
}
