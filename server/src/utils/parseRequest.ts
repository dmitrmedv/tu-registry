import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from './ApiError';

type Part = 'body' | 'params' | 'query';
type Schemas = Partial<Record<Part, z.ZodType>>;
type Parsed<S extends Schemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

/**
 * Validates request parts against Zod schemas and returns typed, sanitized data.
 * Called at the top of a controller so the inferred types flow into the service.
 */
export function parseRequest<S extends Schemas>(req: Request, schemas: S): Parsed<S> {
  const result: Record<string, unknown> = {};
  for (const part of Object.keys(schemas) as Part[]) {
    const parsed = schemas[part]!.safeParse(req[part] ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Некоректні дані', z.flattenError(parsed.error));
    }
    result[part] = parsed.data;
  }
  return result as Parsed<S>;
}

export const idParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});
