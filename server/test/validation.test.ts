import { describe, expect, it } from 'vitest';
import { createLinkSchema, listQuerySchema, shortCodeSchema } from '../src/validation.js';
import { envSchema } from '../src/env.js';
import { csvCell } from '../src/services/export.js';

describe('Validação de links', () => {
  it.each(['meu-link', 'a', 'curso123', '123'])('aceita o encurtamento %s', (code) => {
    expect(shortCodeSchema.parse(code)).toBe(code);
  });
  it.each([
    '',
    'Maiuscula',
    '../admin',
    'com espaço',
    'ação',
    '-inicio',
    'fim-',
    'dois--hifens',
    'a/b',
    'a?b',
    'a'.repeat(61),
  ])('rejeita o encurtamento %s', (code) => {
    expect(shortCodeSchema.safeParse(code).success).toBe(false);
  });
  it.each([
    'javascript:alert(1)',
    'ftp://example.com',
    'example.com',
    'https://user:pass@example.com',
  ])('rejeita a URL %s', (originalUrl) => {
    expect(createLinkSchema.safeParse({ originalUrl, shortCode: 'curso' }).success).toBe(false);
  });
  it('aceita URLs HTTP(S), incluindo parâmetros e remove espaços externos', () => {
    expect(
      createLinkSchema.parse({
        originalUrl: ' https://example.com/path?q=curso#top ',
        shortCode: ' curso ',
      }),
    ).toEqual({ originalUrl: 'https://example.com/path?q=curso#top', shortCode: 'curso' });
  });
  it('limita a paginação a 100 registros e usa 20 por padrão', () => {
    expect(listQuerySchema.parse({}).limit).toBe(20);
    expect(listQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('CSV', () => {
  it('preserva aspas, vírgulas e quebras de linha', () => {
    expect(csvCell('https://example.com/?q="a,b"\nnext')).toBe(
      '"https://example.com/?q=""a,b""\nnext"',
    );
  });
  it.each(['=SUM(A1)', '+CMD()', '-10+2', '@SUM(A1)', '  =1'])(
    'neutraliza fórmulas de planilhas: %s',
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );
});

describe('Configuração de ambiente', () => {
  it('permite desenvolver sem R2 e rejeita configuração parcial', () => {
    expect(
      envSchema.safeParse({ DATABASE_URL: 'postgres://localhost/brevly', CLOUDFLARE_BUCKET: '' })
        .success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        DATABASE_URL: 'postgres://localhost/brevly',
        CLOUDFLARE_BUCKET: 'exports',
      }).success,
    ).toBe(false);
  });
  it('exige Postgres', () => {
    expect(envSchema.safeParse({ DATABASE_URL: 'https://example.com' }).success).toBe(false);
  });
});
