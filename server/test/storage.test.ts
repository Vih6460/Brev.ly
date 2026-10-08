import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { envSchema } from '../src/env.js';
import { createCsvStorage } from '../src/services/storage.js';

let endpoint = '';
let upload: { path: string; body: string; headers: Record<string, unknown> } | undefined;
let rejectUpload = false;
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  upload = {
    path: new URL(request.url!, endpoint).pathname,
    body: Buffer.concat(chunks).toString('utf8'),
    headers: request.headers,
  };
  response.statusCode = rejectUpload ? 403 : 200;
  response.setHeader('Content-Type', 'application/xml');
  response.setHeader('ETag', '"test-etag"');
  response.end(rejectUpload ? '<Error><Code>AccessDenied</Code></Error>' : '');
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Servidor S3 de teste indisponível.');
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const configured = () =>
  envSchema.parse({
    DATABASE_URL: 'postgres://localhost/brevly_test',
    SUPABASE_URL: `${endpoint}/`,
    SUPABASE_S3_REGION: 'ca-central-1',
    SUPABASE_S3_ACCESS_KEY_ID: 'test-key',
    SUPABASE_S3_SECRET_ACCESS_KEY: 'test-secret',
    SUPABASE_STORAGE_BUCKET: 'brevly-exports',
  });

describe('Upload S3 do Supabase', () => {
  it('envia o CSV pelo SDK, assina na região correta e preserva o caminho da URL pública', async () => {
    const storage = createCsvStorage(configured())!;
    const csv =
      '\uFEFFurl_original,url_encurtada,acessos,data_criacao\r\n"https://example.com","http://localhost:5173/curso","1","2026-10-08"\r\n';
    const url = await storage.upload('exports/links-test.csv', Readable.from([csv]));
    expect(url).toBe(`${endpoint}/storage/v1/object/public/brevly-exports/exports/links-test.csv`);
    expect(upload?.path).toBe('/storage/v1/s3/brevly-exports/exports/links-test.csv');
    expect(upload?.body).toBe(csv);
    expect(upload?.headers.authorization).toContain('/ca-central-1/s3/aws4_request');
    expect(upload?.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(upload?.headers['content-disposition']).toBe('attachment; filename="links-test.csv"');
  });

  it('interrompe a leitura do CSV quando o provedor rejeita o upload', async () => {
    rejectUpload = true;
    const body = Readable.from(['csv']);
    body.on('error', () => {});
    try {
      await expect(
        createCsvStorage(configured())!.upload('exports/rejected.csv', body),
      ).rejects.toThrow();
      expect(body.destroyed).toBe(true);
    } finally {
      rejectUpload = false;
    }
  });

  it('mantém a exportação desabilitada quando nenhum provedor foi configurado', () => {
    expect(
      createCsvStorage(envSchema.parse({ DATABASE_URL: 'postgres://localhost/brevly' })),
    ).toBeUndefined();
  });
});
