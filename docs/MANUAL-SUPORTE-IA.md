# Manual de Suporte IA — ClipSaaS

> **Documento de base de conhecimento** para IA de suporte ao cliente.  
> Produto: **ClipSaaS — Gerador de Legendas**  
> URL oficial: **https://app.clipsaas.site**  
> Idioma do manual: português (Brasil).  
> Última revisão alinhada ao produto em julho/2026.

---

## Índice

1. [Identidade do produto](#1-identidade-do-produto)
2. [Primeiro acesso (pós-compra)](#2-primeiro-acesso-pós-compra)
3. [Tela inicial — enviar vídeo](#3-tela-inicial--enviar-vídeo)
4. [Modo Legendas — editor](#4-modo-legendas--editor)
5. [Renderização — legendas](#5-renderização--legendas)
6. [Modo Cortes — wizard de 3 passos](#6-modo-cortes--wizard-de-3-passos)
7. [Configurações](#7-configurações)
8. [Aulas](#8-aulas)
9. [Idioma da interface](#9-idioma-da-interface)
10. [FAQ e erros comuns](#10-faq-e-erros-comuns)
11. [Instruções para a IA de suporte](#11-instruções-para-a-ia-de-suporte)

---

## 1. Identidade do produto

### O que é o ClipSaaS

O **ClipSaaS** é uma ferramenta online (SaaS) para criadores de conteúdo que:

- **Transcreve** vídeos automaticamente (palavra por palavra, com timestamps).
- **Gera legendas estilizadas** (karaoke, cores, animações, templates virais).
- **Detecta cortes virais** com inteligência artificial em vídeos longos.
- **Exporta MP4** prontos para Instagram, TikTok, YouTube Shorts etc.

O cliente acessa pelo navegador em **https://app.clipsaas.site**. Não precisa instalar programa no computador (diferente da versão “Legendas Locais” para Mac, que é outro produto).

### Dois modos de uso

| Modo | Para quê | Resultado |
|------|----------|-----------|
| **Legendas** | Vídeo inteiro com legenda queimada | 1 MP4 legendado |
| **Cortes** | Vídeos longos (podcasts, aulas, lives) | Vários MP4s curtos (trechos virais) com legenda |

### Requisitos do cliente

Para usar a ferramenta, o cliente precisa de:

1. **Conta** no ClipSaaS (e-mail + senha).
2. **Plano ativo** (compra confirmada).
3. **Chave API da OpenAI** (`sk-...`) configurada em **Configurações**.

**Importante sobre a OpenAI:** o ClipSaaS usa a chave **do próprio cliente** (modelo BYOK — “Bring Your Own Key”). A cobrança de transcrição, detecção de cortes e outras funções de IA vai **direto na conta OpenAI do cliente**, não na fatura do ClipSaaS.

### O que o cliente recebe após a compra

Após pagamento confirmado (PIX), o cliente recebe um **e-mail** com:

- **Login (e-mail)** e **senha** de acesso.
- Link para entrar em **https://app.clipsaas.site/login**.
- Opcionalmente, link de acesso rápido (magic link).
- **Anexo 1:** Manual de Instalação (PDF) — passo a passo da ferramenta.
- **Anexo 2:** Ebook bônus *Guia: Como Ganhar Dinheiro com Cortes Virais* (PDF).

### Preços atuais (checkout)

| Item | Valor |
|------|-------|
| **ClipSaaS — Gerador de Legendas** (produto principal) | R$ 97,00 |
| Order bump: Suporte WhatsApp | R$ 9,90 |
| Order bump: Atualizações Futuras | R$ 19,90 |

Pagamento via **PIX** no checkout: **https://app.clipsaas.site/checkout**

### Como comprar (checkout — 3 passos)

1. **Dados** — Nome, WhatsApp, e-mail → botão **Continuar →**
2. **Ofertas** — Produto principal + order bumps opcionais → **Continuar para pagamento →**
3. **Pagamento** — CPF → **Gerar PIX** → escanear QR Code (validade 5 minutos) → aguardar confirmação → página de confirmação

Após pagamento aprovado, o acesso é liberado por e-mail (ver capítulo 2).

---

## 2. Primeiro acesso (pós-compra)

### Fluxo recomendado (ordem exata)

```
Compra no checkout (PIX)
    ↓
E-mail com login e senha (+ PDFs anexos)
    ↓
Login em /login
    ↓
Configurações → colar chave OpenAI → Testar conexão → Salvar chave
    ↓
Página inicial → enviar primeiro vídeo
```

### Passo 1 — Conferir o e-mail

1. Pedir ao cliente para verificar **caixa de entrada** e **spam/lixo eletrônico**.
2. Assunto típico: *"Acesso liberado — ClipSaaS"* (ou nome do produto).
3. Anotar **e-mail de login** e **senha** enviados no corpo do e-mail.

### Passo 2 — Fazer login

1. Abrir **https://app.clipsaas.site/login**
2. Informar **e-mail** e **senha** recebidos.
3. Clicar em **Entrar**.
4. Se houver erro: conferir se digitou e-mail e senha corretamente (copiar/colar ajuda).

### Passo 3 — Esqueci a senha

1. Em **https://app.clipsaas.site/login**, clicar em **Esqueci minha senha**.
2. Informar o e-mail cadastrado.
3. Clicar em **Enviar link**.
4. Abrir o link recebido no e-mail (pode ir para spam).
5. Na tela **Definir nova senha** (`/auth/atualizar-senha`):
   - Nova senha (mínimo 6 caracteres).
   - Confirmar nova senha.
   - Clicar em **Salvar senha**.
6. Após salvar, o sistema redireciona para a página inicial.

### Passo 4 — Configurar chave OpenAI (obrigatório)

1. No menu superior, clicar em **Configurações** (ou abrir **https://app.clipsaas.site/configuracoes**).
2. Na seção **API Key OpenAI**, colar a chave que começa com **`sk-...`**
   - Criar em: **https://platform.openai.com** (conta OpenAI + billing ativo).
3. Clicar em **Testar conexão** — deve aparecer sucesso.
4. Clicar em **Salvar chave**.
5. Se não souber como pegar a chave: ir em **Aulas** → **Aula 01 — Como pegar sua chave API da OpenAI**.

### Passo 5 — Plano inativo (`/plano-inativo`)

Se o cliente vê a tela **Plano inativo**:

- **Significado:** a conta existe, mas o upload/processamento ainda não foi liberado.
- **Causas comuns:** pagamento ainda não confirmado; e-mail de acesso ainda não chegou; comprou com e-mail diferente do cadastro.
- **O que orientar:**
  1. Aguardar alguns minutos após o PIX e conferir e-mail (incluindo spam).
  2. Usar o **mesmo e-mail** da compra no login.
  3. Mesmo com plano inativo, pode **configurar a chave OpenAI** em Configurações (botão **Configurar chave OpenAI** na tela).
  4. Se passou **30 minutos** após pagamento confirmado e ainda sem acesso → escalar para suporte humano.

### Cadastro sem compra (`/signup`)

- Contas criadas manualmente em **Criar conta** ficam **inativas** até confirmação de pagamento.
- Orientar: concluir compra no checkout ou aguardar liberação se já pagou.

---

## 3. Tela inicial — enviar vídeo

**URL:** **https://app.clipsaas.site/** (página inicial após login)

### Elementos da tela

#### Banner de aviso (se aplicável)

| Banner | Significado | Ação |
|--------|-------------|------|
| Plano inativo | Upload bloqueado | Concluir compra / aguardar e-mail |
| Configure OpenAI | Chave não cadastrada | Ir em **Configurações** |
| Aulas | Dica para iniciantes | Ver **Aula 01** |

#### Modo

Escolher **antes** do upload:

| Botão | Uso |
|-------|-----|
| **Legendas** | Transcrever, estilizar e exportar vídeo inteiro com legenda |
| **Cortes** | IA encontra trechos virais e exporta vários MP4s |

#### Idioma do áudio

Opções: **Detectar automaticamente**, Português, Inglês, Espanhol, Francês, Italiano, Alemão.

- Para **Cortes**, o ideal é vídeos de **10 a 60 minutos** com fala clara.
- Escolher o idioma correto melhora a transcrição.

#### Upload de vídeo

- **Arrastar** o arquivo para a área indicada **ou** **clicar** para escolher.
- **Formatos aceitos:** MP4, MOV, MKV, AVI, WebM, M4V.
- **Tamanho máximo:** 2 GB por arquivo.
- Durante envio: barra *"Enviando vídeo..."*.

#### Após upload bem-sucedido

| Modo escolhido | Para onde vai |
|----------------|---------------|
| Legendas | Editor → `/editor/{id}` |
| Cortes | Wizard de cortes → `/cortes/{id}` |

### Projetos recentes

Painel **Seus projetos** na parte inferior:

- **Filtros:** Todos | Prontos | Em andamento.
- **Botão Atualizar** para recarregar lista.
- Por projeto:
  - **Continuar** / **Abrir** — retomar edição.
  - **Baixar MP4** — quando render concluído (modo Legendas).
  - **Ver render** — página de progresso/download.
  - **Apagar** — remove vídeo e arquivos (confirmação: *"Apagar este vídeo e seus arquivos? Esta ação não pode ser desfeita."*).

### Retenção de arquivos (importante)

Na versão online (ClipSaaS), **vídeos e projetos são apagados automaticamente após 24 horas**.

- Orientar o cliente a **baixar os MP4s** assim que ficarem prontos.
- Se o projeto “sumiu”, provavelmente passou o prazo — é necessário enviar o vídeo de novo.

---

## 4. Modo Legendas — editor

**URL:** `https://app.clipsaas.site/editor/{id}`

### Layout da tela

- **Esquerda:** preview do vídeo com legendas ao vivo.
- **Direita:** painel com abas (Template, Destaques, Estilo, Transcrição).
- **Rodapé:** botão **Renderizar vídeo**.

### Overlay de processamento (antes de editar)

Enquanto o vídeo processa, uma tela bloqueia a edição. Etapas exibidas:

1. **Na fila**
2. **Extraindo áudio...**
3. **Áudio pronto — iniciando transcrição...**
4. **Transcrevendo com Whisper...**
5. **Transcrição concluída** → edição liberada

**Regra:** o cliente **não pode editar** texto/estilo até a transcrição terminar. Orientar: aguardar.

### Abas do editor (detalhamento)

#### Aba **Template**

**Para quê:** escolher formato visual do vídeo exportado (Reels, Instagram, Choquei etc.).

**Ações do cliente:**

1. Escolher um template na lista, por exemplo:
   - **Reels 9:16 (split topo/baixo)** — vídeo embaixo, espaço em cima para imagem/vídeo.
   - **Instagram 1:1 (quadrado)** — feed quadrado.
   - **Reels 9:16 (tela cheia)** — vertical sem overlay.
   - **Choquei (imagem em cima)** — estilo viral, imagem estática no topo.
   - **Choquei (vídeo em cima)** — estilo viral, vídeo loop no topo.
2. Escolher **resolução** de exportação: 480p, 720p ou 1080p (quando disponível).
3. **Enviar mídia de overlay** (obrigatório para templates Choquei e similares):
   - Imagem (PNG, JPG) ou vídeo curto no topo.
4. Ajustar posição do vídeo no template (quando aplicável).
5. Opcional: upload de **logo**.

**Erro comum:** tentar renderizar template Choquei **sem** enviar imagem/vídeo no topo → mensagem: *"Este template exige uma mídia (imagem/vídeo). Envie uma na aba Template."*

#### Aba **Destaques**

**Para quê:** frases ou palavras em destaque no centro do vídeo (efeito dramático/viral).

**Ações:**

1. Ligar/desligar o efeito de destaques.
2. Clicar em **Detectar com IA** para a IA sugerir palavras/frases.
3. Clicar manualmente nas palavras na lista para marcar/desmarcar.
4. Preview ao vivo no vídeo à esquerda.

**Erro comum:** destaques **ligados** mas nenhuma palavra marcada → ao renderizar: *"Ative frases de destaque na aba Destaques, ou desligue o efeito."*

#### Aba **Estilo**

**Para quê:** aparência das legendas (fonte, cores, animação, quantidade de palavras por linha).

**Ações:**

1. Escolher **preset** de estilo (visual pré-definido).
2. Ajustar:
   - Fonte e tamanho.
   - Cor do texto e contorno.
   - Animação (karaoke, pop etc.).
   - Palavras por linha.
3. **Arrastar a legenda** diretamente no preview do vídeo para mudar posição.
4. Alterações aparecem **ao vivo** no preview.

#### Aba **Transcrição**

**Para quê:** corrigir texto transcrito palavra por palavra.

**Ações:**

1. Editar texto de cada palavra (corrigir erros da IA).
2. **Buscar** palavra no texto.
3. Usar IA para **pontuação e emojis** (quando disponível).
4. **Clicar em uma palavra** → o vídeo pula para aquele momento (facilita revisão).

### Botão principal: **Renderizar vídeo**

Localização: rodapé do painel direito.

**Quando está habilitado:** transcrição concluída (`Transcrição concluída` / status *Em edição*).

**Quando está desabilitado:** ainda transcrevendo — texto *"Aguarde a transcrição terminar para habilitar o render."*

**Ao clicar:**

1. Sistema valida template e destaques.
2. Salva configurações.
3. Redireciona para **https://app.clipsaas.site/render/{id}**.

---

## 5. Renderização — legendas

**URL:** `https://app.clipsaas.site/render/{id}`

### Barra de progresso (4 fases)

1. **Transcrição**
2. **ASS** (geração do arquivo de legendas)
3. **Render** (FFmpeg processando vídeo)
4. **Download**

### Durante o processamento

- Título: *"Renderizando seu vídeo"*.
- Orientar: **não fechar a página** — o processamento continua no servidor.
- Botão **Voltar ao editor** disponível se quiser ajustar algo (render pode continuar em background).

### Quando concluído

- Mensagem: *"Vídeo legendado pronto!"*
- Preview do vídeo.
- Botões:
  - **Baixar MP4 legendado** — download do arquivo final.
  - **Novo vídeo** — volta à página inicial para outro projeto.

### Se der erro

- Aparece *"Erro ao renderizar:"* + mensagem.
- Botão **Voltar e tentar de novo** → retorna ao editor.
- Orientar: verificar template com mídia, chave OpenAI, ou tentar resolução menor.

---

## 6. Modo Cortes — wizard de 3 passos

**URL:** `https://app.clipsaas.site/cortes/{id}`

Barra superior com 3 etapas (clicáveis após concluídas):

| Passo | Nome | Descrição |
|-------|------|-----------|
| 1 | **Cortes** | Detectar e revisar trechos |
| 2 | **Legendas** | Estilo e texto |
| 3 | **Exportar** | Gerar e baixar MP4s |

---

### Passo 1 — Cortes

#### Antes de detectar

- O vídeo precisa ser **transcrito** (overlay *"Transcrevendo vídeo..."* se ainda processando).
- Vídeos longos: transcrição pode levar vários minutos.

#### Detectar cortes com IA

1. Clicar em **Detectar com IA** (botão principal na lista de cortes).
2. Aguardar — em vídeos longos pode levar **5 a 15 minutos**.
3. Overlay de progresso durante detecção.
4. Se servidor reiniciar no meio: clicar **Detectar com IA** novamente.

#### Lista de cortes sugeridos

Cada corte mostra:

- Título sugerido pela IA.
- Duração do trecho.
- Checkbox **Incluir na exportação** — marcar/desmarcar.
- Badge **Gancho imediato** (quando o corte começa com hook forte).
- **Ouvir trecho** — preview de áudio/vídeo daquele corte.
- **Remover corte** — excluir da lista.
- Setas para **reordenar** cortes.

#### Ajustar corte manualmente

No final da lista: seção **Ajustar corte** (expandir):

- Editar **título**.
- Ajustar **início** e **fim** (tempos em segundos).
- Útil para cortes com **gancho + corpo** (cold open).

#### Continuar

- Botão fixo no rodapé: **Continuar para legendas**.
- **Requisito:** pelo menos **1 corte** marcado para exportação.
- Contador: *"{N} de {total} selecionado(s) para exportar"*.

---

### Passo 2 — Legendas

Configuração **por corte** (seletor de corte no topo quando há vários).

#### Formato do vídeo

Opções em **Formato do vídeo**:

| Formato | Descrição |
|---------|-----------|
| **Original** | Proporção do vídeo de entrada |
| **9:16 Tela cheia** | Vertical com crop central (Reels/TikTok) |
| **Choquei (imagem)** | Imagem em cima, 70% vídeo embaixo |
| **Choquei (vídeo)** | Vídeo loop em cima, 70% embaixo |

Para formatos **Choquei**, o painel de composição pede:

- **Headline** (texto do topo).
- Upload de **imagem ou vídeo** de overlay.
- Barra de progresso estilo Instagram (opcional).
- Campos de estilo do cabeçalho.

#### Sub-abas (por corte)

| Aba | Função |
|-----|--------|
| **Estilo** | Fonte, cores, animação, posição da legenda |
| **Destaques** | Palavras/frases em destaque + **Detectar com IA** |
| **Texto** | Editar transcrição **deste corte** (sem enrich automático) |

#### Sincronizar legenda para todos

Botão **Sincronizar legenda para todos**:

- Copia **estilo** da legenda (fonte, cores, animação) para **todos os cortes**.
- **Não copia:** título, imagem de overlay, texto — ficam individuais por corte.

#### Continuar

- Botão rodapé: **Continuar para exportar**.

---

### Passo 3 — Exportar

Painel **Exportar cortes**:

Por corte:

| Estado | Botão |
|--------|-------|
| Não gerado | **Gerar MP4** |
| Pronto | **Baixar** |

Para todos de uma vez:

- **Gerar todos ({N})** — fila de renderização de todos os cortes selecionados.

**Dicas:**

- Pode voltar ao **Passo 2** para mudar formato antes de gerar.
- Cada corte gera um MP4 separado.
- Baixar assim que pronto (lembrete: retenção 24h).

Rodapé: **Novo vídeo** → página inicial.

---

## 7. Configurações

**URL:** **https://app.clipsaas.site/configuracoes**

### Seção Conta e senha

- Exibe e-mail logado.
- **Alterar senha** — abre fluxo de nova senha (mín. 6 caracteres).
- Link **Esqueci minha senha** se necessário.

### Seção OpenAI (API Key)

| Campo / botão | Função |
|---------------|--------|
| Campo **API Key OpenAI** | Colar chave `sk-...` |
| **Testar conexão** | Valida se a chave funciona |
| **Salvar chave** | Grava a chave (substitui anterior se já existir) |

**Mensagens:**

- *"Chave já configurada — cole uma nova para substituir"* — se já tem chave salva.
- *"Informe sua API key OpenAI."* — se tentar salvar vazio.
- Plano inativo: aviso *(plano inativo — upload bloqueado)* mas ainda pode salvar chave.

### Por que a OpenAI é necessária

Uma única chave cobre:

- Transcrição (Whisper).
- Detecção de cortes virais.
- Detecção de palavras-chave / destaques.
- Pontuação e emojis na transcrição.

Criar chave em: **https://platform.openai.com/api-keys**  
É necessário **crédito/saldo** na conta OpenAI.

### Link para Aulas

No topo ou no texto de ajuda: link **Aulas** → tutoriais em vídeo.

---

## 8. Aulas

**URL:** **https://app.clipsaas.site/aulas**

Tutoriais em vídeo (YouTube embutido).

### Aula 01 — Como pegar sua chave API da OpenAI

- **Título:** Como pegar sua chave API da OpenAI.
- **Conteúdo:** criar conta OpenAI, gerar API key, colar em Configurações.
- **Passos sugeridos após assistir:**
  1. Copiar chave `sk-...`.
  2. Abrir **Configurações**.
  3. Colar → **Testar conexão** → **Salvar chave**.
  4. Voltar à página inicial e enviar vídeo.

### Aula 02 — COMO USAR A FERRAMENTA

- **Título:** COMO USAR A FERRAMENTA.
- **Conteúdo:** tour completo — upload, transcrição, editor, estilo, render, download.
- **Passos sugeridos após assistir:**
  1. Enviar vídeo e aguardar transcrição.
  2. Ajustar texto, estilo e posição.
  3. **Renderizar vídeo**.
  4. **Baixar MP4 legendado**.

### Botões na página de aulas

- **Ir para Configurações**
- **Abrir no YouTube** (versão externa do vídeo)

---

## 9. Idioma da interface

No canto superior (menu / seletor de idioma):

| Opção | Idioma |
|-------|--------|
| 🇧🇷 | Português (padrão) |
| 🇪🇸 | Español |
| 🇺🇸 | English |

A preferência fica salva no navegador.

**Exceção:** a página de **checkout** (`/checkout`) permanece em **português** (funil de vendas BR).

---

## 10. FAQ e erros comuns

### Compra e acesso

| Problema | Causa provável | O que orientar |
|----------|----------------|----------------|
| Paguei PIX, não recebi e-mail | Atraso, spam, webhook | Aguardar 5–15 min; verificar spam; confirmar e-mail da compra; após 30 min → suporte humano |
| Não consigo fazer login | Senha errada, e-mail errado | Copiar e-mail/senha do e-mail de acesso; usar **Esqueci minha senha** |
| Tela "Plano inativo" | Conta sem liberação | Aguardar e-mail; usar mesmo e-mail da compra |
| Criei conta em /signup mas não uploada | Cadastro sem pagamento | Comprar no checkout ou aguardar liberação |

### OpenAI e configuração

| Problema | Causa provável | O que orientar |
|----------|----------------|----------------|
| Banner "Configure OpenAI" | Chave não salva | **Configurações** → colar `sk-...` → **Testar conexão** → **Salvar chave** |
| Teste de conexão falha | Chave inválida ou sem crédito | Gerar nova key em platform.openai.com; adicionar billing |
| Transcrição falha | Quota OpenAI, áudio ausente | Verificar saldo OpenAI; vídeo precisa ter faixa de áudio |

### Upload e arquivos

| Problema | Causa provável | O que orientar |
|----------|----------------|----------------|
| Formato não suportado | Extensão inválida | Usar MP4, MOV, MKV, AVI, WebM ou M4V |
| Arquivo muito grande | Limite 2 GB | Comprimir vídeo ou cortar em partes |
| Projeto sumiu | Retenção 24h | Baixar MP4s antes; reenviar vídeo se necessário |
| Upload bloqueado | Plano inativo ou sem OpenAI | Resolver acesso + chave OpenAI |

### Legendas (modo editor)

| Problema | Causa provável | O que orientar |
|----------|----------------|----------------|
| Não consigo editar | Ainda transcrevendo | Aguardar overlay *"Transcrevendo..."* terminar |
| Botão Renderizar desabilitado | Transcrição incompleta | Aguardar status *Transcrição concluída* |
| Erro template sem mídia | Choquei sem imagem | Aba **Template** → enviar imagem ou vídeo no topo |
| Erro destaques | Efeito ligado sem palavras | Marcar palavras em **Destaques** ou desligar efeito |
| Render demora muito | Vídeo longo / 1080p | Normal; não fechar página; tentar 720p |

### Cortes

| Problema | Causa provável | O que orientar |
|----------|----------------|----------------|
| "Detectar com IA" não acha cortes | Vídeo curto ou pouca fala | Ideal: 10–60 min com fala; tentar de novo |
| Detecção muito lenta | Vídeo longo | Normal 5–15 min; aguardar |
| Detecção interrompida | Reinício servidor | Clicar **Detectar com IA** novamente |
| Choquei export falha | Sem overlay | Passo 2 → enviar imagem/vídeo no formato Choquei |
| Continuar desabilitado | Nenhum corte selecionado | Marcar ≥1 corte em **Incluir na exportação** |

### Links rápidos para enviar ao cliente

| Página | URL |
|--------|-----|
| Login | https://app.clipsaas.site/login |
| Esqueci senha | https://app.clipsaas.site/login/esqueci-senha |
| Configurações | https://app.clipsaas.site/configuracoes |
| Aulas | https://app.clipsaas.site/aulas |
| Comprar | https://app.clipsaas.site/checkout |
| OpenAI (criar key) | https://platform.openai.com/api-keys |

---

## 11. Instruções para a IA de suporte

Esta seção define **como a IA deve se comportar** ao atender clientes do ClipSaaS.

### Tom e estilo

- Responder em **português brasileiro**, claro e amigável.
- Usar **passos numerados** quando explicar procedimentos.
- Citar **nomes exatos** de botões, abas e telas (ex.: *"Clique em Configurações → Salvar chave"*, não "vá nas configurações").
- Evitar jargão técnico (FFmpeg, webhook, Supabase, API REST) — falar em linguagem de usuário.
- Respostas objetivas; se o procedimento for longo, resumir primeiro e depois detalhar.

### O que a IA PODE fazer

- Explicar como usar Legendas e Cortes passo a passo.
- Orientar configuração da chave OpenAI (sem pedir a chave completa no chat).
- Indicar URLs corretas (login, configurações, aulas, checkout).
- Diagnosticar erros comuns usando a tabela do capítulo 10.
- Sugerir Aula 01 ou Aula 02 quando o cliente for iniciante.
- Lembrar sobre retenção de 24h e limite de 2 GB.

### O que a IA NÃO DEVE fazer

- **Nunca pedir** a senha completa da conta ClipSaaS ou a chave OpenAI completa (`sk-...`) no chat.
  - Orientar: *"Cole sua chave diretamente em Configurações no site — não envie aqui por segurança."*
- **Não prometer** prazos exatos de liberação de acesso após PIX (dizer "alguns minutos").
- **Não inventar** funcionalidades que não existem (ex.: upload ilimitado permanente, armazenamento na nuvem forever).
- **Não orientar** instalação Mac/VPS (produto local) — isso é outro produto; ClipSaaS é **100% online**.
- **Não compartilhar** detalhes internos (admin, servidores, tokens, webhooks).

### Quando escalar para suporte humano

Encaminhar para atendente humano quando:

1. **PIX pago há mais de 30 minutos** e cliente não recebeu e-mail de acesso (informar e-mail usado na compra).
2. **Erro de render** que persiste após 2 tentativas (template correto, OpenAI OK, vídeo < 2 GB).
3. **Cobrança indevida OpenAI** — orientar contato com OpenAI; ClipSaaS não controla fatura OpenAI.
4. **Reembolso ou cancelamento** — decisão comercial, não técnica.
5. Cliente reporta **bug claro** (tela em branco, erro 502 repetido) após passos básicos (limpar cache, outro navegador).

Frase sugerida: *"Vou encaminhar seu caso para nossa equipe. Por favor, informe o e-mail da compra e, se possível, descreva o que aparece na tela ou envie um print."*

### Fluxo de diagnóstico recomendado

Quando o cliente relata problema genérico ("não funciona"), perguntar **nesta ordem**:

1. Você já recebeu o e-mail de acesso e consegue entrar em **https://app.clipsaas.site/login**?
2. Sua chave OpenAI está salva em **Configurações** (Testar conexão OK)?
3. Qual **modo** está usando — **Legendas** ou **Cortes**?
4. Em que **etapa** parou (upload, transcrição, editor, render, export)?
5. Qual **mensagem de erro** aparece (copiar texto exato)?

### Glossário rápido (usar se cliente perguntar)

| Termo | Significado simples |
|-------|---------------------|
| **Transcrição** | Conversão do áudio em texto com tempos |
| **Render / Renderizar** | Processo de gerar o MP4 final com legendas |
| **Corte** | Trecho curto extraído de um vídeo longo |
| **Template / Choquei** | Layout visual estilo páginas de notícias virais |
| **Destaques** | Palavras/frases grandes no centro do vídeo |
| **BYOK** | Você usa sua própria chave OpenAI |
| **Bump** | Oferta extra opcional no checkout |

---

## Apêndice — Status do job (referência)

Status que o cliente pode ver durante processamento:

| Status | Significado para o cliente |
|--------|----------------------------|
| Na fila | Aguardando início |
| Extraindo áudio | Preparando áudio do vídeo |
| Transcrevendo | IA convertendo fala em texto |
| Em edição | Pronto para editar no editor |
| Gerando legendas | Criando arquivo de legenda |
| Renderizando | Gerando MP4 final |
| Pronto | Download disponível |
| Erro | Algo falhou — ver mensagem |

---

*Fim do manual. Documento pronto para colar na base de conhecimento da IA de suporte ClipSaaS.*
