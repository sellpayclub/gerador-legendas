# Manutenção VPS — ClipSaaS

Referência para deploy e ajustes na produção hosted.

## Produção

| Item | Valor |
|------|-------|
| **URL** | https://app.clipsaas.site |
| **VPS IP** | `161.97.79.7` |
| **SSH** | `root@161.97.79.7` |
| **Código na VPS** | `/opt/legendas-locais` |
| **GitHub** | https://github.com/sellpayclub/gerador-legendas |
| **Dados (jobs/vídeos)** | `/opt/legendas-locais/data/jobs/` (TTL 24h) |

## Arquitetura

```
Internet → Traefik Docker (:443, Let's Encrypt)
              └─ legendas_legendas-proxy (nginx:alpine)
                    ├─ /api/*       → FastAPI :8000 (systemd legendas-backend)
                    ├─ /webhooks/*  → FastAPI :8000
                    └─ /*           → Next.js :3000 (systemd legendas-frontend)
```

- **SSL:** Traefik (`traefik_traefik` stack) — certificado automático para `app.clipsaas.site`
- **Proxy nginx:** `deploy/legendas-nginx.conf` (bind-mount no container Swarm)
- **Stack Swarm:** `deploy/legendas-stack.yaml` (gerado de `legendas-stack.template.yaml`)
- **Caddy:** desativado na VPS (porta 443 usada pelo Traefik)

### Limite de upload

- **Máximo:** sem limite fixo no nginx (`client_max_body_size 0` = só limitado pelo disco)
- **Timeout:** 7200s (2h) no nginx para uploads lentos
- **Streaming:** Traefik **sem** middleware de buffering (pass-through); nginx usa `proxy_request_buffering off` em `/api/`
- **`responseForwarding.flushInterval=100ms`** no service Traefik — envia dados ao nginx em streaming (mantido)
- **Não usar** `serversTransport` via labels Docker — quebra roteamento (404). Timeouts Traefik→nginx ficam no nginx (7200s em `/api/`)
- **Disco:** manter ≥ 30 GB livres em `/` para uploads simultâneos (jobs apagados em 24h)

## Credenciais

- **`backend/.env`** — Supabase, Resend, Cakto, `MULTI_TENANT=true` (nunca no git)
- **`frontend/.env.local`** — Supabase anon key, `NEXT_PUBLIC_MULTI_TENANT=true`
- Copie `deploy/vps.env.example` → `deploy/vps.local.env` localmente (gitignored)

## Comandos úteis

```bash
systemctl status legendas-backend legendas-frontend
docker service ls | grep legendas
curl -s http://127.0.0.1:8000/api/health
curl -sk -o /dev/null -w "%{http_code}\n" https://app.clipsaas.site/api/health

journalctl -u legendas-backend -f
journalctl -u legendas-frontend -f
docker service logs legendas_legendas-proxy -f

systemctl restart legendas-backend legendas-frontend
```

## Redeploy proxy (após mudar nginx ou Traefik labels)

```bash
cd /opt/legendas-locais/deploy
export DOMAIN=app.clipsaas.site
envsubst '${DOMAIN}' < legendas-stack.template.yaml > legendas-stack.yaml
docker stack deploy -c legendas-stack.yaml legendas
docker service update --force legendas_legendas-proxy
```

### Traefik — timeout HTTPS para uploads longos

O entrypoint `websecure` (:443) precisa de timeout longo (7200s) para uploads grandes:

```bash
bash /opt/legendas-locais/deploy/update-traefik-upload-timeouts.sh
```

Isso edita `/root/traefik.yaml` e roda `docker stack deploy` (método seguro).
**Nunca** use `docker service update --args` no Traefik — sobrescreve todos os argumentos e derruba o site.

## Atualizar código

```bash
ssh root@161.97.79.7 'cd /opt/legendas-locais && git pull origin main && bash deploy/setup.sh --update'
```

## DNS

```bash
dig +short app.clipsaas.site
# → 161.97.79.7
```

## Troubleshooting

| Problema | Ação |
|----------|------|
| Site 502 | `systemctl restart legendas-backend legendas-frontend` |
| **413 Request Entity Too Large** | Verificar middleware de buffering no Traefik (não usar). Redeploy proxy com `legendas-nginx.conf` (`client_max_body_size 0`). Teste: POST 2+ GB sem auth deve dar **401**, não 413. |
| **502 em upload grande** | Traefik `websecure` precisa `readTimeout`/`idleTimeout` 7200s (`/root/traefik.yaml` ou `update-traefik-upload-timeouts.sh`) |
| SSL falhou | Conferir DNS A record → 161.97.79.7 |
| Login Supabase falha | Redirect URL `https://app.clipsaas.site/auth/callback` no painel Supabase |
| Webhook Cakto 403 | Webhook agora é **Supabase Edge Function** — secret deve estar em Supabase Dashboard → Edge Functions → Secrets (`CAKTO_WEBHOOK_SECRET`), igual ao painel Cakto. URL: `https://lcbczyzedluaoxtuajoz.supabase.co/functions/v1/cakto-webhook` |
| Webhook VPS 410 | Endpoint antigo `/webhooks/cakto` desativado de propósito — use só a URL Supabase |
| E-mail não chega | Conferir secrets `RESEND_API_KEY` e `RESEND_FROM_EMAIL` na Edge Function; ver tabela `webhook_events` no Supabase |
| Upload grande timeout | nginx/Traefik timeout 7200s (2h); conexão lenta em arquivos multi-GB pode levar >1h |

## Instruções para agente Cursor

1. Ler este arquivo e `DEPLOY-HOSTED.md`
2. SSH: `root@161.97.79.7`
3. Editar em `/opt/legendas-locais` ou push + pull na VPS
4. Rodar `bash deploy/setup.sh --update` após mudanças de código
5. Verificar: `curl -sk https://app.clipsaas.site/api/health`
6. **Nunca** commitar `.env`, chaves ou `data/jobs/`
