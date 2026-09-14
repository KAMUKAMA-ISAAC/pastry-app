# Backend-only image: FastAPI API talking to an external Postgres (Neon).
# The frontend is deployed separately elsewhere, so nothing is built here.
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
