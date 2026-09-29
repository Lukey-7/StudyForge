# Deploying to Google Cloud (Cloud Run)

These are notes only; nothing has been deployed yet. They assume `gcloud` is installed and a GCP project exists.

## 1. One-time setup

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create studyforge --repository-format=docker --location=asia-south1
```

Store secrets in Secret Manager (never in the image):

```bash
printf "%s" "$GEMINI_API_KEY"            | gcloud secrets create gemini-api-key --data-file=-
printf "%s" "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
printf "%s" "$OPENAI_API_KEY"            | gcloud secrets create openai-api-key --data-file=-   # optional
```

## 2. Build the backend image with Cloud Build (no local Docker needed)

```bash
cd backend
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/studyforge/backend:v2
```

The Dockerfile is multi-stage: it builds wheels in a full image, then copies only the installed packages into a slim runtime image. It runs as a non-root user and listens on `$PORT`.

## 3. Chroma on Cloud Run (pick one)

Cloud Run's filesystem is **ephemeral**, so the embedded Chroma folder disappears when an instance is recycled.

| Option | How | When |
|---|---|---|
| A. Rebuild on start | Keep `CHROMA_MODE=embedded`, run `python -m scripts.reindex` as a Cloud Run Job after deploys | Demos, small data (costs embedding calls) |
| B. Mounted volume | Cloud Run + Cloud Storage FUSE volume at `/app/data/chroma`, `--max-instances=1` | Single instance, low traffic |
| C. Chroma server | Run `chromadb/chroma` as its own Cloud Run service or on a small GCE VM; set `CHROMA_MODE=http`, `CHROMA_HOST`, `CHROMA_PORT` | Multiple backend instances |

Postgres (Supabase) is always the source of truth, so every option can be rebuilt.

## 4. Deploy

```bash
gcloud run deploy studyforge-api \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/studyforge/backend:v2 \
  --region asia-south1 --allow-unauthenticated \
  --cpu 1 --memory 1Gi --timeout 300 --max-instances 1 \
  --set-env-vars DB_BACKEND=supabase,AUTH_MODE=supabase,SUPABASE_URL=https://xxxx.supabase.co,CORS_ORIGINS=https://your-frontend.web.app \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
```

- `--timeout 300`: generation and map-reduce can take over a minute, and SSE chat streams stay open.
- `--allow-unauthenticated` only means Cloud Run lets requests through; the app still checks the Supabase JWT on every route.
- BackgroundTasks run after the response. Set `--no-cpu-throttling` (CPU always allocated) so ingestion keeps running after the upload request returns.

## 5. Frontend

`npm run build` in `frontend/` produces static files in `dist/`. Host them on Firebase Hosting, Cloud Storage + Cloud CDN, or any static host. Set at build time:

```
VITE_API_URL=https://studyforge-api-xxxx.a.run.app
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Add the frontend URL to `CORS_ORIGINS` on the backend and to Supabase → Authentication → URL configuration.

## 6. Observability

Logs go to stdout in `time level module: message` form, and Cloud Logging picks them up automatically. Useful filters: `"ingested"`, `"pipeline"`, `"embedding model in use"`, `"retryable error"`.
