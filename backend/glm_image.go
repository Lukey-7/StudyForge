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
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/llms"
)

// GLMImageClient is a client for GLM-Image (智谱AI) image generation
type GLMImageClient struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewGLMImageClient creates a new GLM image client
func NewGLMImageClient(apiKey string) *GLMImageClient {
	return &GLMImageClient{
		apiKey:  apiKey,
		baseURL: "https://open.bigmodel.cn/api/paas/v4/images/generations",
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
			Transport: &http.Transport{
				DisableKeepAlives: false,
				MaxIdleConns:      100,
				IdleConnTimeout:   5 * time.Minute,
			},
		},
	}
}

// GenerateImage generates an image using GLM-Image API
func (g *GLMImageClient) GenerateImage(ctx context.Context, model, prompt string, userID, imageType string) (string, error) {
	if g.apiKey == "" {
		golog.Errorf("glm_api_key is not set")
		return "", fmt.Errorf("glm_api_key is not set")
	}

	// Generate JWT token from API key
	token, err := g.generateToken()
	if err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}

	// Prepare request payload
	requestBody := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"size":   "1280x1280",
	}
	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request body: %w", err)
	}

	golog.Infof("generating image with GLM model %s...", model)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", g.baseURL, strings.NewReader(string(jsonBody)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	// Send request
	resp, err := g.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	var result struct {
		Created int `json:"created"`
		Data    []struct {
			URL string `json:"url"`
		} `json:"data"`
		ContentFilter []struct {
			Role  string `json:"role"`
			Level int    `json:"level"`
		} `json:"content_filter"`
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Param   string `json:"param"`
			Code    string `json:"code"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	// Check for API error
	if result.Error.Code != "" {
		golog.Errorf("GLM API error: %s - %s", result.Error.Code, result.Error.Message)
		return "", fmt.Errorf("GLM API error (%s): %s", result.Error.Code, result.Error.Message)
	}

	// Check if image URL is present
	if len(result.Data) == 0 || result.Data[0].URL == "" {
		golog.Errorf("no image URL returned by GLM API")
		return "", fmt.Errorf("no image URL in response")
	}

	imageURL := result.Data[0].URL
	golog.Infof("image URL received: %s, downloading...", imageURL)

	// Download the image from URL
	downloadReq, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %w", err)
	}

	downloadResp, err := g.httpClient.Do(downloadReq)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer downloadResp.Body.Close()

	imageData, err := io.ReadAll(downloadResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read image data: %w", err)
	}

	if downloadResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download image, status: %d", downloadResp.StatusCode)
	}

	golog.Infof("image data received successfully (%d bytes), saving...", len(imageData))

	// Save the image to user-specific directory
	fileName := fmt.Sprintf("%s_%d.png", imageType, time.Now().UnixNano())
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

// GenerateTextWithModel generates text using GLM (optional, for compatibility)
func (g *GLMImageClient) GenerateTextWithModel(ctx context.Context, prompt string, model string) (string, error) {
	return "", fmt.Errorf("GLM-Image client does not support text generation")
}

// GenerateFromSinglePrompt generates text (optional, for compatibility)
func (g *GLMImageClient) GenerateFromSinglePrompt(ctx context.Context, llm llms.Model, prompt string, options ...llms.CallOption) (string, error) {
	return "", fmt.Errorf("GLM-Image client does not support text generation")
}

// generateToken generates a JWT token from the API key
// GLM API key format: id.secret
func (g *GLMImageClient) generateToken() (string, error) {
	parts := strings.Split(g.apiKey, ".")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid API key format, expected id.secret")
	}

	apiID := parts[0]
	apiSecret := parts[1]

	// Create JWT token
	now := time.Now()
	claims := jwt.MapClaims{
		"api_key":   apiID,
		"exp":       now.Add(1 * time.Hour).Unix(),
		"timestamp": now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(apiSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}
