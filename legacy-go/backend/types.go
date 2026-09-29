package backend

import (
	"time"
)

// User represents a registered user
type User struct {
	ID        string    `json:"id"`
	HashID    string    `json:"hash_id"` // Base62 encoded user ID for public API access
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	Provider  string    `json:"provider"` // google, github
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Source represents a document source added to a notebook
type Source struct {
	ID         string                 `json:"id"`
	NotebookID string                 `json:"notebook_id"`
	Name       string                 `json:"name"`
	Type       string                 `json:"type"` // "file", "url", "text", "youtube", "audio"
	URL        string                 `json:"url,omitempty"`
	Content    string                 `json:"content,omitempty"`
	FileName   string                 `json:"file_name,omitempty"`
	FileSize   int64                  `json:"file_size,omitempty"`
	ChunkCount int                    `json:"chunk_count"`
	Status     string                 `json:"status"`     // "pending", "processing", "completed", "error"
	Progress   int                    `json:"progress"`   // 0-100
	ErrorMsg   string                 `json:"error_msg,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Note represents a note generated from sources
type Note struct {
	ID         string                 `json:"id"`
	NotebookID string                 `json:"notebook_id"`
	Title      string                 `json:"title"`
	Content    string                 `json:"content"`
	Type       string                 `json:"type"` // "summary", "faq", "study_guide", "outline", "custom"
	SourceIDs  []string               `json:"source_ids"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Notebook represents a collection of sources and notes
type Notebook struct {
	ID          string                 `json:"id"`
	UserID      string                 `json:"user_id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Color       string                 `json:"color"`
	Icon        string                 `json:"icon"`
	SourceIDs   []string               `json:"source_ids,omitempty"`
	IsPublic    bool                   `json:"is_public"`
	PublicToken string                 `json:"public_token,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// NotebookWithStats represents a notebook with statistics
type NotebookWithStats struct {
	ID            string                 `json:"id"`
	UserID        string                 `json:"user_id"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description,omitempty"`
	Color         string                 `json:"color"`
	Icon          string                 `json:"icon"`
	SourceIDs     []string               `json:"source_ids,omitempty"`
	IsPublic      bool                   `json:"is_public"`
	PublicToken   string                 `json:"public_token,omitempty"`
	CreatedAt     time.Time              `json:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	SourceCount   int                    `json:"source_count"`
	NoteCount     int                    `json:"note_count"`
	CoverImageURL string                 `json:"cover_image_url,omitempty"`
}

// ChatMessage represents a chat message
type ChatMessage struct {
	ID        string                 `json:"id"`
	SessionID string                 `json:"session_id"`
	Role      string                 `json:"role"` // "user", "assistant", "system"
	Content   string                 `json:"content"`
	Sources   []string               `json:"sources,omitempty"` // Source IDs referenced
	CreatedAt time.Time              `json:"created_at"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// ChatSession represents a chat session within a notebook
type ChatSession struct {
	ID         string                 `json:"id"`
	NotebookID string                 `json:"notebook_id"`
	Title      string                 `json:"title"`
	Messages   []ChatMessage          `json:"messages"`
	Summary    string                 `json:"summary,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Podcast represents an audio podcast generated from sources
type Podcast struct {
	ID         string                 `json:"id"`
	NotebookID string                 `json:"notebook_id"`
	Title      string                 `json:"title"`
	Script     string                 `json:"script"`
	AudioURL   string                 `json:"audio_url,omitempty"`
	Duration   int                    `json:"duration,omitempty"` // in seconds
	Voice      string                 `json:"voice"`
	Status     string                 `json:"status"` // "pending", "generating", "completed", "error"
	SourceIDs  []string               `json:"source_ids"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Textbook represents a compiled textbook generated from a notebook
type Textbook struct {
	ID              string    `json:"id"`
	NotebookID      string    `json:"notebook_id"`
	ContentMarkdown string    `json:"content_markdown"`
	Status          string    `json:"status"` // "current", "stale", "regenerating"
	Version         int       `json:"version"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TransformationRequest represents a request to generate a note
type TransformationRequest struct {
	Type      string   `json:"type"`       // "summary", "faq", "study_guide", "outline", "podcast", "custom", "infograph"
	Prompt    string   `json:"prompt"`     // Custom prompt for "custom" type
	SourceIDs []string `json:"source_ids"` // Specific sources to use, empty = all
	Length    string   `json:"length"`     // "short", "medium", "long"
	Format    string   `json:"format"`     // "markdown", "bullet_points", "paragraphs"
	Style     string   `json:"style"`      // Style for infographic generation (e.g., "craft-handmade", "claymation")
}

// TransformationResponse represents the response from a transformation
type TransformationResponse struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Content   string                 `json:"content"`
	Sources   []SourceSummary        `json:"sources"`
	CreatedAt time.Time              `json:"created_at"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// SourceSummary is a lightweight source reference
type SourceSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// ChatRequest represents a chat request
type ChatRequest struct {
	Message   string                 `json:"message"`
	SessionID string                 `json:"session_id,omitempty"`
	Context   map[string]interface{} `json:"context,omitempty"`
}

// ChatResponse represents a chat response
type ChatResponse struct {
	Message   string                 `json:"message"`
	Sources   []SourceSummary        `json:"sources"`
	SessionID string                 `json:"session_id"`
	MessageID string                 `json:"message_id"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string            `json:"status"`
	Version   string            `json:"version"`
	Timestamp int64             `json:"timestamp"`
	Services  map[string]string `json:"services"`
}

// NotebookOverviewResponse represents a notebook overview with summary and questions
type NotebookOverviewResponse struct {
	Summary   string   `json:"summary"`
	Questions []string `json:"questions"`
}

// ConfigResponse represents the client configuration
type ConfigResponse struct {
}

// ActivityLog represents a user activity log entry
type ActivityLog struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Action       string    `json:"action"`        // "login", "create_notebook", "add_source", "create_note", etc.
	ResourceType string    `json:"resource_type"` // "notebook", "source", "note", etc.
	ResourceID   string    `json:"resource_id"`
	ResourceName string    `json:"resource_name"`
	Details      string    `json:"details"` // Additional details in JSON format
	IPAddress    string    `json:"ip_address"`
	UserAgent    string    `json:"user_agent"`
	CreatedAt    time.Time `json:"created_at"`
}
