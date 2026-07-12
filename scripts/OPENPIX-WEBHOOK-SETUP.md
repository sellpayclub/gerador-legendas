# Configuração do webhook OpenPix (Supabase Edge Function)

## URL do webhook (cole no painel OpenPix/Woovi)

```
https://lcbczyzedluaoxtuajoz.supabase.co/functions/v1/openpix-webhook
```

**Eventos** (marque os dois no painel OpenPix/Woovi):

| Evento | O que faz |
|--------|-----------|
| `OPENPIX:CHARGE_CREATED` | Envia e-mail com QR Code + PIX copia-e-cola (recuperação de venda) |
| `OPENPIX:CHARGE_COMPLETED` | Libera acesso + e-mail de login/senha (fluxo existente) |

## Deploy

```bash
export SUPABASE_ACCESS_TOKEN='sbp_...'   # https://supabase.com/dashboard/account/tokens
bash scripts/deploy-openpix-webhook.sh
```

**Secrets obrigatórios** (Dashboard → Edge Functions → Secrets):

| Secret | Valor |
|--------|-------|
| `RESEND_API_KEY` | Chave Resend |
| `RESEND_FROM_EMAIL` | `ClipSaaS <acesso@email.clonefyia.com>` |
| `APP_PUBLIC_URL` | `https://app.clipsaas.site` |

## O que acontece ao gerar PIX (`CHARGE_CREATED`)

1. OpenPix envia POST `OPENPIX:CHARGE_CREATED` para a Edge Function
2. Busca pedido em `orders` pelo `correlationID` (se existir)
3. Envia e-mail Resend com QR Code, link de pagamento e código copia-e-cola
4. Registra em `webhook_events` (`order_id`: `openpix-pix-{correlationID}`)
5. **Não** altera acesso, pixel Meta nem e-mail de compra aprovada

## O que acontece em cada PIX pago (`CHARGE_COMPLETED`)

1. OpenPix envia POST `OPENPIX:CHARGE_COMPLETED` para a Edge Function
2. Busca pedido em `orders` pelo `correlationID`
3. Marca pedido como `paid`
4. Cria usuário no Supabase Auth (se novo)
5. Ativa `profiles.access_active = true`
6. Envia e-mail Resend com login, senha e magic link
7. Registra em `webhook_events`

## Fallback (polling)

Se o webhook falhar, o frontend faz polling em `/api/checkout/status/{correlation_id}`.
Quando o status OpenPix é `COMPLETED`, o backend ativa o acesso automaticamente.

## Ativação manual de emergência

Por e-mail (sem pedido OpenPix):

```bash
python3 backend/scripts/activate_customer.py email@cliente.com --name "Nome"
```

Por pedido OpenPix (correlation_id):

```bash
python3 backend/scripts/fulfill_openpix_order.py <correlation_id>
```

## Verificar pedido

```sql
SELECT * FROM orders WHERE customer_email = 'email@cliente.com' ORDER BY created_at DESC;
SELECT * FROM webhook_events WHERE email = 'email@cliente.com' ORDER BY created_at DESC;
```
