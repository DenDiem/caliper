import {z} from 'zod';
import {severitySchema} from './annotation.schema';

export const reviewZoneSchema = z.object({
  ref: z.string(),
  selector: z.string().optional(),
  route: z.string().optional(),
  question: z.string(),
  severity: severitySchema.optional(),
});

export const askPayloadSchema = z.object({
  target: z.string().optional(),
  zones: z.array(reviewZoneSchema).min(1),
});

export type ReviewZone = z.infer<typeof reviewZoneSchema>;
export type AskPayload = z.infer<typeof askPayloadSchema>;
