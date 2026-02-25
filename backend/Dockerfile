# ============================================================
# TechFreela — Dockerfile para Easypanel
# Contexto de build: raiz do repositório
# Arquivo em: backend/Dockerfile
# ============================================================

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    gcc \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Estrutura final dentro do container:
#   /app/             ← raiz do repo (index.html + assets/)
#   /app/backend/     ← código Flask (app.py, models/, etc.)

WORKDIR /app

# Instala dependências Python
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r backend/requirements.txt && \
    pip install gunicorn

# Copia frontend (index.html + assets/)
COPY index.html .
COPY assets/ assets/

# Copia todo o backend
COPY backend/ backend/

# Porta padrão
EXPOSE 5000

# Roda gunicorn a partir da pasta backend/
WORKDIR /app/backend

CMD ["gunicorn", "app:app", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]