import { z } from "zod";

export const metadataCandidateSchema = z.object({
  kind: z.enum(["movie", "series"]),
  title: z.string().min(1),
  year: z.number().int().min(1880).max(2200).nullable()
});

export const castMemberSchema = z.object({
  name: z.string().min(1),
  character: z.string().min(1).nullable().optional()
});

export const artworkCandidateSchema = z.object({
  kind: z.enum(["poster", "backdrop", "logo"]),
  url: z.url(),
  sourcePageUrl: z.url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional()
});

export const trailerCandidateSchema = z.object({
  title: z.string().min(1),
  youtubeUrl: z.url(),
  official: z.boolean()
});

export const collectionMembershipSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["franchise", "universe", "curated"]),
  position: z.number().int().positive().nullable(),
  overview: z.string()
});

export const metadataResultSchema = z.object({
  canonicalTitle: z.string().min(1),
  releaseYear: z.number().int().min(1880).max(2200).nullable(),
  overview: z.string(),
  runtimeMinutes: z.number().int().positive().nullable(),
  originalLanguage: z.string().min(2).nullable(),
  genres: z.array(z.string().min(1)),
  collections: z.array(collectionMembershipSchema).default([]),
  directors: z.array(z.string().min(1)),
  cast: z.array(castMemberSchema),
  artwork: z.array(artworkCandidateSchema),
  trailers: z.array(trailerCandidateSchema),
  sourcePageUrls: z.array(z.url()),
  confidence: z.number().min(0).max(1)
});

export const curatedMetadataEntrySchema = metadataResultSchema
  .omit({ confidence: true })
  .extend({
    kind: z.enum(["movie", "series"]),
    aliases: z.array(z.string().min(1)).default([])
  });

export type MetadataCandidate = z.infer<typeof metadataCandidateSchema>;
export type MetadataResult = z.infer<typeof metadataResultSchema>;
export type CuratedMetadataEntry = z.infer<typeof curatedMetadataEntrySchema>;
export type CollectionMembership = z.infer<typeof collectionMembershipSchema>;

export interface MetadataProvider {
  enrich(candidate: MetadataCandidate, signal?: AbortSignal): Promise<MetadataResult>;
}
