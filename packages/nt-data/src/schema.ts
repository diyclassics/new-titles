import { z } from 'zod';

export const PlaceSourceSchema = z.enum(['pleiades', 'getty-tgn', 'manual']);
export type PlaceSource = z.infer<typeof PlaceSourceSchema>;

export const PlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  source: PlaceSourceSchema,
});
export type Place = z.infer<typeof PlaceSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const AcquisitionSchema = z.object({
  id: z.string().min(1),
  barcode: z.string().optional(),
  mms_id: z.string().optional(),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  publisher: z.string().optional(),
  pub_date: z.string().optional(),
  pub_place: z.string().optional(),
  call_number: z.string().optional(),
  acquired_at: IsoDate,
  subject_headings: z.array(z.string()).default([]),
  place_refs: z.array(z.string()).default([]),
  places: z.array(PlaceSchema).default([]),
  summary: z.string().optional(),
  region: z.string().optional(),
  region_confidence: z.number().min(0).max(1).optional(),
});
export type Acquisition = z.infer<typeof AcquisitionSchema>;

export const AcquisitionsFileSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  records: z.array(AcquisitionSchema),
});
export type AcquisitionsFile = z.infer<typeof AcquisitionsFileSchema>;

export const GazetteerEntrySchema = PlaceSchema.extend({
  aliases: z.array(z.string()).default([]),
  citation: z.string().optional(),
});
export type GazetteerEntry = z.infer<typeof GazetteerEntrySchema>;
