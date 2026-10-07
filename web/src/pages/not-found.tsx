import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="status-page">
      <section className="card status-card">
        <picture className="not-found-art">
          <source media="(min-width: 768px)" srcSet="/404-desktop.svg" />
          <img src="/404-mobile.svg" alt="404" />
        </picture>
        <h1>Link não encontrado</h1>
        <p>
          O link que você está tentando acessar não existe, foi removido ou é uma URL inválida.
          Saiba mais em <Link to="/">brev.ly</Link>.
        </p>
      </section>
    </main>
  );
}
