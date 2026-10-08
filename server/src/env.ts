import 'dotenv/config';
import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(?:ql)?:\/\//.test(value), 'Use uma conexão Postgres.'),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    SUPABASE_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
    SUPABASE_S3_REGION: optionalText,
    SUPABASE_S3_ACCESS_KEY_ID: optionalText,
    SUPABASE_S3_SECRET_ACCESS_KEY: optionalText,
    SUPABASE_STORAGE_BUCKET: optionalText,
  })
  .superRefine((config, context) => {
    const supabaseKeys = [
      'SUPABASE_URL',
      'SUPABASE_S3_REGION',
      'SUPABASE_S3_ACCESS_KEY_ID',
      'SUPABASE_S3_SECRET_ACCESS_KEY',
      'SUPABASE_STORAGE_BUCKET',
    ] as const;
    if (supabaseKeys.some((key) => config[key]) && !supabaseKeys.every((key) => config[key])) {
      context.addIssue({
        code: 'custom',
        message: 'Preencha todas as cinco variáveis SUPABASE_ para habilitar o Storage.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

// A configuração só é lida ao iniciar a aplicação, permitindo testes sem segredos.
export function readEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Variáveis de ambiente inválidas: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
