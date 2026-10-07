# brev.ly

Encurtador de links com API Fastify, Drizzle e Postgres, e uma SPA React com Vite e TypeScript.

## Estrutura

```text
server/  API, schema, migrations, testes e Dockerfile
web/     SPA, tema, componentes, páginas e testes de navegador
assets/  Style Guide e vetores fornecidos
```

## Executar o projeto

Requisitos: Node.js 24 LTS, npm e Docker Desktop em execução. O Postgres e a API são executados exclusivamente pelo Docker Compose; não é necessário instalar Postgres na máquina.

1. Abra o Docker Desktop e aguarde o Docker ficar disponível.
2. Entre na raiz do projeto. Na primeira execução, instale as dependências e prepare os arquivos de ambiente sem sobrescrever configurações existentes:

```sh
cd /Users/vinicius/Documents/Rocketseat/Brevly
npm install
[ -f server/.env ] || cp server/.env.example server/.env
[ -f web/.env ] || cp web/.env.example web/.env
```

3. Construa a imagem e inicie o banco e a API:

```sh
docker compose up --build -d --wait
```

Esse comando constrói a imagem com `server/Dockerfile`, inicia o Postgres, aguarda sua saúde, executa as migrations e só então inicia a API. Aguarde o comando terminar sem erros. Confira:

```sh
docker compose ps --all
```

`postgres` e `server` devem estar `healthy`. O serviço `migrate` deve aparecer como `Exited (0)`: ele termina depois de aplicar as migrations, o que é esperado.

4. Inicie o frontend e mantenha o terminal aberto:

```sh
npm run serve
```

5. Abra **http://localhost:5173**. A API está em **http://localhost:3333**. O CORS também permite `http://127.0.0.1:5173`, endereço exibido pelo Vite. O comando `serve` verifica os containers e a saúde da API antes de iniciar o frontend. Se a porta 5173 estiver ocupada, ele informa o erro e não muda para uma porta sem CORS configurado. `npm run dev` é um alias para esse mesmo fluxo.

Nas próximas execuções, basta abrir o Docker Desktop e executar, na raiz:

```sh
docker compose up --build -d --wait
npm run serve
```

Para parar, use `Ctrl+C` no terminal do frontend e depois `docker compose stop`. Para voltar, execute os dois comandos acima. O volume `brevly_postgres_data` é exclusivo do projeto e mantém seus links mesmo após parar ou recriar os containers. Não use `docker compose down -v` se deseja manter os dados.

### Quando executar migrations

A inicialização pelo Compose já executa as migrations automaticamente **antes da API**. Não é necessário rodar uma migration manual a cada uso: o Drizzle registra as migrations aplicadas e executa apenas as pendentes.

Depois de adicionar uma migration ou alterar o backend, execute novamente `docker compose up --build -d --wait` para reconstruir a imagem e aplicar a mudança. Se precisar aplicar migrations separadamente, com Docker disponível, use na raiz:

```sh
npm run db:migrate
```

Esse comando também constrói a imagem e executa o serviço `migrate` no Docker. Ele aguarda o Postgres e preserva os dados. Execute esse comando na raiz do projeto.

Se ocorrer falha ao iniciar:

```sh
docker compose logs postgres migrate server
```

## Configuração

Os arquivos `server/.env.example` e `web/.env.example` documentam as variáveis. Nunca coloque as credenciais do Cloudflare no frontend.

| Variável            | Uso                                                      |
| ------------------- | -------------------------------------------------------- |
| `PORT`, `HOST`      | Endereço da API                                          |
| `DATABASE_URL`      | Conexão Postgres                                         |
| `FRONTEND_URL`      | Origem pública dos links usados no relatório             |
| `CORS_ORIGIN`       | Origem permitida; aceita uma lista separada por vírgulas |
| `VITE_FRONTEND_URL` | Origem pública dos links copiados e exibidos             |
| `VITE_BACKEND_URL`  | Origem da API                                            |
| `TEST_DATABASE_URL` | Banco separado com nome terminado em `_test`             |
| `CLOUDFLARE_*`      | Upload e endereço público dos relatórios no R2           |

As duas URLs do frontend devem apontar para a mesma origem, sem caminhos ou parâmetros. Ao alterar variáveis `VITE_*` em produção, gere um novo build.

## Exportação CSV no Cloudflare R2

1. Crie um bucket no R2 e um token com permissão de leitura e escrita de objetos nesse bucket.
2. Habilite um domínio público, preferencialmente um domínio personalizado, para o bucket.
3. Preencha as cinco variáveis `CLOUDFLARE_*` em `server/.env`. `CLOUDFLARE_PUBLIC_URL` é a origem pública do bucket, por exemplo `https://downloads.seudominio.com`, sem o nome do bucket.
4. Configure CORS no bucket para permitir o download pelo navegador. Substitua a origem pelo endereço do seu frontend:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Disposition", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

5. Recrie a API com `docker compose up -d --force-recreate server` e use **Baixar CSV**.

Referências oficiais: [acesso público ao bucket](https://developers.cloudflare.com/r2/buckets/public-buckets/) e [CORS do R2](https://developers.cloudflare.com/r2/buckets/cors/).

O relatório contém `url_original`, `url_encurtada`, `acessos` e `data_criacao`. Os nomes usam UUID e os objetos ficam em `exports/`. A leitura usa um cursor Postgres de 500 registros e upload multipart com memória limitada. Datas são exportadas em UTC/ISO 8601. O CSV tem BOM UTF-8 para preservar os acentos em planilhas, escape de aspas e proteção contra fórmulas.

Sem configuração R2, o restante da aplicação funciona e a exportação retorna `503 EXPORT_NOT_CONFIGURED`. A integração usa o endpoint S3 do R2, região `auto`, upload multipart, tipo CSV e `Content-Disposition` de download. Testes validam streaming, conteúdo, falhas e download com um destino controlado.

Na verificação de **07/10/2026**, as cinco variáveis estavam vazias em `server/.env`. Faltam:

| Variável                       | Preencher com                                                       |
| ------------------------------ | ------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`        | ID da conta Cloudflare proprietária do bucket                       |
| `CLOUDFLARE_ACCESS_KEY_ID`     | Access Key ID das credenciais S3 do R2                              |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | Secret Access Key correspondente                                    |
| `CLOUDFLARE_BUCKET`            | Nome do bucket                                                      |
| `CLOUDFLARE_PUBLIC_URL`        | Origem pública HTTPS do bucket, sem `/exports` e sem nome do bucket |

Habilite acesso público e o CORS descrito acima. Após preencher, execute `docker compose up -d --force-recreate server`, cadastre um link e clique em **Baixar CSV**. A validação real deve confirmar `POST /links/export` com status 200, leitura pública da URL retornada e arquivo baixado pelo navegador com as quatro colunas. **Upload real, acesso público e download a partir do R2 continuam pendentes**; não foram substituídos por resultados simulados.

## API

| Método   | Rota                         | Resultado                                           |
| -------- | ---------------------------- | --------------------------------------------------- |
| `GET`    | `/health`                    | Saúde da API e conexão com Postgres                 |
| `POST`   | `/links`                     | Cria um link; `201`, `400` ou `409`                 |
| `GET`    | `/links?limit=20&cursor=...` | Lista os links mais recentes e retorna `nextCursor` |
| `GET`    | `/links/:shortCode`          | Obtém a URL original; não incrementa acessos        |
| `PATCH`  | `/links/:id/access`          | Incrementa o contador atomicamente                  |
| `DELETE` | `/links/:id`                 | Exclui; retorna `204` ou `404`                      |
| `POST`   | `/links/export`              | Gera o relatório e retorna `{ url, filename }`      |

```sh
curl -X POST http://localhost:3333/links \
  -H 'Content-Type: application/json' \
  -d '{"originalUrl":"https://www.rocketseat.com.br","shortCode":"rocketseat"}'
```

Regras: URL original HTTP(S) válida e sem credenciais, com no máximo 2048 caracteres; encurtamento de 1 a 60 caracteres, com letras minúsculas, números e hífens entre palavras. Exemplos válidos: `curso-react`, `portfolio`, `a1`. Espaços externos são removidos. O índice único do banco impede duplicação mesmo em requisições simultâneas.

A listagem usa paginação por cursor, ordenação por `created_at` e `id`, índice composto e limite máximo de 100 registros. O frontend carrega 20 por vez e oferece **Carregar mais**. Exclusão e incremento usam `id` de forma consistente.

## Interface

- `/`: formulário e listagem; validação por campo, estado vazio, carregamento, atualização, cópia e mensagens de erro/sucesso.
- `/:shortCode`: busca o link, incrementa o contador uma vez por visita e redireciona com `location.replace`; oferece um link manual.
- Caminhos inválidos e links inexistentes: página 404. Falhas de rede têm uma mensagem própria com nova tentativa.
- Layout mobile first, com duas colunas no desktop, truncamento de URLs extensas, foco visível e suporte a movimento reduzido.
- Open Sans e ícones Phosphor; cores e estados conferidos no Style Guide do Figma. Assets exportados pelo plugin estão em `web/public`, com versões próprias para a ilustração 404 desktop/mobile.
- **Salvar link** fica desabilitado enquanto faltam campos obrigatórios e durante o envio; entradas preenchidas inválidas mostram validação por campo.

Em **07/10/2026**, a revisão com o plugin Figma começou por Estilos (`1085:711`) e Componentes (`3117:336`). Foram obtidos contexto e screenshots de Links, Empty, Redirect e Not Found em desktop e mobile no [arquivo de referência](https://www.figma.com/design/atdIpVxXC7YkoQVSZPzF0l/Encurtador-de-Links--Community---Copy-). Foram ajustados espaçamentos, dimensões, ícones, foco, erros, botões desabilitados, tipografia e posicionamento das telas de status.

A conferência no Chrome usou 1366×720 e 390×788, além de 320px para validação e ausência de rolagem horizontal. Os cartões com quatro links mediram 380×340 e 580×396 no desktop, e 366×316 e 366×348 no celular, como no Figma. As URLs exibidas seguem a origem configurada em `VITE_FRONTEND_URL`; os encurtamentos seguem as regras da API. Screenshots da implementação estão em `.local/previews/`.

## Testes e build

```sh
npm run check
```

Executa a checagem de tipos, os testes unitários/de componentes e os builds dos dois projetos.

Os testes usam o `compose.test.yaml`, com projeto `brevly-tests`, banco `brevly_test` e volume `brevly-tests_postgres_test_data`, separados dos links da aplicação. Configure `TEST_DATABASE_URL` em `server/.env` conforme o exemplo: `postgresql://postgres:postgres@127.0.0.1:5433/brevly_test`.

```sh
npm run test:integration
```

Esse comando inicia e aguarda o Postgres de testes no Docker. A suíte aplica migrations e limpa somente a tabela `links` do banco de teste. Cobre conflitos concorrentes, incremento concorrente, paginação com datas iguais, exclusão, validação, CORS e streaming de CSV com mais de mil registros.

Para testes completos no navegador:

```sh
npx playwright install chromium
npm run test:e2e
```

O comando constrói e inicia o Compose de testes, aplica migrations e aguarda a API na porta 3334. O Playwright inicia o frontend na porta 5174. Se houver Chrome instalado, dispense o download do Chromium e execute:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Não é necessário configurar `E2E_DATABASE_URL`: a API de testes aponta exclusivamente para o banco Docker `brevly_test`. O navegador testa criação, duplicação, cópia, redirecionamento, contagem, exclusão, 404, campos inválidos, download e ausência de rolagem horizontal em desktop e celular. O destino externo e a resposta pública da nuvem são controlados; um cenário adicional controla a listagem para validar falha de rede, carregamento, nova tentativa e estado vazio. O download verifica nome e conteúdo do arquivo. Os fluxos principais usam a API e o Postgres reais. Execute integração e navegador em sequência, pois compartilham somente o banco de teste.

Ao terminar os testes, pare seus containers:

```sh
docker compose -f compose.test.yaml stop
```

Resultados de **07/10/2026**: `npm run check` aprovado (49 testes unitários/de componentes, tipos e builds); `npm run test:integration` aprovado (17 testes); Playwright no Chrome aprovado (8 testes: 4 desktop e 4 mobile). **Total: 74 testes aprovados**. Nesta rodada, integração e navegador usaram exclusivamente o Postgres e a API do `compose.test.yaml`, no volume de teste isolado.

## Docker e produção

O Dockerfile do backend usa build em etapas, dependências de produção, usuário sem privilégios, healthcheck e encerramento com fechamento das conexões. O contexto do build é a raiz por causa do lockfile dos workspaces:

```sh
docker build -f server/Dockerfile -t brevly-server .
docker compose up --build -d
```

O Compose aguarda o Postgres, executa as migrations em um serviço separado e só depois inicia a API. O projeto Compose principal se chama `brevly`, usa as portas 3333/5432 e o volume próprio `brevly_postgres_data`. Dentro dos containers, a conexão usa o hostname `postgres`; a URL de `server/.env` usa `127.0.0.1:5432` para ferramentas da máquina. O Compose fixa `PORT=3333`, `HOST=0.0.0.0` e `DATABASE_URL` adequados à rede dos containers.

Em **07/10/2026**, a imagem foi construída e o Compose principal foi iniciado. Os 10 links existentes foram transferidos para o volume Docker, com todos os campos conferidos: IDs, URLs, contadores e datas. O banco anterior foi encerrado; seu backup está em `.local/backups/`, ignorado pelo controle de versão. O fluxo de inicialização fora do Docker foi removido. A inicialização por `npm run serve`, a orientação quando os containers estão parados, a reaplicação por `npm run db:migrate` e a persistência após parar e subir o Compose foram validadas. Os 10 links carregaram no navegador e o clique no prefixo do campo focou o input e permitiu digitar.

A validação anterior do Docker também cobriu migrations iniciais e reaplicação, healthcheck, usuário `node`, criação, duplicação, validação, listagem, incremento, CORS, exclusão e persistência após reinício. Os containers de validação anteriores permanecem parados, com seu volume preservado.

A instalação limpa das dependências de produção, a importação do backend compilado e a execução das migrations compiladas foram verificadas em uma pasta temporária com a mesma estrutura usada no Dockerfile. A auditoria das dependências de produção não apontou vulnerabilidades.

Para o frontend, publique o conteúdo de `web/dist` em um host estático com fallback de todas as rotas para `index.html`, necessário para a SPA. `web/nginx.conf` inclui essa configuração. Use URLs públicas de frontend/backend nas variáveis de produção e configure a origem correspondente no CORS da API e do R2.
