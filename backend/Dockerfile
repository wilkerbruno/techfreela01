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

WORKDIR /app

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    gcc \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements da pasta backend/ (contexto = raiz do repo)
COPY backend/requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install gunicorn

# Copia todo o conteúdo da pasta backend/
COPY backend/ .

# Porta padrão
EXPOSE 5000

# Inicia com Gunicorn
CMD ["gunicorn", "app:app", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]