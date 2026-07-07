# Cognee memory service — Python (Cognee is Python-native). Kept as its own
# microservice so the TypeScript responder stays decoupled and calls it over HTTP.
FROM python:3.11-slim

WORKDIR /app

# Cognee pulls native/build deps; keep the image lean but build-capable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

ENV PORT=3005
EXPOSE 3005

HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
    CMD curl -fsS http://localhost:3005/health -o /dev/null || exit 1

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
