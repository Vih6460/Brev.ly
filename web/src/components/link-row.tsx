import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, TrashIcon } from '@phosphor-icons/react';
import { api, type LinkRecord } from '../lib/api';
import { displayShortUrl, shortUrl } from '../lib/config';
import { Spinner } from './spinner';
import { useToast } from './toast';

export function LinkRow({ link }: { link: LinkRecord }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => api.remove(link.id),
    onSuccess: async () => {
      toast('Link excluído com sucesso.');
      await queryClient.invalidateQueries({ queryKey: ['links'] });
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });
  const copy = useMutation({
    mutationFn: () => navigator.clipboard.writeText(shortUrl(link.shortCode)),
    onSuccess: () => toast('Link copiado!'),
    onError: () => toast('Não foi possível copiar. Selecione o link e copie manualmente.', 'error'),
  });
  return (
    <li className="link-row" aria-busy={remove.isPending}>
      <div className="link-details">
        <a
          className="short-link"
          href={shortUrl(link.shortCode)}
          target="_blank"
          rel="noopener noreferrer"
          title={shortUrl(link.shortCode)}
        >
          {displayShortUrl(link.shortCode)}
        </a>
        <p className="original-link" title={link.originalUrl}>
          {link.originalUrl}
        </p>
      </div>
      <span className="access-count">
        {new Intl.NumberFormat('pt-BR').format(link.accessCount)}{' '}
        {link.accessCount === 1 ? 'acesso' : 'acessos'}
      </span>
      <div className="row-actions">
        <button
          type="button"
          className="button-icon"
          aria-label={`Copiar link ${link.shortCode}`}
          title="Copiar link"
          disabled={copy.isPending || remove.isPending}
          onClick={() => copy.mutate()}
        >
          {copy.isPending ? <Spinner size={16} /> : <CopyIcon size={16} />}
        </button>
        <button
          type="button"
          className="button-icon"
          aria-label={`Excluir link ${link.shortCode}`}
          title="Excluir link"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? <Spinner size={16} /> : <TrashIcon size={16} />}
        </button>
      </div>
    </li>
  );
}
