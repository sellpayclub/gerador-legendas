# Configuração do webhook Cakto (Supabase Edge Function)

## URL do webhook (cole na Cakto)

```
https://lcbczyzedluaoxtuajoz.supabase.co/functions/v1/cakto-webhook
```

## Passo 1 — Migration no Supabase

Dashboard → **SQL Editor** → executar o arquivo:

`supabase/migrations/004_webhook_events.sql`

Ou via terminal (com senha do Postgres):

```bash
export SUPABASE_DB_URL='postgresql://postgres.lcbczyzedluaoxtuajoz:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
./scripts/apply-supabase-hosted.sh
```

## Passo 2 — PDF do manual no Storage

```bash
bash scripts/upload-manual-supabase.sh
```

## Passo 3 — Deploy da Edge Function

Com **Personal Access Token** (`sbp_...` de https://supabase.com/dashboard/account/tokens):

```bash
export SUPABASE_ACCESS_TOKEN='sbp_...'
bash scripts/deploy-cakto-webhook.sh
```

Ou via Supabase CLI (conta com acesso ao projeto):

```bash
npx supabase login
npx supabase link --project-ref lcbczyzedluaoxtuajoz
bash scripts/deploy-cakto-webhook.sh
```

**Secrets obrigatórios** (Dashboard → Edge Functions → Secrets):

| Secret | Valor |
|--------|-------|
| `CAKTO_WEBHOOK_SECRET` | **Copiar do painel Cakto** (Chave Secreta do webhook) |
| `RESEND_API_KEY` | Chave Resend |
| `RESEND_FROM_EMAIL` | `ClipSaaS <acesso@email.clonefyia.com>` (sem aspas) |
| `APP_PUBLIC_URL` | `https://app.clipsaas.site` |

> **Crítico:** o secret na Cakto e no Supabase devem ser **idênticos**. Ao criar/editar o webhook na Cakto, copie a chave gerada para `CAKTO_WEBHOOK_SECRET` no Supabase.

## Passo 4 — Configurar na Cakto

1. Painel Cakto → **Webhooks** → editar ou criar
2. **URL:** `https://lcbczyzedluaoxtuajoz.supabase.co/functions/v1/cakto-webhook`
3. **Eventos:** `purchase_approved`, `subscription_renewed`, `subscription_created`, `subscription_canceled`, `refund`, `chargeback`
4. Copiar **Chave Secreta** → Supabase Secrets (`CAKTO_WEBHOOK_SECRET`)
5. Salvar

## Passo 5 — Testar

```bash
# Teste simulado (não envia e-mail real se usar e-mail fictício)
bash scripts/test-cakto-webhook.sh seu-email@teste.com

# Verificar auditoria
# Supabase → Table Editor → webhook_events
```

Na Cakto: **Reenviar webhook** de um pedido real para validar ponta a ponta.

## O que acontece em cada compra

1. Cakto envia POST para a Edge Function
2. Valida `secret`
3. Cria usuário no Supabase Auth (se novo)
4. Ativa `profiles.access_active = true`
5. Gera magic link
6. Envia e-mail Resend com: nome, e-mail, celular, pedido, valor, data, botão de acesso, PDF manual
7. Registra em `webhook_events`

## Endpoint antigo (desativado)

`https://app.clipsaas.site/webhooks/cakto` → **410 Gone** (não use).

Ativação manual de emergência:

```bash
python3 backend/scripts/activate_customer.py email@cliente.com --name "Nome"
```
