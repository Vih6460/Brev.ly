import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/home';
import { RedirectPage } from './pages/redirect';
import { NotFoundPage } from './pages/not-found';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/:shortCode" element={<RedirectPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
