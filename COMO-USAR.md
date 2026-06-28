# Gerador de Legendas — uso local no Mac

A aplicação roda 100% no seu Mac e fica **sempre online** nestas portas:

- Interface (use esta): **http://localhost:3000**
- Backend/API: http://localhost:8000

O projeto fica em `~/legendas-locais` (pasta pessoal). **Não mova para a área de trabalho (Desktop)** — o macOS bloqueia serviços em background lá.

## Já está ligado e sobe sozinho

Os serviços do macOS (launchd) sobem a aplicação **automaticamente quando você liga o Mac** e **reiniciam sozinhos se algo cair**. Você não precisa fazer nada no dia a dia: é só abrir http://localhost:3000.

## Comando de controle

No Terminal, dentro de `~/legendas-locais`:

```bash
cd ~/legendas-locais

./legendas.sh status       # ver se está online
./legendas.sh ligar        # ligar (e manter ligado sempre)
./legendas.sh desligar     # desligar de vez (não sobe mais sozinho)
./legendas.sh reiniciar    # reiniciar
./legendas.sh atualizar    # baixar atualização do GitHub e religar
./legendas.sh logs         # ver os logs (Ctrl+C para sair)
```

## Reinstalar do zero (se precisar)

Se um dia a pasta sumir ou você trocar de Mac:

```bash
cd ~
git clone https://github.com/sellpayclub/gerador-legendas.git legendas-locais
cd legendas-locais
# coloque a chave da OpenAI em backend/.env  (veja backend/.env.example)
bash scripts/instalar-mac.sh
```

O `instalar-mac.sh` cria o ambiente, compila, registra os serviços e deixa tudo online.

> Atenção: o arquivo `backend/.env` (com a sua `OPENAI_API_KEY`) **não** vai para o GitHub por segurança. Guarde essa chave em lugar seguro.
