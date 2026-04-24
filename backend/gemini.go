package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/llms"
	"google.golang.org/genai"
)

// LLMProvider defines the interface for LLM operations
type LLMProvider interface {
	// GenerateImage generates an image using the provider
	GenerateImage(ctx context.Context, model, prompt string, userID, imageType string) (string, error)

	// GenerateTextWithModel generates text using a specific model
	GenerateTextWithModel(ctx context.Context, prompt string, model string) (string, error)

	// GenerateFromSinglePrompt generates text from a single prompt using the default LLM
	GenerateFromSinglePrompt(ctx context.Context, llm llms.Model, prompt string, options ...llms.CallOption) (string, error)
}

// GeminiClient is the default implementation of LLMProvider using Google GenAI
type GeminiClient struct {
	googleAPIKey  string
	geminiBaseURL string
	llm           llms.Model // maybe other llm except gemini for chat/summary etc.
	imageMutex    sync.Mutex // Ensure serial execution of image generation
}

// NewGeminiClient creates a new GeminiClient
func NewGeminiClient(googleAPIKey, geminiBaseURL string, llm llms.Model) *GeminiClient {
	return &GeminiClient{
		googleAPIKey:  googleAPIKey,
		geminiBaseURL: geminiBaseURL,
		llm:           llm,
	}
}

// GenerateContentRequest represents the request structure for Gemini GenerateContent API
type GenerateContentRequest struct {
	Contents []struct {
		Role  string `json:"role"`
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"contents"`
	GenerationConfig struct {
		ResponseModalities []string     `json:"responseModalities"`
		ImageConfig        *ImageConfig `json:"imageConfig,omitempty"`
	} `json:"generationConfig"`
}

type ImageConfig struct {
	AspectRatio string `json:"aspectRatio,omitempty"`
	ImageSize   string `json:"imageSize,omitempty"`
}

// GenerateContentResponse represents the response structure from Gemini GenerateContent API
type GenerateContentResponse struct {
	Candidates []struct {
		Content *struct {
			Parts []struct {
				Text       string `json:"text,omitempty"`
				InlineData *struct {
					MIMEType string `json:"mimeType,omitempty"`
					Data     []byte `json:"data,omitempty"`
				} `json:"inlineData,omitempty"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

// GenerateImage generates an image using the Google GenAI REST API
func (n *GeminiClient) GenerateImage(ctx context.Context, model, prompt string, userID, imageType string) (string, error) {
	// Ensure serial execution - wait for any ongoing image generation to complete
	n.imageMutex.Lock()
	defer n.imageMutex.Unlock()

	if n.googleAPIKey == "" {
		golog.Errorf("google_api_key is not set")
		return "", fmt.Errorf("google_api_key is not set")
	}

	httpClient := &http.Client{
		Timeout: time.Hour, // Give the model enough time to "think"
		Transport: &http.Transport{
			DisableKeepAlives: false,
			MaxIdleConns:      100,
			IdleConnTimeout:   time.Hour,
			Proxy:             http.ProxyFromEnvironment,
		},
	}

	var lastErr error
	for attempt := 1; attempt <= 10; attempt++ {
		if attempt > 1 {
			// Use backoff algorithm: wait 10 seconds for first retry, then add 10 seconds each time
			waitDuration := time.Duration(attempt-1) * 10 * time.Second
			golog.Infof("retrying image generation (attempt %d/10), waiting %v...", attempt, waitDuration)
			time.Sleep(waitDuration)
		} else {
			golog.Infof("generating images with model %s using REST API...", model)
		}

		// Build request body
		reqBody := GenerateContentRequest{
			Contents: []struct {
				Role  string `json:"role"`
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}{
				{
					Role: "user",
					Parts: []struct {
						Text string `json:"text"`
					}{
						{Text: prompt},
					},
				},
			},
		}
		reqBody.GenerationConfig.ResponseModalities = []string{"IMAGE"}
		reqBody.GenerationConfig.ImageConfig = &ImageConfig{
			AspectRatio: "16:9",
			ImageSize:   "2K",
		}
		jsonBody, err := json.Marshal(reqBody)
		if err != nil {
			golog.Errorf("failed to marshal request body: %v", err)
			lastErr = err
			continue
		}

		// Build HTTP request
		baseURL := n.geminiBaseURL
		if baseURL == "" {
			baseURL = "https://generativelanguage.googleapis.com"
		}
		url := fmt.Sprintf("%s/v1beta/models/%s:generateContent", baseURL, model)
		golog.Infof(url)
		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(jsonBody)))
		if err != nil {
			golog.Errorf("failed to create HTTP request (attempt %d): %v", attempt, err)
			lastErr = err
			continue
		}
		req.Header.Set("x-goog-api-key", n.googleAPIKey)
		req.Header.Set("Content-Type", "application/json")

		// Send request
		resp, err := httpClient.Do(req)
		if err != nil {
			golog.Errorf("failed to send HTTP request (attempt %d): %v", attempt, err)
			lastErr = err
			continue
		}

		// Log response status
		golog.Infof("response status: %d", resp.StatusCode)

		// Read response body for debugging
		respBody, _ := io.ReadAll(resp.Body)
		golog.Infof("response body (attempt %d): %s", attempt, string(respBody))

		// Parse response
		var genResp GenerateContentResponse
		if err := json.Unmarshal(respBody, &genResp); err != nil {
			golog.Errorf("failed to decode response (attempt %d): %v", attempt, err)
			golog.Errorf("response body was: %s", string(respBody))
			lastErr = err
			continue
		}

		// Log candidates info
		golog.Infof("number of candidates: %d", len(genResp.Candidates))

		// Extract image data
		if len(genResp.Candidates) == 0 || genResp.Candidates[0].Content == nil {
			golog.Errorf("no candidates returned by the model (attempt %d)", attempt)
			lastErr = fmt.Errorf("no candidates generated")
			continue
		}

		var imageData []byte
		var imageSuffix string
		for _, part := range genResp.Candidates[0].Content.Parts {
			if part.InlineData != nil && len(part.InlineData.Data) > 0 {
				imageData = part.InlineData.Data
				switch part.InlineData.MIMEType {
				case "image/png":
					imageSuffix = "png"
				case "image/jpeg":
					imageSuffix = "jpg"
				default:
					imageSuffix = strings.TrimPrefix(part.InlineData.MIMEType, "image/")
				}
				break
			}
		}

		if len(imageData) == 0 {
			golog.Errorf("no image data found in the response parts (attempt %d)", attempt)
			lastErr = fmt.Errorf("no image data in response")
			continue
		}

		golog.Infof("image data received successfully, saving...")

		// Save the image to user-specific directory
		fileName := fmt.Sprintf("%s_%d.%s", imageType, time.Now().UnixNano(), imageSuffix)
		var uploadDir string
		if userID != "" {
			uploadDir = filepath.Join("./data/uploads", userID)
		} else {
			uploadDir = "./data/uploads"
		}

		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			return "", fmt.Errorf("failed to create upload directory: %w", err)
		}

		filePath := filepath.Join(uploadDir, fileName)
		if err := os.WriteFile(filePath, imageData, 0644); err != nil {
			golog.Errorf("failed to save image to %s: %v", filePath, err)
			return "", fmt.Errorf("failed to save image: %w", err)
		}

		golog.Infof("%s saved to %s", imageType, filePath)
		return filePath, nil
	}

	return "", fmt.Errorf("failed to generate image after 10 attempts: %w", lastErr)
}

// GenerateTextWithModel generates text using the Google GenAI SDK with a specific model
func (n *GeminiClient) GenerateTextWithModel(ctx context.Context, prompt string, model string) (string, error) {
	if n.googleAPIKey == "" {
		golog.Errorf("google_api_key is not set")
		return "", fmt.Errorf("google_api_key is not set")
	}

	httpClient := &http.Client{
		Timeout: 5 * time.Minute, // Give the model enough time to "think"
		Transport: &http.Transport{
			DisableKeepAlives: false,
			MaxIdleConns:      100,
			IdleConnTimeout:   5 * time.Minute,
			Proxy:             http.ProxyFromEnvironment,
		},
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:     n.googleAPIKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: httpClient,
		HTTPOptions: genai.HTTPOptions{
			BaseURL: n.geminiBaseURL,
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to create genai client: %w", err)
	}

	golog.Infof("generating text with model %s using GenerateContent...", model)

	// Set a timeout for the text generation
	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	resp, err := client.Models.GenerateContent(ctx, model, genai.Text(prompt), nil)
	if err != nil {
		golog.Errorf("failed to generate gemini text: %v", err)
		return "", fmt.Errorf("failed to generate gemini text: %w", err)
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil || len(resp.Candidates[0].Content.Parts) == 0 {
		golog.Errorf("no text candidates returned by the model")
		return "", fmt.Errorf("no text generated")
	}

	var textContent strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if part.Text != "" {
			textContent.WriteString(part.Text)
		}
	}

	result := textContent.String()
	if result == "" {
		golog.Errorf("empty text content in response")
		return "", fmt.Errorf("empty response from model")
	}

	return result, nil
}

// GenerateFromSinglePrompt generates text from a single prompt using the specified LLM
func (n *GeminiClient) GenerateFromSinglePrompt(ctx context.Context, llm llms.Model, prompt string, options ...llms.CallOption) (string, error) {
	return llms.GenerateFromSinglePrompt(ctx, n.llm, prompt, options...)
}
