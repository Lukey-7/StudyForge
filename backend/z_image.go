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

	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/llms"
)

// ZImageClient is a client for Alibaba Z-Image (通义万相) image generation
type ZImageClient struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewZImageClient creates a new ZImage client
func NewZImageClient(apiKey string) *ZImageClient {
	return &ZImageClient{
		apiKey:  apiKey,
		baseURL: "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation",
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

// GenerateImage generates an image using Z-Image API
func (z *ZImageClient) GenerateImage(ctx context.Context, model, prompt string, userID, imageType string) (string, error) {
	if z.apiKey == "" {
		golog.Errorf("zimage_api_key is not set")
		return "", fmt.Errorf("zimage_api_key is not set")
	}

	// Prepare request payload
	requestBody := map[string]interface{}{
		"model": model,
		"input": map[string]string{
			"prompt": prompt,
		},
		"parameters": map[string]interface{}{
			"size": "1280*1280",
		},
	}
	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request body: %w", err)
	}

	golog.Infof("generating image with Z-Image model %s...", model)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", z.baseURL, strings.NewReader(string(jsonBody)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+z.apiKey)

	// Send request
	resp, err := z.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	var result struct {
		Output struct {
			TaskID  string `json:"task_id"`
			Results []struct {
				URL string `json:"url"`
			} `json:"results"`
		} `json:"output"`
		Usage struct {
			ImageCount int `json:"image_count"`
		} `json:"usage"`
		Code    string `json:"code"`
		Message string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	// Check for API error
	if result.Code != "" && result.Code != "200" {
		golog.Errorf("Z-Image API error: %s - %s", result.Code, result.Message)
		return "", fmt.Errorf("Z-Image API error (%s): %s", result.Code, result.Message)
	}

	// Check if image URL is present
	if len(result.Output.Results) == 0 || result.Output.Results[0].URL == "" {
		golog.Errorf("no image URL returned by Z-Image API")
		return "", fmt.Errorf("no image URL in response")
	}

	imageURL := result.Output.Results[0].URL
	golog.Infof("image URL received: %s, downloading...", imageURL)

	// Download image from URL
	downloadReq, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %w", err)
	}

	downloadResp, err := z.httpClient.Do(downloadReq)
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

// GenerateTextWithModel generates text using Z-Image (optional, for compatibility)
func (z *ZImageClient) GenerateTextWithModel(ctx context.Context, prompt string, model string) (string, error) {
	return "", fmt.Errorf("Z-Image client does not support text generation")
}

// GenerateFromSinglePrompt generates text (optional, for compatibility)
func (z *ZImageClient) GenerateFromSinglePrompt(ctx context.Context, llm llms.Model, prompt string, options ...llms.CallOption) (string, error) {
	return "", fmt.Errorf("Z-Image client does not support text generation")
}
