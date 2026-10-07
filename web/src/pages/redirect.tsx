import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { shortCodeSchema } from '../lib/validation';
import { NotFoundPage } from './not-found';
import { Spinner } from '../components/spinner';

export function RedirectPage({
  navigate = (url: string) => window.location.replace(url),
}: {
  navigate?: (url: string) => void;
}) {
  const { shortCode = '' } = useParams();
  const valid = shortCodeSchema.safeParse(shortCode).success;
  const query = useQuery({
    queryKey: ['redirect', shortCode],
    // Uma única promise por visita evita incrementos duplicados no StrictMode.
    queryFn: async () => {
      const link = await api.find(shortCode);
      return api.increment(link.id);
    },
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!query.data) return;
    const destination = new URL(query.data.originalUrl);
    if (!['http:', 'https:'].includes(destination.protocol)) return;
    const timer = window.setTimeout(() => navigate(destination.href), 1200);
    return () => window.clearTimeout(timer);
  }, [query.data, navigate]);

  if (!valid || (query.error instanceof ApiError && [400, 404].includes(query.error.status)))
    return <NotFoundPage />;
  return (
    <main className="status-page">
      <section className="card status-card">
        <img
          className="redirect-logo"
          src="/redirect-icon.svg"
          alt="brev.ly"
          width="48"
          height="48"
        />
        <h1>{query.isError ? 'Não foi possível redirecionar' : 'Redirecionando...'}</h1>
        {query.isError ? (
          <>
            <p>Não conseguimos acessar o link agora. Tente novamente em instantes.</p>
            <button className="button-primary retry-button" onClick={() => void query.refetch()}>
              Tentar novamente
            </button>
            <Link to="/">Voltar para o início</Link>
          </>
        ) : (
          <>
            <div className="status-copy">
              <p>O link será aberto automaticamente em alguns instantes.</p>
              <p>
                Não foi redirecionado?{' '}
                <a href={query.data?.originalUrl} aria-disabled={!query.data}>
                  Acesse aqui
                </a>
              </p>
            </div>
            {!query.data && (
              <div className="redirect-loading" role="status" aria-label="Buscando link">
                <Spinner size={22} />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
