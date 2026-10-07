import type { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Env } from '../env.js';

export interface CsvStorage {
  upload(key: string, body: Readable): Promise<string>;
}

export function createR2Storage(env: Env): CsvStorage | undefined {
  if (
    !env.CLOUDFLARE_ACCOUNT_ID ||
    !env.CLOUDFLARE_ACCESS_KEY_ID ||
    !env.CLOUDFLARE_SECRET_ACCESS_KEY ||
    !env.CLOUDFLARE_BUCKET ||
    !env.CLOUDFLARE_PUBLIC_URL
  )
    return undefined;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const bucket = env.CLOUDFLARE_BUCKET;
  const publicUrl = env.CLOUDFLARE_PUBLIC_URL.replace(/\/$/, '');
  return {
    async upload(key, body) {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'text/csv; charset=utf-8',
          ContentDisposition: `attachment; filename="${key.split('/').at(-1)}"`,
          CacheControl: 'public, max-age=31536000, immutable',
        },
        queueSize: 2,
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      });
      try {
        await upload.done();
        return `${publicUrl}/${key}`;
      } catch (error) {
        // Interrompe também o cursor Postgres se o upload falhar.
        body.destroy(error instanceof Error ? error : new Error('Falha no upload.'));
        throw error;
      }
    },
  };
}
