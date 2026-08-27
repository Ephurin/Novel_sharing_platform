import { z } from 'zod';

export const listNotificationsSchema = z.object({
  query: z.object({
    status: z.enum(['READ', 'UNREAD']).optional(),
    type: z.string().max(80).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const notificationIdParamSchema = z.object({
  params: z.object({
    notificationId: z.string().min(1)
  })
});

export const deviceTokenSchema = z.object({
  body: z.object({
    provider: z.enum(['FCM', 'APNS', 'WEB_PUSH']),
    deviceToken: z.string().min(10).max(4096),
    platform: z.enum(['ANDROID', 'IOS', 'WEB']).default('WEB')
  })
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>['query'];
export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>['body'];
