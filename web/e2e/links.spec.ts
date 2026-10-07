import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const apiUrl = 'http://localhost:3334';
let shortCode = '';

test.afterEach(async ({ request }) => {
  if (!shortCode) return;
  const response = await request.get(`${apiUrl}/links/${shortCode}`);
  if (response.ok()) {
    const link = await response.json();
    await request.delete(`${apiUrl}/links/${link.id}`);
  }
  shortCode = '';
});

test('cria, rejeita duplicação, copia, redireciona, conta acesso e exclui', async ({
  page,
  context,
  request,
}, testInfo) => {
  shortCode = `e2e-${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Novo link' })).toBeVisible();
  await page.getByLabel('Link original').fill('https://example.com/e2e');
  await page.getByLabel('Link encurtado').fill(shortCode);
  await page.getByRole('button', { name: 'Salvar link' }).click();
  await expect(page.getByText('Link criado com sucesso!')).toBeVisible();
  const shortened = page.getByRole('link', { name: `localhost:5174/${shortCode}` });
  await expect(shortened).toBeVisible();
  await expect(page.getByLabel('Link original')).toHaveValue('');

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:5174',
  });
  await page.getByRole('button', { name: `Copiar link ${shortCode}` }).click();
  await expect(page.getByText('Link copiado!')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `http://localhost:5174/${shortCode}`,
  );

  await page.getByLabel('Link original').fill('https://example.com/outro');
  await page.getByLabel('Link encurtado').fill(shortCode);
  await page.getByRole('button', { name: 'Salvar link' }).click();
  await expect(page.getByText('Esse encurtamento já existe. Escolha outro.')).toBeVisible();

  await context.route('https://example.com/e2e', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Destino de teste</h1>' }),
  );
  const popupPromise = page.waitForEvent('popup');
  await shortened.click();
  const popup = await popupPromise;
  await expect(popup.getByRole('link', { name: 'Acesse aqui' })).toHaveAttribute(
    'href',
    'https://example.com/e2e',
  );
  await popup.screenshot({
    path: `../.local/previews/redirect-${testInfo.project.name}.png`,
    scale: 'css',
  });
  await expect(popup.getByRole('heading', { name: 'Destino de teste' })).toBeVisible();
  await popup.close();
  const stored = await (await request.get(`${apiUrl}/links/${shortCode}`)).json();
  expect(stored.accessCount).toBe(1);

  await page.reload();
  await expect(page.getByText('1 acesso', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `../.local/previews/home-${testInfo.project.name}.png`,
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: `Excluir link ${shortCode}` }).click();
  await expect(page.getByText('Link excluído com sucesso.')).toBeVisible();
  await expect(shortened).not.toBeVisible();
  expect((await request.get(`${apiUrl}/links/${shortCode}`)).status()).toBe(404);
});

test('valida campos, mostra 404 e funciona em uma tela de 320px', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByLabel('Link original').fill('example.com');
  await page.getByLabel('Link encurtado').fill('Link Inválido');
  await page.getByRole('button', { name: 'Salvar link' }).click();
  await expect(page.getByLabel('Link original')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Link encurtado')).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({
    path: `../.local/previews/validation-${testInfo.project.name}.png`,
    fullPage: true,
    scale: 'css',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/pagina/invalida');
  await expect(page.getByRole('heading', { name: 'Link não encontrado' })).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 784 });
  await page.screenshot({
    path: `../.local/previews/404-${testInfo.project.name}.png`,
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('link', { name: 'brev.ly', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo link' })).toBeVisible();
});

test('mostra estado vazio, carregamento e recupera falha de rede', async ({ page }, testInfo) => {
  // Controle de rede restrito a este cenário; os fluxos principais usam a API real.
  let state: 'error' | 'pending' | 'empty' = 'error';
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${apiUrl}/links?*`, async (route) => {
    if (state === 'error') return route.abort('failed');
    if (state === 'pending') await pending;
    return route.fulfill({ json: { links: [], nextCursor: null } });
  });
  await page.goto('/');
  await expect(page.getByText('Não foi possível carregar seus links.')).toBeVisible();
  await page.screenshot({
    path: `../.local/previews/network-${testInfo.project.name}.png`,
    scale: 'css',
  });
  state = 'pending';
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('region', { name: 'Meus links' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(page.getByRole('status')).toHaveText('Carregando links…');
  await expect(page.getByRole('button', { name: 'Baixar CSV' })).toBeDisabled();
  await page.screenshot({
    path: `../.local/previews/loading-${testInfo.project.name}.png`,
    scale: 'css',
  });
  state = 'empty';
  release();
  await expect(page.getByText('Ainda não existem links cadastrados')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar CSV' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Salvar link' })).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `../.local/previews/empty-${testInfo.project.name}.png`,
    scale: 'css',
  });
});

test('trata R2 sem configuração e baixa CSV com resposta pública controlada', async ({
  page,
  request,
}) => {
  shortCode = `csv-${Date.now()}`;
  await request.post(`${apiUrl}/links`, {
    data: { shortCode, originalUrl: 'https://example.com/csv' },
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Baixar CSV' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('alert')).toHaveText(
    /A exportação CSV ainda não foi configurada no servidor/,
  );

  // Somente a nuvem é simulada; o download é realizado pelo navegador.
  await page.route(`${apiUrl}/links/export`, (route) =>
    route.fulfill({
      json: { url: 'http://localhost:5174/relatorio.csv', filename: 'links-teste.csv' },
    }),
  );
  await page.route('http://localhost:5174/relatorio.csv', (route) =>
    route.fulfill({
      contentType: 'text/csv; charset=utf-8',
      body: 'url_original,url_encurtada,acessos,data_criacao\nhttps://example.com/csv,http://localhost:5174/csv,0,2026-10-06\n',
    }),
  );
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('links-teste.csv');
  expect(await download.failure()).toBeNull();
  const downloaded = await readFile((await download.path())!, 'utf8');
  expect(downloaded).toContain('url_original,url_encurtada,acessos,data_criacao');
  expect(downloaded).toContain('https://example.com/csv');
  await expect(page.getByText('Relatório baixado com sucesso.')).toBeVisible();
});
