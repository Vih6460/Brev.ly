import { config } from './config';
import type { LinkFormValues } from './validation';

export interface LinkRecord {
  id: string;
  originalUrl: string;
  shortCode: string;
  accessCount: number;
  createdAt: string;
}

export interface LinksPage {
  links: LinkRecord[];
  nextCursor: string | null;
}
export interface CsvExport {
  url: string;
  filename: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.backendUrl}${path}`, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Não foi possível conectar ao servidor. Tente novamente.',
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      data?.code ?? 'REQUEST_FAILED',
      data?.message ?? 'Não foi possível concluir a ação. Tente novamente.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  list: (cursor?: string, signal?: AbortSignal) =>
    request<LinksPage>(`/links?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {
      signal,
    }),
  create: (input: LinkFormValues) =>
    request<LinkRecord>('/links', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/links/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  find: (shortCode: string, signal?: AbortSignal) =>
    request<LinkRecord>(`/links/${encodeURIComponent(shortCode)}`, { signal }),
  increment: (id: string) =>
    request<LinkRecord>(`/links/${encodeURIComponent(id)}/access`, { method: 'PATCH' }),
  export: () => request<CsvExport>('/links/export', { method: 'POST' }),
};

export async function downloadCsv(report: CsvExport) {
  let response: Response;
  try {
    response = await fetch(report.url);
  } catch {
    throw new Error('Não foi possível baixar o relatório. Tente novamente.');
  }
  if (!response.ok) throw new Error('Não foi possível baixar o relatório. Tente novamente.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = report.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
