# Manutenção VPS — Gerador de Legendas

Referência para deploy e ajustes futuros (humano ou agente Cursor).

## Produção atual

| Item | Valor |
|------|-------|
| **URL** | https://legendas.clonefyia.com |
| **VPS IP** | `161.97.79.7` |
| **SSH** | `root@161.97.79.7` |
| **Código na VPS** | `/opt/legendas-locais` |
| **GitHub** | https://github.com/sellpayclub/gerador-legendas |
| **Dados (jobs/vídeos)** | `/opt/legendas-locais/data/jobs/` |

## Arquitetura

```
Internet → Traefik (Docker :443) → legendas_legendas-proxy (nginx)
                                        ├─ /     → Next.js :3000 (systemd legendas-frontend)
                                        └─ /api  → FastAPI :8000 (systemd legendas-backend)
```

- **SSL:** Traefik + Let's Encrypt (não usar nginx do sistema — portas 80/443 já são do Traefik)
- **Stack Docker:** `legendas_legendas-proxy` via `deploy/legendas-stack.yaml`

## Credenciais

- **`backend/.env`** na VPS — `OPENAI_API_KEY`, `ALLOWED_ORIGINS` (nunca no git)
- **SSH:** configurar chave pública em `/root/.ssh/authorized_keys` (recomendado)
- Copie `deploy/vps.env.example` → `deploy/vps.local.env` localmente para referência do agente (gitignored)

## Comandos úteis na VPS

```bash
# Status
systemctl status legendas-backend legendas-frontend
docker service ls | grep legendas
curl -s http://127.0.0.1:8000/api/health
curl -sk -o /dev/null -w "%{http_code}\n" https://legendas.clonefyia.com/api/health

# Logs
journalctl -u legendas-backend -f
journalctl -u legendas-frontend -f
docker service logs legendas_legendas-proxy -f

# Reiniciar só os apps (sem rebuild)
systemctl restart legendas-backend legendas-frontend
```

## Atualizar código (fluxo padrão)

**1. Push no GitHub** (Mac ou CI):

```bash
git add -A && git commit -m "..." && git push origin main
```

**2. Na VPS — pull + rebuild:**

```bash
ssh root@161.97.79.7
cd /opt/legendas-locais
git pull origin main
bash deploy/setup.sh --update
```

Ou em uma linha:

```bash
ssh root@161.97.79.7 'cd /opt/legendas-locais && git pull origin main && bash deploy/setup.sh --update'
```

> `setup.sh --update` preserva `backend/.env` existente, rebuilda frontend, reinicia systemd e atualiza stack Traefik.

## Primeira vez: ligar VPS ao GitHub

Se `/opt/legendas-locais` ainda não for um clone git:

```bash
ssh root@161.97.79.7
cp /opt/legendas-locais/backend/.env /tmp/legendas.env.bak
rm -rf /opt/legendas-locais
git clone git@github.com:sellpayclub/gerador-legendas.git /opt/legendas-locais
cp /tmp/legendas.env.bak /opt/legendas-locais/backend/.env
bash /opt/legendas-locais/deploy/setup.sh --update
```

Para clone via HTTPS (sem chave deploy key na VPS):

```bash
git clone https://github.com/sellpayclub/gerador-legendas.git /opt/legendas-locais
```

## Instruções para agente Cursor

Ao pedir ajustes na VPS:

1. Ler este arquivo e `deploy/vps.local.env` (se existir no workspace do usuário)
2. SSH: `root@161.97.79.7`
3. Editar em `/opt/legendas-locais` **ou** editar local + push + `git pull` na VPS
4. Sempre rodar `bash deploy/setup.sh --update` após mudanças de código
5. Verificar: `curl -sk https://legendas.clonefyia.com/api/health`
6. **Nunca** commitar senhas, `.env` ou `data/jobs/`

## DNS

```bash
dig +short legendas.clonefyia.com
# → 161.97.79.7 (via CNAME server.clonefyia.com ou A direto)
```

## Troubleshooting rápido

| Problema | Ação |
|----------|------|
| Site 502 | `systemctl restart legendas-backend legendas-frontend` |
| SSL falhou | Conferir DNS; Traefik emite cert ao primeiro acesso HTTPS |
| Upload grande falha / **502 no upload** | Ver abaixo — Traefik timeout + proxy nginx |
| Jobs sumiram após restart | Backend rehydrata de `data/jobs/` no startup — conferir se pasta existe |
| Render falha | `ffmpeg -filters \| grep ass` na VPS — precisa libass |

### 502 no upload (vídeo grande)

1. Atualize o código e rode `bash deploy/setup.sh --update` (nginx + middleware Traefik).
2. Confira backend: `systemctl status legendas-backend` e `journalctl -u legendas-backend -n 50`.
3. Confira disco: `df -h /opt/legendas-locais/data`.
4. Se ainda falhar, aumente timeout do **Traefik** (entrypoint `websecure`) no `traefik.yml` da VPS:

```yaml
entryPoints:
  websecure:
    transport:
      respondingTimeouts:
        readTimeout: 0
        writeTimeout: 0
        idleTimeout: 3600s
```

5. Copie `deploy/traefik-dynamic-legendas.yml` para a pasta dynamic do Traefik e reinicie o Traefik.
