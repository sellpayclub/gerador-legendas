# Legendas Automáticas Estilo CapCut — Sistema Local

App web local (roda em `localhost`) para:

1. Fazer upload de um vídeo (5–30 min)
2. Transcrever a fala com timestamps por palavra (mlx-whisper, Apple Silicon)
3. Escolher estilo de legenda (presets CapCut + custom)
4. Posicionar a legenda arrastando no preview
5. Renderizar e baixar o MP4 legendado

Uso pessoal, single-user. Tudo roda na sua máquina — nenhum dado sai do computador.

## Pré-requisitos

- **macOS Apple Silicon** (M1/M2/M3/M4)
- **Python 3.13** — `brew install python@3.13`
  - Não use 3.14 (pydantic-core ainda não está estável no 3.14)
- **Node.js 20+** — `brew install node@20` (ou use `nvm`)
- **FFmpeg com libass** — instale **`ffmpeg-full`** (não o `ffmpeg` regular):

  ```bash
  brew install ffmpeg-full
  ```

  > O `ffmpeg` regular do Homebrew **não** inclui `libass`, que é necessário
  > para renderizar legendas ASS com efeito karaoke (`\kf`). O backend
  > detecta automaticamente o binário em `/opt/homebrew/opt/ffmpeg-full/bin/`.

- **OpenAI API key** (opcional mas recomendado — muito mais rápido que o Whisper local):
  - Crie uma chave em <https://platform.openai.com/api-keys>
  - Coloque em `backend/.env`:
    ```
    OPENAI_API_KEY=sk-...
    TRANSCRIBE_ENGINE=openai
    ```
  - Sem a chave, o sistema usa `mlx-whisper` local automaticamente

Verifique:

```bash
python3.13 --version
node --version
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -filters | grep " ass "
# deve mostrar:  .. ass               V->V       Render ASS subtitles ...
```

## Instalação

### Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e .
```

> Se for usar a OpenAI (recomendado), coloque sua API key em `backend/.env`:
> ```
> OPENAI_API_KEY=sk-...
> TRANSCRIBE_ENGINE=openai
> ```
> O `.env` já está no `.gitignore` — não será commitado.
>
> Se for usar Whisper local, na **primeira transcrição** o `mlx-whisper` baixa
> o modelo (~470 MB para `medium-4bit`) para `~/.cache/huggingface`.

### Frontend

```bash
cd frontend
npm install
```

## Como rodar

Em dois terminais:

**Terminal 1 — backend:**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Abra <http://localhost:3000>.

## Uso

1. **Upload** — arraste o vídeo MP4/MOV (até ~2 GB)
2. Aguarde a transcrição (~2–4 min para 30 min de vídeo)
3. **Editor**:
   - Aba **Estilo**: escolha um preset (CapCut Amarelo, Ciano, Minimalista, YouTube) ou ajuste cores/fonte/tamanho/outline/animação manualmente
   - Aba **Transcrição**: corrija palavras erradas; clique numa palavra para o vídeo pular até ela
   - Arraste a legenda no preview para posicionar
4. **Renderizar** → acompanhe o progresso (FFmpeg + `h264_videotoolbox`, ~1–3 min)
5. **Baixar MP4** legendado

## Performance esperada (Mac M-series, vídeo 30 min 1080p)

| Etapa                  | Tempo       |
| ---------------------- | ----------- |
| Upload + extração áudio | 10–20 s     |
| Transcrição OpenAI API  | 10–30 s     |
| Transcrição mlx-whisper | 2–4 min     |
| Geração ASS             | <1 s        |
| Render FFmpeg (HW)      | 1–3 min     |
| **Total (OpenAI)**     | **2–4 min** |
| **Total (mlx)**        | **5–8 min** |

## Modelo de transcrição

Por padrão usa `mlx-community/whisper-medium-mlx-4bit` (~470 MB). Para mudar:

```bash
export WHISPER_MODEL="mlx-community/whisper-large-v3-turbo"
```

Opções populares:
- `mlx-community/whisper-medium-mlx-4bit` — equilíbrio velocidade/qualidade
- `mlx-community/whisper-large-v3-turbo` — melhor qualidade, mais lento
- `mlx-community/whisper-small-mlx` — mais rápido, menos preciso

## Estrutura

```
legendas-locais/
├── backend/      # FastAPI + mlx-whisper + FFmpeg
├── frontend/     # Next.js + Tailwind
└── data/jobs/    # arquivos por job (input, words.json, captions.ass, output.mp4)
```

Jobs antigos (mais de 7 dias) são apagados automaticamente no startup do backend.

## Deploy VPS (produção)

O app pode rodar em um VPS Ubuntu com frontend + backend + FFmpeg no mesmo servidor.
A instância de produção atual usa **Traefik** (Docker Swarm) para HTTPS — a VPS já tinha Traefik nas portas 80/443, então o roteamento passa por um proxy nginx no Swarm em vez de nginx do sistema.

### Pré-requisitos

- VPS Ubuntu 22.04+ (ex.: 2 vCPU, 4 GB RAM)
- Domínio apontando para o IP da VPS
- Chave OpenAI em `backend/.env`

### DNS

O domínio precisa resolver para o IP da VPS:

```bash
dig +short legendas.clonefyia.com
# deve retornar o IP da VPS (ex.: 161.97.79.7)
```

**Opção A — registro A (recomendado):**
```
legendas.seudominio.com  →  A  →  IP_DA_VPS
```

**Opção B — CNAME:**
```
legendas.seudominio.com  →  CNAME  →  server.seudominio.com
```
O hostname alvo do CNAME também precisa ter registro A apontando para a VPS.

### GitHub → VPS

Repositório: **https://github.com/sellpayclub/gerador-legendas**

Manutenção detalhada (SSH, logs, update): [`deploy/MANUTENCAO.md`](deploy/MANUTENCAO.md)

1. Clone ou pull na VPS em `/opt/legendas-locais` (sem `.env`, sem `data/jobs/` no git):

   ```bash
   git clone git@github.com:sellpayclub/gerador-legendas.git /opt/legendas-locais
   ```

2. Configure `backend/.env` (copie de `backend/.env.example`):

   ```
   OPENAI_API_KEY=sk-...
   TRANSCRIBE_ENGINE=openai
   ALLOWED_ORIGINS=https://legendas.clonefyia.com
   ```

3. Rode o bootstrap:

   ```bash
   bash /opt/legendas-locais/deploy/setup.sh
   ```

### Atualizar após mudanças no código

Push no GitHub, depois na VPS:

```bash
ssh root@161.97.79.7 'bash /opt/legendas-locais/deploy/update-from-git.sh'
```

Ou manualmente:

```bash
cd /opt/legendas-locais && git pull origin main && bash deploy/setup.sh --update
```

### Arquivos de deploy

| Arquivo | Função |
| -------- | ------ |
| `deploy/setup.sh` | Bootstrap e updates |
| `deploy/legendas-backend.service` | systemd — FastAPI |
| `deploy/legendas-frontend.service` | systemd — Next.js standalone |
| `deploy/legendas-stack.yaml` | Traefik + nginx proxy (HTTPS) |
| `deploy/legendas-nginx.conf` | Proxy `/` → :3000, `/api` → :8000 |

### Verificação pós-deploy

```bash
curl -s https://legendas.seudominio.com/api/health   # {"ok":true}
```

Teste o fluxo completo: upload → transcrever → editar → renderizar → baixar MP4.

Reinicie a VPS e confirme que jobs recentes ainda aparecem (rehydrate de `data/jobs/` no startup).

## Troubleshooting

- **`Could not load model` no mlx-whisper** → primeira execução baixa o modelo; verifique conexão e espaço em `~/.cache/huggingface`
- **`ffmpeg build lacks libass support`** → instale `brew install ffmpeg-full` (não o `ffmpeg` regular)
- **Legenda fora de posição** → confira se o vídeo está em tela cheia no preview antes de arrastar; o overlay usa `ResizeObserver` para mapear coords
- **Render lento** → verifique se `h264_videotoolbox` está disponível: `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -encoders | grep videotoolbox`. Se não, edite `backend/render.py` para usar `libx264 -preset veryfast -crf 20`
- **Caracteres acentuados não aparecem** → o `ass.py` escreve em UTF-8; se a fonte escolhida não tiver glifos, troque para uma com suporte a Latin Extended (Inter, Montserrat, Arial)
- **Python 3.14 + mlx-whisper com erro de wheel** → instale Python 3.13 com `brew install python@3.13` e use `python3.13 -m venv .venv`
