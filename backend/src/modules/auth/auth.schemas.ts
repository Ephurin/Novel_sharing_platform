import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email().max(255),
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: passwordSchema
  })
});

export const registrationIdSchema = z.string().uuid();

export const resendRegistrationSchema = z.object({
  body: z.object({ registrationId: registrationIdSchema })
});

export const verifyRegistrationSchema = z.object({
  body: z.object({
    registrationId: registrationIdSchema,
    code: z.string().regex(/^\d{8}$/)
  })
});

export const verifyRegistrationLinkSchema = z.object({
  body: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1)
  })
});

export const googleLoginSchema = z.object({
  body: z.object({
    credential: z.string().min(1).max(16384),
    password: z.string().min(1).max(1024).optional()
  })
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema
  })
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
