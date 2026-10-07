import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

try {
  const services = execFileSync('docker', ['compose', 'ps', '--status', 'running', '--services'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .trim()
    .split(/\s+/);
  if (!services.includes('postgres') || !services.includes('server')) {
    throw new Error('Os containers do banco e da API precisam estar em execução.');
  }
  const response = await fetch('http://127.0.0.1:3333/health', {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('A API ainda não está pronta para acessar o banco.');
  console.log('Postgres e API no Docker estão prontos. Iniciando o frontend…');
} catch {
  console.error(
    'Abra o Docker Desktop e execute, na raiz do projeto:\n' +
      '  docker compose up --build -d --wait\n' +
      'Depois execute npm run serve novamente.\n' +
      'Para conferir problemas: docker compose logs postgres migrate server',
  );
  process.exitCode = 1;
}
