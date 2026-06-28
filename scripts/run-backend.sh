#!/bin/bash
# Inicia o backend (FastAPI/uvicorn). Usado pelo serviço do macOS (launchd).
cd /Users/dannmacbook/legendas-locais/backend || exit 1
export PATH="/opt/homebrew/opt/ffmpeg-full/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec .venv/bin/python -m uvicorn main:app --port 8000 --host 127.0.0.1
