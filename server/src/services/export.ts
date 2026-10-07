import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import type { CsvStorage } from './storage.js';

export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createExportService(database: Database, frontendUrl: string, storage?: CsvStorage) {
  return async () => {
    if (!storage)
      throw new AppError(
        503,
        'EXPORT_NOT_CONFIGURED',
        'A exportação CSV ainda não foi configurada no servidor.',
      );
    const filename = `links-${randomUUID()}.csv`;
    const key = `exports/${filename}`;
    const baseUrl = frontendUrl.replace(/\/$/, '');
    async function* csv() {
      yield '\uFEFFurl_original,url_encurtada,acessos,data_criacao\r\n';
      // Cursor mantém o uso de memória limitado a 500 registros, mesmo em grandes relatórios.
      for await (const rows of database.client`
        SELECT original_url, short_code, access_count, created_at
        FROM links ORDER BY created_at DESC, id DESC
      `.cursor(500)) {
        for (const row of rows) {
          yield [
            row.original_url,
            `${baseUrl}/${row.short_code}`,
            row.access_count,
            new Date(row.created_at).toISOString(),
          ]
            .map(csvCell)
            .join(',') + '\r\n';
        }
      }
    }
    const body = Readable.from(csv(), { objectMode: false });
    // Captura falhas de leitura; o SDK rejeita o upload correspondente.
    body.on('error', () => {});
    try {
      const url = await storage.upload(key, body);
      return { url, filename };
    } catch {
      body.destroy();
      throw new AppError(
        502,
        'EXPORT_FAILED',
        'Não foi possível gerar o relatório. Tente novamente.',
      );
    }
  };
}
