const httpUrl = (value: string, name: string) => {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} deve ser uma URL http(s) sem caminho, parâmetros ou fragmentos.`);
  }
  return url.origin;
};

export const config = {
  frontendUrl: httpUrl(
    import.meta.env.VITE_FRONTEND_URL || window.location.origin,
    'VITE_FRONTEND_URL',
  ),
  backendUrl: httpUrl(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:3333',
    'VITE_BACKEND_URL',
  ),
};

export const shortUrl = (shortCode: string) => `${config.frontendUrl}/${shortCode}`;
export const displayShortUrl = (shortCode: string) =>
  shortUrl(shortCode).replace(/^https?:\/\//, '');
