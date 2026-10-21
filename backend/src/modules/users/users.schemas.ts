import { z } from 'zod';

const imageUrlSchema = z.string().url().refine(value => /^https?:\/\//i.test(value), 'Ảnh phải dùng địa chỉ HTTP hoặc HTTPS');

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().uuid()
  })
});

export const authorIdParamSchema = z.object({
  params: z.object({
    authorId: z.string().uuid()
  })
});

export const updateProfileSchema = z.object({
  body: z.object({
    displayName: z.string().min(1).max(100).optional(),
    bannerUrl: imageUrlSchema.nullable().optional(),
    publishingSchedule: z.string().trim().max(500).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    avatarUrl: imageUrlSchema.nullable().optional()
  })
});

export const updateSettingsSchema = z.object({
  body: z.object({
    language: z.string().min(2).max(10).optional(),
    notificationEnabled: z.boolean().optional()
  })
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>['body'];
