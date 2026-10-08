import type { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Env } from '../env.js';

export interface CsvStorage {
  upload(key: string, body: Readable): Promise<string>;
}

export function createCsvStorage(env: Env): CsvStorage | undefined {
  if (
    env.SUPABASE_URL &&
    env.SUPABASE_S3_REGION &&
    env.SUPABASE_S3_ACCESS_KEY_ID &&
    env.SUPABASE_S3_SECRET_ACCESS_KEY &&
    env.SUPABASE_STORAGE_BUCKET
  ) {
    const baseUrl = env.SUPABASE_URL.replace(/\/+$/, '');
    const endpoint = new URL(baseUrl);
    // O hostname direto do Storage é recomendado pelo Supabase para uploads S3.
    if (endpoint.hostname.endsWith('.supabase.co')) {
      endpoint.hostname = endpoint.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    }
    endpoint.pathname = '/storage/v1/s3';
    return createS3Storage(
      new S3Client({
        region: env.SUPABASE_S3_REGION,
        endpoint: endpoint.toString(),
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID,
          secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
      env.SUPABASE_STORAGE_BUCKET,
      `${baseUrl}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}`,
    );
  }
  return undefined;
}

function createS3Storage(client: S3Client, bucket: string, basePublicUrl: string): CsvStorage {
  const publicUrl = basePublicUrl.replace(/\/+$/, '');
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
