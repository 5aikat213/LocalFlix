import { normalizeCatalogText } from "../release-parser";
import {
  curatedMetadataEntrySchema,
  metadataCandidateSchema,
  type CuratedMetadataEntry,
  type MetadataCandidate,
  type MetadataProvider,
  type MetadataResult
} from "./types";

export class CuratedMetadataProvider implements MetadataProvider {
  private readonly entries: CuratedMetadataEntry[];

  constructor(entries: unknown[]) {
    this.entries = entries.map((entry) => curatedMetadataEntrySchema.parse(entry));
  }

  async enrich(candidateInput: MetadataCandidate): Promise<MetadataResult> {
    const candidate = metadataCandidateSchema.parse(candidateInput);
    const title = normalizeCatalogText(candidate.title);
    const match = this.entries.find((entry) => {
      if (entry.kind !== candidate.kind) return false;
      if (candidate.year !== null && entry.releaseYear !== candidate.year) return false;
      const names = [entry.canonicalTitle, ...entry.aliases].map(normalizeCatalogText);
      return names.includes(title);
    });
    if (!match) {
      throw new Error(
        `No curated ${candidate.kind} match for ${candidate.title} (${candidate.year ?? "unknown year"})`
      );
    }
    const { aliases: _aliases, kind: _kind, ...metadata } = match;
    return { ...metadata, confidence: 1 };
  }
}

