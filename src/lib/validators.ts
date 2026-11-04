import { z } from 'zod';

/**
 * Shared validation schemas for student login and creation.
 * Imported by both the client form (for client-side hints) and server route.
 */

export const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Login ID must be at least 3 characters')
  .max(30, 'Login ID must be at most 30 characters')
  .regex(/^\S+$/, 'Login ID cannot contain spaces');

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

export const studentLoginSchema = z.object({
  loginId: loginIdSchema,
  pin: pinSchema,
});

export type StudentLoginInput = z.infer<typeof studentLoginSchema>;

/** Shared schema for starting a test. Used by both dashboard client and /api/test/start route. */
export const startTestSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export type StartTestInput = z.infer<typeof startTestSchema>;
