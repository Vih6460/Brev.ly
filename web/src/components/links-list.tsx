import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { DownloadSimpleIcon, LinkIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { api, downloadCsv } from '../lib/api';
import { LinkRow } from './link-row';
import { Spinner } from './spinner';
import { useToast } from './toast';

export function LinksList() {
  const toast = useToast();
  const list = useInfiniteQuery({
    queryKey: ['links'],
    queryFn: ({ pageParam, signal }) => api.list(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: 1,
  });
  const links = list.data?.pages.flatMap((page) => page.links) ?? [];
  const exportCsv = useMutation({
    mutationFn: async () => downloadCsv(await api.export()),
    onSuccess: () => toast('Relatório baixado com sucesso.'),
    onError: (error: Error) => toast(error.message, 'error'),
  });
  return (
    <section className="card my-links" aria-labelledby="my-links-title" aria-busy={list.isFetching}>
      {list.isFetching && <div className="loading-bar" aria-hidden="true" />}
      <header className="list-header">
        <h2 id="my-links-title">Meus links</h2>
        <button
          type="button"
          className="button-secondary"
          onClick={() => exportCsv.mutate()}
          disabled={list.isPending || !links.length || exportCsv.isPending}
        >
          {exportCsv.isPending ? <Spinner size={16} /> : <DownloadSimpleIcon size={16} />}{' '}
          {exportCsv.isPending ? 'Baixando…' : 'Baixar CSV'}
        </button>
      </header>
      {list.isPending ? (
        <div className="list-state" role="status">
          <Spinner size={32} />
          <p>Carregando links…</p>
        </div>
      ) : list.isError && !links.length ? (
        <div className="list-state list-error" role="alert">
          <WarningCircleIcon size={32} />
          <p>Não foi possível carregar seus links.</p>
          <button
            type="button"
            className="button-secondary"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : !links.length ? (
        <div className="list-state">
          <LinkIcon size={32} aria-hidden="true" />
          <p>Ainda não existem links cadastrados</p>
        </div>
      ) : (
        <>
          <ul className="links" aria-label="Links cadastrados">
            {links.map((link) => (
              <LinkRow key={link.id} link={link} />
            ))}
          </ul>
          {list.isError && (
            <p className="pagination-error" role="alert">
              Não foi possível atualizar a lista.{' '}
              <button
                onClick={() =>
                  void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())
                }
              >
                Tentar novamente
              </button>
            </p>
          )}
          {list.hasNextPage && (
            <button
              type="button"
              className="button-secondary load-more"
              disabled={list.isFetching}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage && <Spinner size={16} />}
              {list.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
