# Instalação para compradores — Legendas Locais

Guia para quem comprou o código e vai instalar no **Mac** ou em **VPS Ubuntu**.

## O que você precisa

- Conta OpenAI com API key ([platform.openai.com](https://platform.openai.com))
- **Mac:** macOS com Apple Silicon (opcional MLX local) ou Intel
- **VPS:** Ubuntu 22.04+, 2 GB+ RAM, ffmpeg com libass, Node 20+

Recomendamos **OpenAI** para tudo (Whisper + GPT): uma chave, custo baixo, funciona igual no Mac e na VPS.

---

## Mac (uso local)

```bash
cd ~
git clone SEU_REPOSITORIO legendas-locais
cd legendas-locais
bash scripts/instalar-mac.sh
```

Abra **http://localhost:3000/configuracoes** e cole sua API key OpenAI.

Controle diário:

```bash
./legendas.sh status
./legendas.sh reiniciar
./legendas.sh logs
```

> Não coloque o projeto na Área de Trabalho (Desktop) — o macOS bloqueia serviços em background.

---

## VPS Ubuntu

### 1. DNS

Aponte seu domínio (ex. `legendas.seudominio.com`) para o IP da VPS.

### 2. Clone e deploy

```bash
ssh root@SEU_IP
git clone SEU_REPOSITORIO /opt/legendas-locais
cd /opt/legendas-locais
DOMAIN=legendas.seudominio.com bash deploy/setup.sh
```

O script instala dependências, compila o frontend, sobe systemd e (se Docker Swarm + Traefik existirem) publica o site em HTTPS.

### 3. Configure a OpenAI

Abra **https://legendas.seudominio.com/configuracoes**:

1. Cole a API key (`sk-...`)
2. Motor de transcrição: **OpenAI Whisper** (obrigatório na VPS)
3. Domínio público: `https://legendas.seudominio.com`
4. Salvar → Testar conexão

Alternativa: editar `/opt/legendas-locais/backend/.env` (a UI tem prioridade após salvar em `data/app-settings.json`).

### 4. Verificar

```bash
curl -s http://127.0.0.1:8000/api/health
curl -sk https://legendas.seudominio.com/api/health
```

Resposta esperada: `"openai_configured": true` após configurar a chave.

---

## Modelos recomendados

| Função | Modelo padrão |
|--------|----------------|
| Transcrição | `whisper-1` (OpenAI) |
| Detecção de cortes | `gpt-5.5` |
| Keywords / enrich | `gpt-4o-mini` |

Ajuste tudo em **Configurações** sem editar código.

---

## Por que deu erro na VPS?

| Sintoma | Causa comum | Solução |
|---------|-------------|---------|
| Site não abre no domínio | Traefik com domínio errado | Rode deploy com `DOMAIN=seu.dominio.com` |
| API/CORS falha | Origins desatualizados | Preencha domínio em Configurações |
| Transcrição falha | Sem API key ou MLX no Linux | Use OpenAI Whisper + chave válida |
| 502 no upload | Timeout proxy | Atualize código e `bash deploy/setup.sh --update` |
| Render falha | ffmpeg sem libass | `ffmpeg -filters \| grep ass` deve listar `ass` |

---

## Atualizar versão

```bash
cd /opt/legendas-locais   # ou ~/legendas-locais no Mac
git pull
bash deploy/setup.sh --update          # VPS
# ou
./legendas.sh atualizar                # Mac
```

---

## Arquivos importantes

| Caminho | Descrição |
|---------|-----------|
| `data/app-settings.json` | Config salva pela UI (não commitar) |
| `backend/.env` | Fallback / bootstrap |
| `data/jobs/` | Vídeos e trabalhos (faça backup) |

---

## Suporte técnico (Traefik / Docker)

Se sua VPS já usa Traefik + Swarm com rede externa `clonefy`, o `setup.sh` gera automaticamente o stack com seu `DOMAIN`.

Sem Traefik: use `deploy/nginx.conf` como referência para nginx + certbot na VPS.
