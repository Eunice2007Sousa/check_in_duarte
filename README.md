# Check-in — app do ginásio (React + Supabase)

App de marcação de aulas para atletas + área de gestão para o Duarte, ligada
ao Supabase (Postgres) para que todos os telemóveis vejam sempre os mesmos
dados em tempo real, com proteção contra overbooking mesmo com várias pessoas
a marcar a mesma aula ao mesmo tempo (ver `supabase-schema.sql`).

## 1. Configurar o Supabase

Se ainda não o fizeste: cria um projeto em supabase.com e corre o ficheiro
`supabase-schema.sql` (fornecido à parte) inteiro no SQL Editor. Depois vai a
**Project Settings → API Keys** e copia:

- **Project URL**
- **anon public key** (nunca a `service_role`, essa é secreta)

## 2. Correr localmente

```bash
npm install
cp .env.example .env
# edita o .env e cola o URL + a anon key do teu projeto Supabase
npm run dev
```

Abre o link que aparece no terminal (normalmente http://localhost:5173).

## 3. Publicar no Vercel

1. Cria um repositório no GitHub com esta pasta e faz push.
2. Em vercel.com → "Add New Project" → importa esse repositório.
3. O Vercel deteta automaticamente que é um projeto Vite — não precisas de
   mudar o build command (`npm run build`) nem o output dir (`dist`).
4. Antes do deploy, em **Environment Variables**, adiciona:
   - `VITE_SUPABASE_URL` → o Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` → a anon public key do Supabase
5. Clica em "Deploy". Ao fim de ~1 minuto tens um link público (ex:
   `https://check-in-duarte.vercel.app`) que já podes abrir em qualquer
   telemóvel — do Duarte e dos atletas.

Sempre que precisares de mudar o URL/chave do Supabase, atualiza as
Environment Variables no Vercel e faz um novo deploy (ou "Redeploy").

## Estrutura do projeto

```
src/
  App.jsx            -> toda a interface e lógica (Área do Duarte + Área do Atleta)
  supabaseClient.js  -> ligação ao Supabase (lê as variáveis de ambiente)
  main.jsx           -> ponto de entrada React
  index.css          -> Tailwind + fontes
```

## Notas importantes

- A app **nunca lê nem escreve diretamente nas tabelas** — chama sempre
  funções (`supabase.rpc(...)`) já protegidas no Postgres. Isto está descrito
  em detalhe no topo do `supabase-schema.sql`.
- A regra das 12h para desmarcar e a proibição de marcar aulas já passadas
  são validadas **na base de dados** (fuso `Europe/Lisbon`), não só no
  browser — por isso não há forma de contornar isto ajustando a hora do
  telemóvel, por exemplo.
- O limite de vagas por turma é garantido por um `pg_advisory_xact_lock` no
  Postgres: mesmo que 3 atletas marquem a mesma aula no mesmo segundo, a base
  de dados põe os pedidos em fila e nunca deixa passar mais marcações do que
  vagas disponíveis.
