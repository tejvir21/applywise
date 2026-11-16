/** Discovery (live search) request validation schema. */

import { z } from 'zod';

export const discoverySearchQuerySchema = z.object({
  query: z.object({
    // One or more role queries (comma-separated). `q` is a single-query alias.
    roles: z.string().optional(),
    q: z.string().optional(),
    location: z.string().max(100).optional(),
    countryIso: z.string().length(2).optional(),
    includeRemote: z.enum(['true', 'false']).optional(),
    includeWorldwideRemote: z.enum(['true', 'false']).optional(),
    freshness: z.enum(['any', 'last7', 'last14', 'last30']).optional(),
    sort: z.enum(['relevance', 'newest']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export type DiscoverySearchQuery = z.infer<typeof discoverySearchQuerySchema.shape.query>;
