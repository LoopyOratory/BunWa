import { MiddlewareHandler } from 'hono';
import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const parsed = schema.parse(body);
      c.set('validatedBody', parsed);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({
          statusCode: 400,
          message: 'Validation failed',
          errors: error.issues,
        }, 400);
      }
      throw error;
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const query = Object.fromEntries(new URL(c.req.url).searchParams);
      const parsed = schema.parse(query);
      c.set('validatedQuery', parsed);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({
          statusCode: 400,
          message: 'Validation failed',
          errors: error.issues,
        }, 400);
      }
      throw error;
    }
  };
}
