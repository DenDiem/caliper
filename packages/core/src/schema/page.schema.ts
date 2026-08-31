import {z} from 'zod';

// Shared by a mark and a trace, and kept in its own module because both schema files import it: the
// annotation schema needs the trace schema for `traces`, so a page schema living in either of them
// would close an import cycle and leave one side reading it before initialisation.
export const pageSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({width: z.number(), height: z.number(), dpr: z.number()}),
});

export type Page = z.infer<typeof pageSchema>;
