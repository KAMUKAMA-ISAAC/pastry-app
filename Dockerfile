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


# ---- Stage 2: Python backend + MongoDB, serving the built frontend too ----
# Ubuntu (not python:3.11-slim/Debian) so we can install MongoDB Community
# Server from its official, well-supported apt repo for Ubuntu 22.04.
FROM ubuntu:22.04 AS backend
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Ubuntu 22.04 ships Python 3.10, but several pinned requirements need 3.11+,
# so pull Python 3.11 from deadsnakes on top of it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common build-essential curl gnupg ca-certificates \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3.11-dev \
    && curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
    && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
       > /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update && apt-get install -y --no-install-recommends mongodb-org \
    && rm -rf /var/lib/apt/lists/* \
    && curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

COPY backend/requirements.txt ./
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/build ./static
COPY start.sh ./start.sh
RUN chmod +x start.sh && mkdir -p /data/db

ENV PORT=8000
# Bundled MongoDB, reachable only inside this container.
ENV MONGO_URL=mongodb://127.0.0.1:27017
ENV DB_NAME=pastry_quin
EXPOSE 8000

CMD ["./start.sh"]
