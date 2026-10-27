import { z } from 'zod';
import { LIMITS, REACTIONS } from '../limits';
import { attachmentSchema, idSchema, optionalUrl, trimmed } from './common';

export const pollInputSchema = z.object({
  options: z.array(trimmed(100, 1)).min(LIMITS.pollOptions.min).max(LIMITS.pollOptions.max),
  multiple: z.boolean().default(false),
  /** Hours until voting closes; omit for an open poll. */
  durationHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional(),
});

export const createPostSchema = z
  .object({
    text: trimmed(LIMITS.postText).default(''),
    imageUrl: optionalUrl,
    groupId: idSchema.optional().nullable(),
    poll: pollInputSchema.optional(),
    /** Re-share an existing post (Facebook-style share with optional comment in `text`). */
    sharedPostId: idSchema.optional().nullable(),
  })
  .refine((v) => v.text.length > 0 || !!v.imageUrl || !!v.poll || !!v.sharedPostId, { message: 'empty_post' });
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({ text: trimmed(LIMITS.postText, 1) });
export const reactSchema = z.object({ reaction: z.enum(REACTIONS).nullable() });
export const commentSchema = z.object({ text: trimmed(LIMITS.commentText, 1) });

export const startDirectSchema = z.object({ userId: idSchema });
export const sendMessageSchema = z
  .object({
    text: trimmed(LIMITS.messageText).default(''),
    attachment: attachmentSchema.optional().nullable(),
    replyToId: idSchema.optional().nullable(),
    clientId: z.string().max(64).optional(),
  })
  .refine((v) => v.text.length > 0 || !!v.attachment, { message: 'empty_message' });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export const editMessageSchema = z.object({ text: trimmed(LIMITS.messageText, 1) });
export const messageReactionSchema = z.object({ emoji: z.string().min(1).max(16) });

export const createGroupSchema = z.object({
  kind: z.enum(['group', 'community']).default('group'),
  name: trimmed(LIMITS.groupName.max, LIMITS.groupName.min),
  description: trimmed(LIMITS.groupDescription).default(''),
  privacy: z.enum(['public', 'private']).default('public'),
  avatarUrl: optionalUrl,
  coverUrl: optionalUrl,
  tags: z.array(trimmed(30, 1)).max(8).default([]),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export const updateGroupSchema = createGroupSchema.partial().omit({ kind: true });
export const joinRequestSchema = z.object({ message: trimmed(300).optional() });
export const memberRoleSchema = z.object({ role: z.enum(['admin', 'teacher', 'member']) });
export const groupResourceSchema = z.object({
  title: trimmed(200, 1),
  url: z.string().trim().max(2048).min(1),
  kind: z.enum(['file', 'link']),
  mime: trimmed(120).optional().nullable(),
  size: z.number().int().min(0).optional().nullable(),
});
export const channelSchema = z.object({
  name: trimmed(60, 1),
  kind: z.enum(['text', 'announcement']).default('text'),
});

export const pollVoteSchema = z.object({ optionIds: z.array(idSchema).min(1).max(LIMITS.pollOptions.max) });
