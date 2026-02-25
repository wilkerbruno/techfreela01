# ============================================================
# TechFreela — Dockerfile para Easypanel
# Contexto de build: raiz do repositório
# Arquivo em: backend/Dockerfile
# ============================================================

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=80

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    gcc \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Estrutura final no container:
#   /app/             ← raiz (index.html + assets/)
#   /app/backend/     ← Flask (app.py, models/)

WORKDIR /app

# Instala dependências Python
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r backend/requirements.txt && \
    pip install gunicorn

# Copia frontend
COPY index.html .
COPY assets/ assets/

# Copia backend
COPY backend/ backend/

# Health check — Easypanel usa isso para saber se o container está pronto
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

EXPOSE 80

WORKDIR /app/backend

# Usa a variável PORT (Easypanel injeta PORT=80 por padrão)
CMD gunicorn app:app \
    --bind 0.0.0.0:${PORT} \
    --workers 2 \
    --timeout 120 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -