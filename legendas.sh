#!/bin/bash
# ============================================================
#  Gerador de Legendas - controle simples
#  Uso:  ./legendas.sh [ligar|desligar|reiniciar|status|atualizar|logs]
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LA="$HOME/Library/LaunchAgents"
B="com.legendas.backend"
F="com.legendas.frontend"
PB="$LA/$B.plist"
PF="$LA/$F.plist"

ok()   { printf "\033[32m%s\033[0m\n" "$1"; }
info() { printf "\033[36m%s\033[0m\n" "$1"; }
warn() { printf "\033[33m%s\033[0m\n" "$1"; }

NODE_PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"

rebuild_frontend_if_stale() {
  local fe="$ROOT/frontend"
  info "Compilando frontend..."
  (cd "$fe" && export PATH="$NODE_PATH" BACKEND_URL="http://127.0.0.1:8000" && npm run build)
}

ligar() {
  mkdir -p "$ROOT/logs"
  launchctl unload "$PB" 2>/dev/null
  launchctl unload "$PF" 2>/dev/null
  launchctl load -w "$PB"
  launchctl load -w "$PF"
  info "Iniciando... aguarde alguns segundos."
  sleep 6
  status
}

desligar() {
  launchctl unload "$PB" 2>/dev/null
  launchctl unload "$PF" 2>/dev/null
  ok "Desligado. A aplicacao nao vai mais subir sozinha ate voce rodar: ./legendas.sh ligar"
}

reiniciar() {
  rebuild_frontend_if_stale
  # Recarrega frontend para garantir scripts atualizados (evita next start stale).
  launchctl unload "$PF" 2>/dev/null || true
  launchctl load -w "$PF" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/$B" 2>/dev/null || launchctl load -w "$PB" 2>/dev/null
  launchctl kickstart -k "gui/$(id -u)/$F" 2>/dev/null || launchctl load -w "$PF" 2>/dev/null
  info "Reiniciando..."
  sleep 6
  status
}

status() {
  local bcode fcode
  bcode=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null)
  fcode=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
  if [ "$bcode" = "200" ]; then ok "Backend  ON  (http://localhost:8000)"; else warn "Backend  OFF (codigo: ${bcode:-sem resposta})"; fi
  if [ "$fcode" = "200" ]; then ok "Frontend ON  (http://localhost:3000)"; else warn "Frontend OFF (codigo: ${fcode:-sem resposta})"; fi
  if [ "$bcode" = "200" ] && [ "$fcode" = "200" ]; then
    echo ""
    ok ">> Tudo pronto! Abra: http://localhost:3000"
  else
    echo ""
    warn "Se ficou OFF, veja os logs:  ./legendas.sh logs"
  fi
}

atualizar() {
  info "Baixando atualizacoes do GitHub..."
  cd "$ROOT" || exit 1
  git pull origin main || { warn "Falha no git pull"; exit 1; }
  info "Atualizando dependencias do backend..."
  (cd "$ROOT/backend" && source .venv/bin/activate && pip install -q -e .)
  info "Recompilando o frontend..."
  (cd "$ROOT/frontend" && export PATH="$NODE_PATH" && npm install --silent && npm run build)
  mkdir -p "$ROOT/frontend/.next/standalone/.next"
  cp -r "$ROOT/frontend/.next/static" "$ROOT/frontend/.next/standalone/.next/static"
  if [[ -d "$ROOT/frontend/public" ]]; then
    rm -rf "$ROOT/frontend/.next/standalone/public"
    cp -r "$ROOT/frontend/public" "$ROOT/frontend/.next/standalone/public"
  fi
  reiniciar
  ok "Atualizado!"
}

logs() {
  info "Mostrando logs (Ctrl+C para sair)..."
  touch "$ROOT/logs/backend.log" "$ROOT/logs/frontend.log"
  tail -n 40 -f "$ROOT/logs/backend.log" "$ROOT/logs/frontend.log"
}

case "${1:-status}" in
  ligar|start|on)        ligar ;;
  desligar|stop|off)     desligar ;;
  reiniciar|restart)     reiniciar ;;
  status|st)             status ;;
  atualizar|update)      atualizar ;;
  logs|log)              logs ;;
  *)
    echo "Uso: ./legendas.sh [ligar|desligar|reiniciar|status|atualizar|logs]"
    ;;
esac
