# StudyForge API Documentation

## Overview

StudyForge provides three sets of API routes, each corresponding to a different authentication method and use case.

| Auth Type | Route Prefix | Auth Method | Use Case |
|-----------|-------------|-------------|----------|
| Internal API | `/api` | JWT Token | Frontend web app |
| External API | `/api/v1` | HashID | External skill calls |
| Public Pages | `/public` | None | Public notebooks |

---

## External API (`/api/v1`) - HashID Authentication

### Authentication Methods

Two methods are supported for passing the `hash_id`:

**Method 1: Query Parameter**
```bash
GET /api/v1/notebooks?hash_id=abc123
```

**Method 2: Request Header**
```bash
GET /api/v1/notebooks
Headers: X-Hash-ID: abc123
```

### HashID Specification

- **Length**: 8-16 characters
- **Format**: Base62 encoded
- **Character Set**: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`
- **How to Obtain**: After login, retrieve `hash_id` via `/api/auth/me`

### API Endpoints

#### Notebooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notebooks` | List all notebooks |
| GET | `/api/v1/notebooks/stats` | Get notebook statistics (with source counts) |
| POST | `/api/v1/notebooks` | Create a new notebook |
| GET | `/api/v1/notebooks/:id` | Get notebook details |
| PUT | `/api/v1/notebooks/:id` | Update a notebook |
| DELETE | `/api/v1/notebooks/:id` | Delete a notebook |
| GET | `/api/v1/notebooks/:id/overview` | Get notebook overview (summary and questions) |

#### Sources

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notebooks/:id/sources` | List all sources for a notebook |
| GET | `/api/v1/notebooks/:id/sources/:sourceId` | Get source details |
| POST | `/api/v1/notebooks/:id/sources` | Add a new source |
| DELETE | `/api/v1/notebooks/:id/sources/:sourceId` | Delete a source |

#### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notebooks/:id/notes` | List all notes for a notebook |
| POST | `/api/v1/notebooks/:id/notes` | Create a new note |
| DELETE | `/api/v1/notebooks/:id/notes/:noteId` | Delete a note |

#### Transformations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/notebooks/:id/transform` | Execute a document transformation (summary, FAQ, PPT, etc.) |

#### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/notebooks/:id/chat` | Quick chat (auto-creates session) |
| GET | `/api/v1/notebooks/:id/chat/sessions` | List all chat sessions |
| POST | `/api/v1/notebooks/:id/chat/sessions` | Create a new chat session |
| GET | `/api/v1/notebooks/:id/chat/sessions/:sessionId` | Get session details |
| DELETE | `/api/v1/notebooks/:id/chat/sessions/:sessionId` | Delete a session |
| POST | `/api/v1/notebooks/:id/chat/sessions/:sessionId/messages` | Send a message |

#### File Upload

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/upload` | Upload a file |

---

## Usage Examples

### 1. Get User HashID

```bash
# First, log in via OAuth to get a JWT token
curl "http://localhost:8080/auth/login/github"

# Use the token to get user info (includes hash_id)
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  http://localhost:8080/api/auth/me

# Response example
{
  "id": "uuid-string",
  "hash_id": "abc123XYZ",  // Save this for external API calls
  "email": "user@example.com",
  "name": "User Name",
  "avatar_url": "...",
  "provider": "github",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 2. List Notebooks

```bash
# Using query parameter
curl "http://localhost:8080/api/v1/notebooks?hash_id=abc123XYZ"

# Or using request header
curl -H "X-Hash-ID: abc123XYZ" \
  http://localhost:8080/api/v1/notebooks
```

### 3. Create a Notebook

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Notebook",
    "description": "A notebook for testing"
  }' \
  http://localhost:8080/api/v1/notebooks
```

### 4. Add a Source (File)

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -F "file=@document.pdf" \
  -F "notebook_id=NOTEBOOK_ID" \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/sources
```

### 5. Create a Note

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "summary",
    "prompt": "Generate a summary",
    "source_ids": ["SOURCE_ID_1", "SOURCE_ID_2"]
  }' \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/transform
```

### 6. Chat

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is this document about?",
    "session_id": ""
  }' \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/chat
```

---

## Error Responses

All API endpoints return errors in the following format:

```json
{
  "error": "Error description message"
}
```

### Common Error Codes

| HTTP Status Code | Description |
|-----------------|-------------|
| 400 | Bad Request - Invalid request parameters |
| 401 | Unauthorized - Missing or invalid hash_id |
| 404 | Not Found - Resource does not exist |
| 500 | Internal Server Error - Server-side error |

### Authentication Error Examples

```json
{
  "error": "hash_id parameter or X-Hash-ID header required"
}

{
  "error": "Invalid hash_id"
}

{
  "error": "Invalid hash_id format"
}
```

---

## HashID Generation Algorithm

HashID is generated using Base62 encoding, composed of:

1. **Timestamp** (millisecond precision, 40 bits) - Ensures uniqueness and ordering
2. **Random number** (24 bits) - Adds unpredictability

Algorithm flow:
```go
timestamp := time.Now().UnixMilli()
randomPart := rand.Uint32() & 0xFFFFFF
hashIDValue := (timestamp << 24) | randomPart
hashID := GenerateBase62ID(hashIDValue)
```

Properties:
- Unpredictable: Cannot be guessed even knowing the timestamp
- Globally unique: UNIQUE constraint + collision detection
- URL-friendly: Contains only alphanumeric characters

---

## Security Notes

1. **HashID is not a password**: It is a public access token used for API calls
2. **Do not expose your HashID**: Although it is not a sensitive credential, it should be kept secure
3. **Rotate periodically**: If a HashID is compromised, you can obtain a new one by re-registering
4. **Audit logging**: All API calls are recorded in audit logs

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| v1.0 | 2024-03-04 | Initial version with HashID-authenticated external API |
