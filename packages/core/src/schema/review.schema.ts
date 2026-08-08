import {z} from 'zod';
import {severitySchema} from './annotation.schema';

export const reviewZoneSchema = z.object({
  ref: z.string(),
  selector: z.string().optional(),
  route: z.string().optional(),
  question: z.string(),
  severity: severitySchema.optional(),
  // JS to run in the page before navigating to this zone's route, to bring the app into a state where
  // a route guard passes (dispatch the store action / seed the flag it checks) — never a bypass. It is
  // agent-authored code executed same-origin in the developer's browser, so the client gates it behind
  // an explicit run/skip consent step and never auto-runs it.
  setup: z.string().optional(),
});

export const askPayloadSchema = z.object({
  target: z.string().optional(),
  zones: z.array(reviewZoneSchema).min(1),
});

export type ReviewZone = z.infer<typeof reviewZoneSchema>;
export type AskPayload = z.infer<typeof askPayloadSchema>;
