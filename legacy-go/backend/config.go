package backend

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds the application configuration
type Config struct {
	// Server settings
	ServerHost string
	ServerPort string
	MaxUploadSize int64 // Maximum upload file size in bytes (default: 100MB)

	// LLM settings
	OpenAIAPIKey   string
	OpenAIBaseURL  string
	OpenAIModel    string
	EmbeddingModel string
	GoogleAPIKey   string
	GeminiBaseURL  string

	// Image generation settings
	ImageProvider    string // "gemini", "glm", "zimage"
	GLMAPIKey        string
	GLMImageModel    string
	GeminiImageModel string
	ZImageAPIKey     string
	ZImageModel      string

	// Vector store settings
	VectorStoreType string // "memory", "supabase", "pgvector", "redis", "sqlite"
	SupabaseURL     string
	SupabaseKey     string
	PostgreSQLURL   string
	RedisURL        string
	SQLitePath      string

	// Store settings (for checkpoints)
	StoreType string // "memory", "sqlite", "postgres", "redis"
	StorePath string

	// Application settings
	MaxSources       int
	MaxContextLength int
	ChunkSize        int
	ChunkOverlap     int
	MaxChatHistory   int

	// Podcast generation
	EnablePodcast bool
	PodcastVoice  string

	// Document conversion
	EnableMarkitdown bool

	// Audio transcription
	EnableVoskTranscriber bool
	VoskModelPath        string // Path to vosk model directory

	// Demo settings
	AllowMultipleNotesOfSameType bool

	// LangSmith tracing (optional)
	LangChainAPIKey  string
	LangChainProject string

	// Auth settings
	JWTSecret string

	// GitHub OAuth
	GithubClientID     string
	GithubClientSecret string
	GithubRedirectURL  string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string

	// Test Mode
	EnableTestMode     bool
	TestUserID         string
	TestUserName       string
	TestUserEmail      string
	TestUserAvatar     string
}

// loadEnv loads .env file if it exists (ignoring errors if file not found)
func loadEnv() {
	// Try to load .env file from current directory
	_ = godotenv.Load()

	// Also try to load from .env.local for local overrides
	_ = godotenv.Load(".env.local")
}

// LoadConfig loads configuration from environment variables with defaults
func LoadConfig() Config {
	// Load .env file first (if exists)
	loadEnv()

	cfg := Config{
		ServerHost:                   getEnv("SERVER_HOST", "0.0.0.0"),
		ServerPort:                   getEnv("SERVER_PORT", "8080"),
		MaxUploadSize:                getEnvInt64("MAX_UPLOAD_SIZE", 200*1024*1024), // 200MB default
		// LLM settings — these use the OpenAI-compatible client, but can point at any
		// provider that implements the OpenAI API (e.g. Google Gemini, DeepSeek, etc.).
		// For Gemini: set OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
		//             and OPENAI_API_KEY to your Gemini API key.
		OpenAIAPIKey:                 getEnv("OPENAI_API_KEY", ""),
		OpenAIBaseURL:                getEnv("OPENAI_BASE_URL", ""),
		OpenAIModel:                  getEnv("OPENAI_MODEL", "gemini-2.5-flash"),
		EmbeddingModel:               getEnv("EMBEDDING_MODEL", "text-embedding-004"),
		GoogleAPIKey:                 getEnv("GOOGLE_API_KEY", ""),
		GeminiBaseURL:                getEnv("GEMINI_BASE_URL", ""),

		ImageProvider:                getEnv("IMAGE_PROVIDER", "gemini"),
		GLMAPIKey:                    getEnv("GLM_API_KEY", ""),
		GLMImageModel:                getEnv("GLM_IMAGE_MODEL", "glm-image"),
		GeminiImageModel:             getEnv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image-preview"),
		ZImageAPIKey:                 getEnv("ZIMAGE_API_KEY", ""),
		ZImageModel:                  getEnv("ZIMAGE_MODEL", "z-image-turbo"),
		VectorStoreType:              getEnv("VECTOR_STORE_TYPE", "sqlite"),
		SupabaseURL:                  getEnv("SUPABASE_URL", ""),
		SupabaseKey:                  getEnv("SUPABASE_KEY", ""),
		PostgreSQLURL:                getEnv("POSTGRES_URL", ""),
		RedisURL:                     getEnv("REDIS_URL", "redis://localhost:6379"),
		SQLitePath:                   getEnv("SQLITE_PATH", "./data/vector.db"),
		StoreType:                    getEnv("STORE_TYPE", "sqlite"),
		StorePath:                    getEnv("STORE_PATH", "./data/checkpoints.db"),
		MaxSources:                   getEnvInt("MAX_SOURCES", 5),
		MaxContextLength:             getEnvInt("MAX_CONTEXT_LENGTH", 128000),
		ChunkSize:                    getEnvInt("CHUNK_SIZE", 1000),
		ChunkOverlap:                 getEnvInt("CHUNK_OVERLAP", 200),
		MaxChatHistory:               getEnvInt("MAX_CHAT_HISTORY", 20),
		EnablePodcast:                getEnvBool("ENABLE_PODCAST", true),
		PodcastVoice:                 getEnv("PODCAST_VOICE", "alloy"),
		EnableMarkitdown:             getEnvBool("ENABLE_MARKITDOWN", true),
		EnableVoskTranscriber:        getEnvBool("ENABLE_VOSK_TRANSCRIBER", false),
		VoskModelPath:                getEnv("VOSK_MODEL_PATH", "/usr/local/share/vosk-model-en"),
		AllowMultipleNotesOfSameType: getEnvBool("ALLOW_MULTIPLE_NOTES_OF_SAME_TYPE", true),
		LangChainAPIKey:              getEnv("LANGCHAIN_API_KEY", ""),
		LangChainProject:             getEnv("LANGCHAIN_PROJECT", "studyforge"),

		JWTSecret: getEnv("JWT_SECRET", "your-secret-key-change-me"),

		GithubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GithubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		GithubRedirectURL:  getEnv("GITHUB_REDIRECT_URL", ""),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", ""),

		EnableTestMode:     getEnvBool("ENABLE_TEST_MODE", false),
		TestUserID:         getEnv("TEST_USER_ID", "test-user-123"),
		TestUserName:       getEnv("TEST_USER_NAME", "Test User"),
		TestUserEmail:      getEnv("TEST_USER_EMAIL", "test@example.com"),
		TestUserAvatar:     getEnv("TEST_USER_AVATAR", ""),
	}



	return cfg
}

// ValidateConfig validates the configuration
func ValidateConfig(cfg Config) error {
	// Check that an API key is configured
	if cfg.OpenAIAPIKey == "" {
		return fmt.Errorf("OPENAI_API_KEY must be set")
	}

	// Validate vector store configuration
	switch cfg.VectorStoreType {
	case "supabase":
		if cfg.SupabaseURL == "" || cfg.SupabaseKey == "" {
			return fmt.Errorf("SUPABASE_URL and SUPABASE_KEY required for supabase vector store")
		}
	case "pgvector", "postgres":
		if cfg.PostgreSQLURL == "" {
			return fmt.Errorf("POSTGRES_URL required for postgres vector store")
		}
	case "redis":
		// Redis URL has default
	case "sqlite":
		// SQLite path has default
	case "memory":
		// No validation needed
	default:
		return fmt.Errorf("unknown vector store type: %s", cfg.VectorStoreType)
	}

	return nil
}

// getEnv gets an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt gets an environment variable as an integer or returns a default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// getEnvInt64 gets an environment variable as an int64 or returns a default value
func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// getEnvBool gets an environment variable as a boolean or returns a default value
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr || containsMiddle(s, substr)))
}

func containsMiddle(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// GetBaseURL returns the appropriate base URL for the LLM provider
func (c *Config) GetBaseURL() string {
	if c.OpenAIBaseURL != "" {
		return c.OpenAIBaseURL
	}
	return ""
}

// SupportsFunctionCalling returns true if the configured model supports function calling
func (c *Config) SupportsFunctionCalling() bool {
	// Gemini and most modern OpenAI-compatible models support function calling
	return true
}
