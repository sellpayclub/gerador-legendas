# Deploy Hosted (BYOK + Supabase) — ClipSaaS

**URL pública:** https://app.clipsaas.site  
**VPS:** `161.97.79.7`

Modo SaaS: login por usuário, chave OpenAI individual (BYOK), arquivos apagados em 24h, webhook Cakto + e-mail Resend.

O white-label local (`MULTI_TENANT=false`) continua igual — não altere essas variáveis na instalação Mac pessoal.

## 1. Supabase

Projeto atual: `lcbczyzedluaoxtuajoz` → `https://lcbczyzedluaoxtuajoz.supabase.co`

### Migration (obrigatório, uma vez)

O banco já tem `profiles` de outros apps — use **`002_clipsaas_hosted.sql`** (ALTER + tabelas novas), **não** o `001`.

**Opção A — SQL Editor** (Dashboard → SQL Editor → colar e executar):

`supabase/migrations/002_clipsaas_hosted.sql`

**Opção B — script local** (precisa da senha do Postgres):

```bash
export SUPABASE_DB_URL='postgresql://postgres.lcbczyzedluaoxtuajoz:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
./scripts/apply-supabase-hosted.sh
```

Senha em: Dashboard → Project Settings → Database → Connection string.

Verificar sem aplicar DDL:

```bash
SUPABASE_SERVICE_ROLE_KEY=... ./scripts/apply-supabase-hosted.sh --verify-only
```

### Auth

1. **Authentication → Providers** — Email + senha habilitados.
2. **Authentication → URL Configuration**:
   - Site URL: `https://app.clipsaas.site`
   - Redirect URLs:
     - `https://app.clipsaas.site/auth/callback`
     - `https://app.clipsaas.site/auth/atualizar-senha`
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/atualizar-senha`
3. Chaves: `SUPABASE_URL`, anon (frontend), service_role (backend). **JWT Secret não é obrigatório** — o backend valida token via `/auth/v1/user`.

## 2. Variáveis de ambiente

### Backend (`backend/.env`)

Copie de `backend/.env.hosted.example`:

```bash
MULTI_TENANT=true
DOMAIN=app.clipsaas.site
APP_PUBLIC_URL=https://app.clipsaas.site
ALLOWED_ORIGINS=https://app.clipsaas.site
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...   # fallback auth API
# SUPABASE_JWT_SECRET=    # opcional; omita para validar via /auth/v1/user
ENCRYPTION_KEY=          # openssl rand -base64 32
CAKTO_WEBHOOK_SECRET=seu-secret-cakto
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=ClipSaaS <acesso@email.clonefyia.com>
JOB_MAX_AGE_HOURS=24
# NÃO defina OPENAI_API_KEY global — cada usuário usa a própria
```

### Frontend (`frontend/.env.local`)

Copie de `frontend/.env.hosted.example`:

```bash
NEXT_PUBLIC_MULTI_TENANT=true
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
BACKEND_URL=http://127.0.0.1:8000
```

## 3. Cakto + Resend (Supabase Edge Function)

O webhook Cakto **não** passa mais pela VPS. Use a Edge Function no Supabase:

1. **URL do webhook na Cakto:**
   `https://lcbczyzedluaoxtuajoz.supabase.co/functions/v1/cakto-webhook`
2. **Eventos:** `purchase_approved`, `subscription_renewed`, `subscription_created`, `subscription_canceled`, `refund`, `chargeback`
3. Copie a **Chave Secreta** do webhook Cakto → Supabase Dashboard → **Edge Functions → Secrets** → `CAKTO_WEBHOOK_SECRET`
4. Secrets obrigatórios na Edge Function:
   - `CAKTO_WEBHOOK_SECRET` — igual ao painel Cakto
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` — ex.: `ClipSaaS <acesso@email.clonefyia.com>` (sem aspas)
   - `APP_PUBLIC_URL` — `https://app.clipsaas.site`
5. Aplicar migration `004_webhook_events.sql` e subir o PDF:
   ```bash
   # SQL Editor: supabase/migrations/004_webhook_events.sql
   bash scripts/upload-manual-supabase.sh
   bash scripts/deploy-cakto-webhook.sh   # requer supabase login na conta do projeto
   ```
   Guia completo: [`scripts/CAKTO-WEBHOOK-SETUP.md`](scripts/CAKTO-WEBHOOK-SETUP.md)
6. Após `purchase_approved`: ativa conta, magic link + e-mail Resend com PDF do manual.
7. Auditoria: tabela `webhook_events` no Supabase (status, email_id, erros).
8. Endpoint antigo na VPS (`/webhooks/cakto`) retorna **410 Gone** — não use.

## 4. VPS (161.97.79.7)

DNS: `app.clipsaas.site` → A → `161.97.79.7`

```bash
ssh root@161.97.79.7
git clone git@github.com:sellpayclub/gerador-legendas.git /opt/legendas-locais
cd /opt/legendas-locais
cp backend/.env.hosted.example backend/.env   # edite com suas chaves
cp frontend/.env.hosted.example frontend/.env.local
bash install.sh
```

O `install.sh` usa automaticamente `app.clipsaas.site` como domínio (Caddy + HTTPS).

Atualizar depois:

```bash
ssh root@161.97.79.7 'cd /opt/legendas-locais && git pull && bash deploy/setup.sh --update'
```

Verificar:

```bash
curl -s https://app.clipsaas.site/api/health
```

## 5. Checklist pós-deploy

- [ ] `https://app.clipsaas.site` abre login
- [ ] Supabase redirect funciona (`/auth/callback`)
- [ ] Webhook Cakto teste → e-mail Resend + PDF
- [ ] BYOK em `/configuracoes`
- [ ] Upload + transcrição com plano ativo

## Segurança

- Chaves OpenAI: Fernet + `user_secrets` (service role only)
- JWT em todas as rotas de job
- Webhook Cakto: validar `secret`
- HTTPS via Caddy (Let's Encrypt automático)

## Capacidade

VPS 4 vCPU / 8 GB, cleanup 24h: ~20–50 usuários cadastrados, poucos simultâneos.
