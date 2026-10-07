import { z } from 'zod';

export const shortCodeSchema = z
  .string()
  .trim()
  .min(1, 'Informe o encurtamento.')
  .max(60, 'Use no máximo 60 caracteres.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens entre palavras.');

export const originalUrlSchema = z
  .string()
  .trim()
  .max(2048, 'A URL deve ter no máximo 2048 caracteres.')
  .pipe(z.url({ message: 'Informe uma URL válida com http:// ou https://.' }))
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use uma URL http:// ou https:// sem credenciais.');

export const createLinkSchema = z.object({
  originalUrl: originalUrlSchema,
  shortCode: shortCodeSchema,
});
export const idParamsSchema = z.object({ id: z.uuid() });
export const codeParamsSchema = z.object({ shortCode: shortCodeSchema });
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
