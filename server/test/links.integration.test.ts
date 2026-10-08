import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import type { CsvStorage } from '../src/services/storage.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error(
    'Configure TEST_DATABASE_URL para um banco separado cujo nome termine em _test. Os testes limpam a tabela links.',
  );
}
const database = createDatabase(databaseUrl);
let csv = '';
let keys: string[] = [];
const storage: CsvStorage = {
  async upload(key, body) {
    keys.push(key);
    let content = '';
    for await (const chunk of body) content += chunk.toString();
    csv = content;
    return `https://cdn.example.com/${key}`;
  },
};
const app = await buildApp({
  database,
  frontendUrl: 'http://localhost:5173',
  corsOrigin: 'http://localhost:5173',
  storage,
});
const create = (shortCode: string, originalUrl = 'https://example.com/curso') =>
  app.inject({ method: 'POST', url: '/links', payload: { shortCode, originalUrl } });

beforeAll(async () => {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
});
beforeEach(async () => {
  await database.client`TRUNCATE TABLE links`;
  csv = '';
  keys = [];
});
afterAll(async () => {
  await app.close();
  await database.client.end();
});

describe('API com Postgres real', () => {
  it('cria, persiste e busca a URL original sem incrementar acessos', async () => {
    const response = await create('curso');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      shortCode: 'curso',
      accessCount: 0,
      originalUrl: 'https://example.com/curso',
    });
    expect(response.json().id).toMatch(/^[\da-f-]{36}$/);
    const lookup = await app.inject({ url: '/links/curso' });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().accessCount).toBe(0);
  });
  it.each(['Maiuscula', '../caminho', 'com espaço', '-abc', 'abc--def'])(
    'rejeita encurtamento mal formatado: %s',
    async (shortCode) => {
      expect((await create(shortCode)).statusCode).toBe(400);
      expect((await app.inject({ url: '/links' })).json().links).toHaveLength(0);
    },
  );
  it('rejeita protocolos inseguros e payloads incompletos', async () => {
    expect((await create('curso', 'javascript:alert(1)')).statusCode).toBe(400);
    expect((await create('curso', 'example.com')).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/links', payload: {} })).statusCode).toBe(400);
  });
  it('rejeita duplicação até quando duas requisições chegam simultaneamente', async () => {
    const responses = await Promise.all([create('mesmo-link'), create('mesmo-link')]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.statusCode === 409)?.json().code).toBe(
      'SHORT_CODE_ALREADY_EXISTS',
    );
  });
  it('incrementa acessos sem perder atualizações concorrentes', async () => {
    const { id } = (await create('curso')).json();
    const responses = await Promise.all(
      Array.from({ length: 15 }, () => app.inject({ method: 'PATCH', url: `/links/${id}/access` })),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect((await app.inject({ url: '/links/curso' })).json().accessCount).toBe(15);
  });
  it('deleta pelo mesmo id usado para incrementar', async () => {
    const { id } = (await create('curso')).json();
    expect((await app.inject({ method: 'DELETE', url: `/links/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ url: '/links/curso' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/links/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/links/${id}/access` })).statusCode).toBe(
      404,
    );
  });
  it('pagina sem repetir ou omitir links com a mesma data de criação', async () => {
    await Promise.all(['um', 'dois', 'tres', 'quatro', 'cinco'].map((code) => create(code)));
    await database.client`UPDATE links SET created_at = '2026-10-06T10:00:00.123Z'`;
    const codes: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await app.inject({
        url: `/links?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      });
      expect(response.statusCode).toBe(200);
      const data: { links: { shortCode: string }[]; nextCursor: string | null } = response.json();
      codes.push(...data.links.map((link: { shortCode: string }) => link.shortCode));
      cursor = data.nextCursor;
    } while (cursor);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
  });
  it('rejeita cursor, limite e id inválidos', async () => {
    expect((await app.inject({ url: '/links?cursor=invalido' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/links?limit=101' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/links/invalido' })).statusCode).toBe(400);
  });
  it('retorna empty state, 404 e rejeita JSON malformado', async () => {
    expect((await app.inject({ url: '/links' })).json()).toEqual({ links: [], nextCursor: null });
    expect((await app.inject({ url: '/links/inexistente' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/rota/inexistente' })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/links',
          headers: { 'content-type': 'application/json' },
          payload: '{',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('habilita CORS para o frontend', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/links',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.statusCode).toBe(204);
  });
  it('exporta todos os registros, mesmo além do tamanho do cursor, com nomes únicos e URL pública', async () => {
    await database.client`
      INSERT INTO links (original_url, short_code, access_count)
      SELECT 'https://example.com/?q="a,b"', 'link-' || n, n FROM generate_series(1, 1001) n
    `;
    const first = await app.inject({ method: 'POST', url: '/links/export' });
    const second = await app.inject({ method: 'POST', url: '/links/export' });
    expect(first.statusCode).toBe(200);
    expect(first.json().url).toMatch(
      /^https:\/\/cdn.example.com\/exports\/links-[\da-f-]{36}\.csv$/,
    );
    expect(first.json().filename).not.toBe(second.json().filename);
    expect(keys).toHaveLength(2);
    expect(csv.startsWith('\uFEFFurl_original,url_encurtada,acessos,data_criacao\r\n')).toBe(true);
    expect(csv.trim().split('\r\n')).toHaveLength(1002);
    expect(csv).toContain('"https://example.com/?q=""a,b"""');
    expect(csv).toContain('"http://localhost:5173/link-1001","1001"');
    expect(csv).toMatch(/"\d{4}-\d{2}-\d{2}T/);
  });
  it('retorna erro claro quando o Storage não foi configurado', async () => {
    const unconfigured = await buildApp({
      database,
      frontendUrl: 'http://localhost:5173',
      corsOrigin: 'http://localhost:5173',
    });
    try {
      const response = await unconfigured.inject({ method: 'POST', url: '/links/export' });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('EXPORT_NOT_CONFIGURED');
    } finally {
      await unconfigured.close();
    }
  });
  it('trata falhas no upload do CSV', async () => {
    const failing = await buildApp({
      database,
      frontendUrl: 'http://localhost:5173',
      corsOrigin: 'http://localhost:5173',
      storage: {
        upload: async () => {
          throw new Error('S3 indisponível');
        },
      },
    });
    try {
      const response = await failing.inject({ method: 'POST', url: '/links/export' });
      expect(response.statusCode).toBe(502);
      expect(response.json().code).toBe('EXPORT_FAILED');
    } finally {
      await failing.close();
    }
  });
});
