import { describe, it, expect } from 'vitest';
import { linkFormSchema } from '../lib/validation';

describe('Formulário de links', () => {
  it.each([
    'example.com',
    '',
    'ftp://example.com',
    'javascript:alert(1)',
    'https://user:pass@example.com',
  ])('rejeita a URL %s sem lançar exceções', (originalUrl) => {
    expect(linkFormSchema.safeParse({ originalUrl, shortCode: 'curso' }).success).toBe(false);
  });
});
