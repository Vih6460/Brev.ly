import { LinkForm } from '../components/link-form';
import { LinksList } from '../components/links-list';

export function HomePage() {
  return (
    <main className="home">
      <header className="brand">
        <img src="/logo.png" alt="brev.ly" width="97" height="25" />
      </header>
      <div className="home-grid">
        <LinkForm />
        <LinksList />
      </div>
    </main>
  );
}
