import { StrictMode, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../app';
import { api, ApiError, downloadCsv, type LinkRecord } from '../lib/api';
import { ToastProvider } from '../components/toast';
import { RedirectPage } from '../pages/redirect';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    find: vi.fn(),
    increment: vi.fn(),
    export: vi.fn(),
  },
  downloadCsv: vi.fn(),
}));

const link: LinkRecord = {
  id: '684f59f0-a5a9-4ccc-b2d9-d4c069d5c442',
  originalUrl: 'https://example.com/curso',
  shortCode: 'curso',
  accessCount: 0,
  createdAt: '2026-10-06T10:00:00.000Z',
};

function mount(ui: ReactNode = <App />, path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>{ui}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
beforeEach(() => {
  vi.mocked(api.list).mockResolvedValue({ links: [], nextCursor: null });
  vi.mocked(api.create).mockResolvedValue(link);
  vi.mocked(api.remove).mockResolvedValue(undefined);
  vi.mocked(api.find).mockResolvedValue(link);
  vi.mocked(api.increment).mockResolvedValue({ ...link, accessCount: 1 });
});

describe('Página inicial', () => {
  it('mostra o estado vazio e desabilita a exportação', async () => {
    mount();
    expect(await screen.findByText('Ainda não existem links cadastrados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar CSV' })).toBeDisabled();
  });
  it('valida URL original e encurtamento antes de chamar a API', async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText('Link original'), 'javascript:alert(1)');
    await user.type(screen.getByLabelText('Link encurtado'), 'Meu Link');
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));
    expect(
      await screen.findByText('Use letras minúsculas, números e hífens entre palavras.'),
    ).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
  it('cria um link, atualiza a listagem e limpa o formulário', async () => {
    const user = userEvent.setup();
    vi.mocked(api.create).mockImplementation(async () => {
      vi.mocked(api.list).mockResolvedValue({ links: [link], nextCursor: null });
      return link;
    });
    mount();
    await user.type(screen.getByLabelText('Link original'), link.originalUrl);
    await user.type(screen.getByLabelText('Link encurtado'), link.shortCode);
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));
    expect(await screen.findByText('Link criado com sucesso!')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /\/curso$/ })).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith(
      { originalUrl: link.originalUrl, shortCode: 'curso' },
      expect.anything(),
    );
    expect(screen.getByLabelText('Link original')).toHaveValue('');
  });
  it('mostra duplicação no campo de encurtamento', async () => {
    const user = userEvent.setup();
    vi.mocked(api.create).mockRejectedValue(
      new ApiError(409, 'SHORT_CODE_ALREADY_EXISTS', 'Esse encurtamento já existe. Escolha outro.'),
    );
    mount();
    await user.type(screen.getByLabelText('Link original'), link.originalUrl);
    await user.type(screen.getByLabelText('Link encurtado'), link.shortCode);
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));
    expect(
      await screen.findByText('Esse encurtamento já existe. Escolha outro.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Link encurtado')).toHaveAttribute('aria-invalid', 'true');
  });
  it('bloqueia o formulário enquanto a criação está pendente', async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: LinkRecord) => void;
    vi.mocked(api.create).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    mount();
    await user.type(screen.getByLabelText('Link original'), link.originalUrl);
    await user.type(screen.getByLabelText('Link encurtado'), link.shortCode);
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    expect(screen.getByLabelText('Link original')).toBeDisabled();
    resolveCreate(link);
    await screen.findByText('Link criado com sucesso!');
  });
  it('exclui um link e atualiza o estado vazio', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockResolvedValue({ links: [link], nextCursor: null });
    vi.mocked(api.remove).mockImplementation(async () => {
      vi.mocked(api.list).mockResolvedValue({ links: [], nextCursor: null });
    });
    mount();
    await user.click(await screen.findByRole('button', { name: 'Excluir link curso' }));
    expect(await screen.findByText('Ainda não existem links cadastrados')).toBeInTheDocument();
    expect(api.remove).toHaveBeenCalledWith(link.id);
  });
  it('copia o endereço completo do link', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockResolvedValue({ links: [link], nextCursor: null });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    mount();
    await user.click(await screen.findByRole('button', { name: 'Copiar link curso' }));
    expect(await screen.findByText('Link copiado!')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/.*\/curso$/));
  });
  it('exporta e baixa o relatório pela URL retornada', async () => {
    const user = userEvent.setup();
    const report = { url: 'https://cdn.example.com/exports/links.csv', filename: 'links.csv' };
    vi.mocked(api.list).mockResolvedValue({ links: [link], nextCursor: null });
    vi.mocked(api.export).mockResolvedValue(report);
    vi.mocked(downloadCsv).mockResolvedValue(undefined);
    mount();
    await screen.findByRole('link', { name: /\/curso$/ });
    await user.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    expect(await screen.findByText('Relatório baixado com sucesso.')).toBeInTheDocument();
    expect(downloadCsv).toHaveBeenCalledWith(report);
  });
  it('mostra falha de exportação e permite tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockResolvedValue({ links: [link], nextCursor: null });
    vi.mocked(api.export).mockRejectedValue(
      new ApiError(
        503,
        'EXPORT_NOT_CONFIGURED',
        'A exportação CSV ainda não foi configurada no servidor.',
      ),
    );
    mount();
    await screen.findByRole('link', { name: /\/curso$/ });
    await user.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A exportação CSV ainda não foi configurada no servidor.',
    );
    expect(screen.getByRole('button', { name: 'Baixar CSV' })).toBeEnabled();
  });
  it('carrega a próxima página sem substituir os links anteriores', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockImplementation(async (cursor) =>
      cursor
        ? { links: [{ ...link, id: 'segundo', shortCode: 'segundo' }], nextCursor: null }
        : { links: [link], nextCursor: 'cursor-2' },
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('link', { name: /\/segundo$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/curso$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });
});

describe('Redirecionamento e 404', () => {
  it('busca a URL, incrementa uma única vez no StrictMode e redireciona', async () => {
    const navigate = vi.fn();
    mount(
      <Routes>
        <Route path="/:shortCode" element={<RedirectPage navigate={navigate} />} />
      </Routes>,
      '/curso',
    );
    expect(await screen.findByRole('link', { name: 'Acesse aqui' })).toHaveAttribute(
      'href',
      link.originalUrl,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(link.originalUrl), { timeout: 2500 });
    expect(api.increment).toHaveBeenCalledTimes(1);
    expect(api.increment).toHaveBeenCalledWith(link.id);
  });
  it('exibe 404 para encurtamento que não existe', async () => {
    vi.mocked(api.find).mockRejectedValue(
      new ApiError(404, 'LINK_NOT_FOUND', 'O link informado não existe.'),
    );
    mount(<App />, '/inexistente');
    expect(await screen.findByRole('heading', { name: 'Link não encontrado' })).toBeInTheDocument();
    expect(api.increment).not.toHaveBeenCalled();
  });
  it.each(['/invalid/path', '/Maiuscula'])('exibe 404 para caminho inválido %s', (path) => {
    mount(<App />, path);
    expect(screen.getByRole('heading', { name: 'Link não encontrado' })).toBeInTheDocument();
    expect(api.find).not.toHaveBeenCalled();
  });
  it('trata indisponibilidade do servidor sem mostrar um falso 404', async () => {
    vi.mocked(api.find).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Servidor indisponível.'),
    );
    mount(<App />, '/curso');
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível redirecionar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
