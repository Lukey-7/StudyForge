# Multi-stage build: stage 1 compiles wheels, stage 2 only copies what runs.
# Result: smaller image, no compilers in production.
FROM python:3.12-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels
COPY app ./app
COPY migrations ./migrations
COPY scripts ./scripts
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app
USER appuser
EXPOSE 8080
# Cloud Run injects $PORT.
CMD ["sh", "-c", "uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT}"]
