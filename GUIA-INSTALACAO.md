# Guia de instalação — Legendas Locais

Manual passo a passo para **iniciantes**. Você vai clonar o repositório, colar sua chave OpenAI e rodar **um comando** de instalação.

---

## Antes de começar

### O que você precisa

| Item | Obrigatório? | Onde conseguir |
|------|--------------|----------------|
| Conta OpenAI | **Sim** | [platform.openai.com](https://platform.openai.com) |
| Cartão na OpenAI | **Sim** | ~US$ 5 de crédito inicial costuma bastar para testes |
| Mac **ou** VPS | **Sim** | Mac = uso no seu computador; VPS = acesso pela internet |
| Domínio (só VPS) | **Sim na VPS** | Ex: `legendas.seudominio.com` no Registro.br, Cloudflare, etc. |

### O que o sistema faz

1. Você envia um vídeo
2. A OpenAI transcreve a fala (palavra por palavra)
3. Você escolhe estilo de legenda e exporta cortes
4. O sistema gera MP4 com legendas queimadas

> **Por que não é “só Vercel”?** Este app processa vídeos grandes com ffmpeg na sua máquina/servidor. Isso não cabe em hospedagem serverless como Vercel. O fluxo mais simples é: **clonar → colar chave → `bash install.sh`**.

---

## Passo 0 — Chave OpenAI (Mac e VPS)

1. Acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Clique em **Create new secret key**
3. Copie a chave (começa com `sk-...`) — ela só aparece uma vez
4. Guarde em um lugar seguro

---

## Opção A — Instalar no Mac (uso local)

Ideal para usar só no seu computador. Acesse em **http://localhost:3000**.

### A1. Instalar Homebrew (se ainda não tiver)

Abra o **Terminal** (Spotlight → digite “Terminal”) e cole:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Siga as instruções na tela. Depois feche e abra o Terminal de novo.

### A2. Clonar o repositório

```bash
cd ~
git clone https://github.com/sellpayclub/gerador-legendas.git legendas-locais
cd legendas-locais
```

> **Importante:** não clone na Área de Trabalho, Documentos ou Downloads — o macOS bloqueia serviços em background nessas pastas.

### A3. Configurar a chave OpenAI

```bash
cp .env.example backend/.env
nano backend/.env
```

No editor, encontre a linha `OPENAI_API_KEY=` e cole sua chave:

```
OPENAI_API_KEY=sk-sua-chave-aqui
```

Salve: `Ctrl+O`, Enter, `Ctrl+X`.

### A4. Rodar o instalador

```bash
bash install.sh
```

O script instala dependências (Python, Node, ffmpeg), compila o app e configura para iniciar automaticamente.

### A5. Configurar na interface

1. Abra **http://localhost:3000/configuracoes**
2. Cole a API key (se ainda não salvou pelo `.env`)
3. Clique **Testar conexão** → deve aparecer sucesso
4. Clique **Salvar**

### A6. Primeiro vídeo

1. Abra **http://localhost:3000**
2. Envie um vídeo curto (30 segundos) para testar
3. Aguarde a transcrição
4. Escolha estilo e exporte

### Comandos do dia a dia (Mac)

```bash
cd ~/legendas-locais

./legendas.sh status      # ver se está rodando
./legendas.sh reiniciar   # reiniciar após mudanças
./legendas.sh logs        # ver erros
./legendas.sh atualizar   # após git pull
```

---

## Opção B — Instalar na VPS (acesso pela internet)

Ideal para acessar de qualquer lugar com seu domínio, ex: **https://legendas.seudominio.com**.

### B1. Contratar VPS

- **Sistema:** Ubuntu 22.04 ou 24.04
- **RAM:** mínimo 2 GB (recomendado 4 GB)
- **Provedores comuns:** Hostinger, DigitalOcean, Contabo, Hetzner

Anote o **IP** da VPS (ex: `161.97.79.7`).

### B2. Apontar o DNS

No painel do seu domínio (Registro.br, Cloudflare, etc.):

| Tipo | Nome | Valor |
|------|------|-------|
| A | `legendas` (ou `@`) | IP da VPS |

Exemplo: `legendas.seudominio.com` → `161.97.79.7`

A propagação pode levar de 5 minutos a 24 horas.

### B3. Conectar na VPS (SSH)

No Mac, abra o Terminal:

```bash
ssh root@SEU_IP
```

Digite a senha quando pedir. Na primeira vez, confirme com `yes`.

> **O que é SSH?** É a forma de controlar o servidor Linux pelo terminal, como se estivesse “dentro” da máquina remota.

### B4. Clonar e configurar

```bash
git clone https://github.com/sellpayclub/gerador-legendas.git /opt/legendas-locais
cd /opt/legendas-locais
cp .env.example backend/.env
nano backend/.env
```

Cole sua chave OpenAI na linha `OPENAI_API_KEY=`.

Salve: `Ctrl+O`, Enter, `Ctrl+X`.

### B5. Rodar o instalador

```bash
bash install.sh
```

O script vai perguntar seu **domínio** (ex: `legendas.seudominio.com`). Depois instala tudo e configura HTTPS automaticamente (Caddy + Let's Encrypt).

### B6. Configurar na interface

1. Abra **https://legendas.seudominio.com/configuracoes**
2. **Testar conexão** → **Salvar**
3. Envie um vídeo curto de teste

### B7. Verificar se está funcionando

Na VPS:

```bash
curl -s http://127.0.0.1:8000/api/health
```

Deve retornar JSON com `"openai_configured": true` após configurar a chave.

---

## Atualizar para versão nova

```bash
cd ~/legendas-locais          # Mac
# ou
cd /opt/legendas-locais       # VPS

git pull
bash install.sh --update
```

---

## Solução de problemas

| Problema | Causa provável | O que fazer |
|----------|----------------|-------------|
| Site não abre (VPS) | DNS ainda propagando | Aguarde até 24h; teste `ping legendas.seudominio.com` |
| Site não abre (VPS) | Firewall | Libere portas **80** e **443** no painel da VPS |
| “Chave OpenAI não configurada” | Chave vazia ou inválida | Edite `backend/.env` ou use `/configuracoes` |
| Transcrição falha | Sem crédito na OpenAI | Adicione crédito em platform.openai.com/billing |
| Testar conexão falha | Chave errada ou expirada | Gere nova chave e salve de novo |
| 502 no upload de vídeo | Vídeo muito grande ou serviço parado | Reinicie: `systemctl restart legendas-backend legendas-frontend` (VPS) ou `./legendas.sh reiniciar` (Mac) |
| Render/export falha | ffmpeg sem libass | VPS: `ffmpeg -filters \| grep ass` deve listar `ass` |
| Mac: serviço não sobe | Projeto na Área de Trabalho | Mova para `~/legendas-locais` e rode `bash install.sh` de novo |

### Comandos de diagnóstico

**Mac:**
```bash
./legendas.sh status
./legendas.sh logs
curl -s http://127.0.0.1:8000/api/health
```

**VPS:**
```bash
systemctl status legendas-backend legendas-frontend caddy
journalctl -u legendas-backend -n 50 --no-pager
curl -s http://127.0.0.1:8000/api/health
```

---

## Backup

Seus vídeos e trabalhos ficam em:

```
data/jobs/
```

Faça backup periódico dessa pasta (copiar para outro disco ou nuvem).

---

## Checklist pós-instalação

Use esta lista para confirmar que tudo funciona antes de usar em produção:

- [ ] `/api/health` retorna `"ok": true`
- [ ] `/api/health` retorna `"openai_configured": true`
- [ ] Página `/configuracoes` → Testar conexão OK
- [ ] Upload de vídeo de 30 segundos funciona
- [ ] Transcrição completa sem erro
- [ ] Export de legenda ou corte gera MP4

---

## Infra avançada (opcional)

Se sua VPS **já usa Traefik + Docker Swarm** (ex: stack Clonefy), rode:

```bash
USE_TRAEFIK=true DOMAIN=legendas.seudominio.com bash deploy/setup.sh
```

Para a maioria dos compradores, o caminho padrão com **Caddy** (`bash install.sh`) é mais simples.

---

## Resumo em 3 passos

```bash
git clone https://github.com/sellpayclub/gerador-legendas.git legendas-locais
cd legendas-locais
cp .env.example backend/.env    # edite e cole OPENAI_API_KEY=sk-...
bash install.sh
```

Depois abra `/configuracoes`, teste e salve. Pronto.
