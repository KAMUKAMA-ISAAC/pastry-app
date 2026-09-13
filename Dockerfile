# ---- Stage 1: build the React frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Same-origin monolith: frontend calls relative /api/* URLs, so no backend
# domain needs to be known at build time.
ENV REACT_APP_BACKEND_URL=

COPY frontend/package.json ./
RUN yarn install --network-timeout 600000 --network-concurrency 4
COPY frontend/ ./
RUN yarn build


# ---- Stage 2: Python backend that also serves the built frontend ----
FROM python:3.11-slim AS backend
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/build ./static

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
