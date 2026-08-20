# Sistema de Análise de Partidas — BETA

BETA funcional para organizações de Free Fire validarem o fluxo completo de análise de partidas, com simulação de Discord, códigos de acesso, sala de transmissão via WebRTC e painel administrativo.

## Stack

- **Next.js 16** (App Router)
- **React + TypeScript**
- **Tailwind CSS**
- **PostgreSQL + Prisma ORM**
- **Socket.IO** (sinalização WebRTC e presença em tempo real)
- **WebRTC** (`getDisplayMedia` para compartilhamento de tela)

## Arquitetura

```text
src/
├── app/                  # Páginas e API Routes
│   ├── discord/          # Simulação do canal Discord
│   ├── analise/          # Entrada por código + sala
│   └── admin/            # Painel da ORG
├── components/           # UI e sala de análise
├── hooks/                # Socket.IO e WebRTC
├── lib/                  # Regras de negócio, Prisma, sessão BETA
└── server/               # Handlers Socket.IO

server.ts                 # Servidor customizado (Next.js + Socket.IO)
prisma/                   # Schema, migrations e seed
```

## Pré-requisitos

- Node.js 20+
- Docker (para PostgreSQL) **ou** PostgreSQL local
- Dois navegadores/janelas anônimas para testar Ygor + Pedro

## Instalação

### 1. Clonar e instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` se necessário. O padrão usa PostgreSQL em `localhost:5432`.

### 3. Subir o banco de dados

```bash
docker compose up -d
```

### 4. Criar tabelas e popular dados

```bash
npm run db:setup
```

Isso executa `prisma db push` e o seed com:

- Organização **TOKIO**
- Jogadores **Ygor** e **Pedro**
- Partida **#159** finalizada
- Análise pronta com código **PD51X** para Pedro
- Análises extras para o painel admin (#158, #157)

### 5. Iniciar o servidor

```bash
npm run dev
```

Acesse: **http://localhost:3000**

> O BETA usa um servidor customizado (`server.ts`) que roda Next.js e Socket.IO na mesma porta.

## Como testar o fluxo completo

### Passo 1 — Ygor solicita análise

1. Abra http://localhost:3000
2. Clique em **Entrar como Ygor**
3. Vá para `/discord`
4. Se a análise ainda não existir, clique em **Solicitar análise**
5. Clique em **Entrar na análise** (aguarde Pedro entrar depois)

### Passo 2 — Pedro entra com código

1. Abra uma **janela anônima**
2. Entre como **Pedro**
3. Veja o código `PD51X` no painel de mensagens privadas (simulado)
4. Vá para `/analise`, informe o código e entre na sala

### Passo 3 — Transmissão de tela

1. Na sala `/analise/[id]`, Pedro clica em **Compartilhar minha tela**
2. Ygor visualiza a transmissão na mesma sala (outra janela)
3. Ygor pode **Encerrar análise**

### Passo 4 — Resultado no admin

1. Entre como **Administrador**
2. Acesse `/admin` → clique na análise #159
3. Registre o resultado: **Aprovado**, **Irregularidade** ou **Cancelada**
4. Veja o histórico completo de eventos

## Rotas principais

| Rota | Descrição |
|------|-----------|
| `/` | Seletor BETA (Ygor / Pedro / Admin) |
| `/discord` | Simulação do canal Discord pós-partida |
| `/analise` | Validação de código de acesso |
| `/analise/[id]` | Sala de análise com WebRTC |
| `/admin` | Dashboard da organização |
| `/admin/[id]` | Detalhes, histórico e resultado |

## Estados da análise

`PENDENTE` → `AGUARDANDO_PARTICIPANTE` → `AGUARDANDO_ANALISTA` → `SALA_ATIVA` → `TRANSMISSAO_ATIVA` → `FINALIZADA`

Também: `CANCELADA`, `EXPIRADA`, `IRREGULARIDADE`

## Segurança (BETA)

- Códigos únicos de 5 caracteres com validade configurável
- Código do analisado vinculado ao jogador correto
- Acesso à sala exige sessão BETA + token registrado no Socket.IO
- Link direto `/analise/[id]` redireciona sem acesso válido
- Códigos expiram e análises encerradas bloqueiam reentrada

## Fora do escopo deste BETA

- Pagamentos e apostas reais
- Integração real com Discord
- Gravação de vídeo
- Autenticação completa
- App mobile

## Scripts úteis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run db:generate  # Gerar Prisma Client
npm run db:push      # Sincronizar schema
npm run db:seed      # Popular banco
npm run db:setup     # Push + seed
```

## Evolução futura

A arquitetura separa:

- **Regras de negócio** (`src/lib/analysis.ts`) — prontas para extração em serviço
- **Socket.IO** (`src/server/socket.ts`) — substituível por serviço dedicado
- **Simulação Discord** (`/discord`) — substituível por bot/webhook real
- **Sessão BETA** (`/api/session`) — substituível por auth OAuth/JWT

---

Desenvolvido como BETA para validação de experiência antes da versão definitiva.
