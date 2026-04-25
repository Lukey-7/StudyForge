package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
	"github.com/tmc/langchaingo/prompts"
)

// Agent handles AI operations for generating notes and chat responses
type Agent struct {
	vectorStore   *VectorStore
	llm           llms.Model
	cfg           Config
	provider      LLMProvider
	memoryManager *MemoryManager
}

// GetLLM returns the LLM model used by this agent
func (a *Agent) GetLLM() llms.Model {
	return a.llm
}

// SetMemoryManager sets the memory manager for this agent
func (a *Agent) SetMemoryManager(mm *MemoryManager) {
	a.memoryManager = mm
}

// NewAgent creates a new agent
func NewAgent(cfg Config, vectorStore *VectorStore) (*Agent, error) {
	llm, err := createLLM(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create LLM: %w", err)
	}

	// Select image provider based on config
	var provider LLMProvider
	switch cfg.ImageProvider {
	case "glm":
		if cfg.GLMAPIKey == "" {
			return nil, fmt.Errorf("glm_api_key is required when image_provider is 'glm'")
		}
		provider = NewGLMImageClient(cfg.GLMAPIKey)
	case "zimage":
		if cfg.ZImageAPIKey == "" {
			return nil, fmt.Errorf("zimage_api_key is required when image_provider is 'zimage'")
		}
		provider = NewZImageClient(cfg.ZImageAPIKey)
	case "gemini":
		provider = NewGeminiClient(cfg.GoogleAPIKey, cfg.GeminiBaseURL, llm)
	default:
		return nil, fmt.Errorf("unknown image provider: %s (supported: gemini, glm, zimage)", cfg.ImageProvider)
	}

	return &Agent{
		vectorStore: vectorStore,
		llm:         llm,
		cfg:         cfg,
		provider:    provider,
	}, nil
}

// createLLM creates an LLM based on configuration
func createLLM(cfg Config) (llms.Model, error) {
	opts := []openai.Option{
		openai.WithToken(cfg.OpenAIAPIKey),
		openai.WithModel(cfg.OpenAIModel),
	}
	if cfg.OpenAIBaseURL != "" {
		opts = append(opts, openai.WithBaseURL(cfg.OpenAIBaseURL))
	}

	return openai.New(opts...)
}

// GenerateTransformation generates a note based on transformation type
func (a *Agent) GenerateTransformation(ctx context.Context, req *TransformationRequest, sources []Source) (*TransformationResponse, error) {
	// Build context from sources
	var sourceContext strings.Builder
	for i, src := range sources {
		sourceContext.WriteString(fmt.Sprintf("\n## Source %d: %s\n", i+1, src.Name))

		// Use MaxContextLength from config, or default to a safe large value if not set (or too small)
		limit := a.cfg.MaxContextLength
		if limit <= 0 {
			limit = 100000 // Default to 100k chars if config is invalid
		}

		if src.Content != "" {
			if len(src.Content) <= limit {
				sourceContext.WriteString(src.Content)
			} else {
				// Truncate content instead of replacing it entirely
				sourceContext.WriteString(src.Content[:limit])
				sourceContext.WriteString(fmt.Sprintf("\n... [Content truncated, total length: %d]", len(src.Content)))
			}
		} else {
			sourceContext.WriteString(fmt.Sprintf("[Source content: %s, type: %s]", src.Name, src.Type))
		}
		sourceContext.WriteString("\n")
	}

	// Build prompt using f-string format (no Go template reserved names issue)
	promptTemplate := getTransformationPromptWithStyle(req.Type, req.Style)

	prompt := prompts.NewPromptTemplate(
		promptTemplate,
		[]string{"sources", "type", "length", "format", "prompt"},
	)
	prompt.TemplateFormat = prompts.TemplateFormatFString

	promptValue, err := prompt.Format(map[string]any{
		"sources": sourceContext.String(),
		"type":    req.Type,
		"length":  req.Length,
		"format":  req.Format,
		"prompt":  req.Prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to format prompt: %w", err)
	}

	// Generate response
	var response string
	var genErr error

	if req.Type == "ppt" {
		response, genErr = a.provider.GenerateTextWithModel(ctx, promptValue, "gemini-3-flash-preview")
	} else if req.Type == "insight" {
		// For insight type: first generate a summary, then call DeepInsight
		ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
		defer cancel()

		// Step 1: Generate summary
		summary, err := a.provider.GenerateFromSinglePrompt(ctx, a.llm, promptValue)
		if err != nil {
			return nil, fmt.Errorf("failed to generate summary: %w", err)
		}

		// Step 2: Call DeepInsight with the summary
		response, err = a.callDeepInsight(ctx, summary)
		if err != nil {
			return nil, fmt.Errorf("failed to generate deep insight: %w", err)
		}
	} else {
		ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
		defer cancel()
		response, genErr = a.provider.GenerateFromSinglePrompt(ctx, a.llm, promptValue)
	}

	if genErr != nil {
		return nil, fmt.Errorf("failed to generate response: %w", genErr)
	}

	// Build source summaries
	sourceSummaries := make([]SourceSummary, len(sources))
	for i, src := range sources {
		sourceSummaries[i] = SourceSummary{
			ID:   src.ID,
			Name: src.Name,
			Type: src.Type,
		}
	}

	return &TransformationResponse{
		Type:      req.Type,
		Content:   response,
		Sources:   sourceSummaries,
		CreatedAt: time.Now(),
		Metadata: map[string]interface{}{
			"length": req.Length,
			"format": req.Format,
		},
	}, nil
}

// Chat performs a chat query with RAG
func (a *Agent) Chat(ctx context.Context, store *Store, notebookID, sessionID, message string, history []ChatMessage) (*ChatResponse, error) {
	// Generate a unique message ID for this response
	messageID := uuid.New().String()

	// Perform similarity search to find relevant sources
	docs, err := a.vectorStore.SimilaritySearch(ctx, notebookID, message, a.cfg.MaxSources)
	if err != nil {
		return nil, fmt.Errorf("failed to search documents: %w", err)
	}

	// Extract unique source IDs and names from documents
	sourceIDs := make([]string, 0)
	sourceIDMap := make(map[string]bool)
	sourceNameMap := make(map[string]string)
	for _, doc := range docs {
		if sourceID, ok := doc.Metadata["source_id"].(string); ok && sourceID != "" {
			if !sourceIDMap[sourceID] {
				sourceIDMap[sourceID] = true
				sourceIDs = append(sourceIDs, sourceID)
			}
		}
		// Also collect source names for backward compatibility with old documents
		if sourceName, ok := doc.Metadata["source_name"].(string); ok {
			sourceNameMap[sourceName] = sourceName
		}
		// For even older documents that use "source" key
		if sourceName, ok := doc.Metadata["source"].(string); ok {
			sourceNameMap[sourceName] = sourceName
		}
	}

	// Fetch full source objects from database
	sourcesMap := make(map[string]*Source)
	if len(sourceIDs) > 0 && store != nil {
		for _, sourceID := range sourceIDs {
			source, err := store.GetSource(ctx, sourceID)
			if err == nil && source != nil {
				sourcesMap[sourceID] = source
			} else if err != nil {
				golog.Warnf("[Agent.Chat] Failed to get source %s: %v", sourceID, err)
			}
		}
	}

	// Build context from retrieved documents
	var contextBuilder strings.Builder
	if len(docs) > 0 {
		contextBuilder.WriteString("来源中的相关信息：\n\n")
		for i, doc := range docs {
			contextBuilder.WriteString(fmt.Sprintf("[来源 %d] %s\n", i+1, doc.PageContent))
			// Use source_name from metadata for context display
			if sourceName, ok := doc.Metadata["source_name"].(string); ok {
				contextBuilder.WriteString(fmt.Sprintf("来源: %s\n\n", sourceName))
			} else if sourceName, ok := doc.Metadata["source"].(string); ok {
				contextBuilder.WriteString(fmt.Sprintf("来源: %s\n\n", sourceName))
			}
		}
	}

	// Build chat history (limit to configurable number of messages)
	maxHistory := a.cfg.MaxChatHistory
	if maxHistory <= 0 {
		maxHistory = 20
	}
	var historyBuilder strings.Builder
	for i, msg := range history {
		if i >= maxHistory {
			break
		}
		role := "用户"
		if msg.Role == "assistant" {
			role = "助手"
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", role, msg.Content))
	}

	// Get conversation summary if available (from session metadata via memory manager)
	var summary string
	if a.memoryManager != nil && sessionID != "" && store != nil {
		session, err := store.GetChatSession(ctx, sessionID)
		if err == nil && session.Metadata != nil {
			if s, ok := session.Metadata["summary"].(string); ok {
				summary = s
			}
		}
	}

	// Create RAG prompt using Go template format
	promptTemplate := prompts.NewPromptTemplate(
		chatSystemPrompt(),
		[]string{"summary", "history", "context", "question"},
	)
	promptTemplate.TemplateFormat = prompts.TemplateFormatGoTemplate

	promptValue, err := promptTemplate.Format(map[string]any{
		"summary":  summary,
		"history":  historyBuilder.String(),
		"context":  contextBuilder.String(),
		"question": message,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to format prompt: %w", err)
	}

	// Generate response
	responseCtx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	response, err := a.provider.GenerateFromSinglePrompt(responseCtx, a.llm, promptValue)
	if err != nil {
		return nil, fmt.Errorf("failed to generate response: %w", err)
	}

	// Build source summaries - prefer database sources, fall back to source names
	sourceSummaries := make([]SourceSummary, 0)
	seenSources := make(map[string]bool)

	// First add sources from database lookup
	for sourceID := range sourceIDMap {
		if source, exists := sourcesMap[sourceID]; exists && !seenSources[sourceID] {
			sourceSummaries = append(sourceSummaries, SourceSummary{
				ID:   source.ID,
				Name: source.Name,
				Type: source.Type,
			})
			seenSources[sourceID] = true
			seenSources[source.Name] = true
		}
	}

	// For backward compatibility, add any source names that weren't found in database
	for sourceName := range sourceNameMap {
		if !seenSources[sourceName] {
			sourceSummaries = append(sourceSummaries, SourceSummary{
				ID:   sourceName,
				Name: sourceName,
				Type: "file",
			})
			seenSources[sourceName] = true
		}
	}

	return &ChatResponse{
		Message:   response,
		Sources:   sourceSummaries,
		SessionID: notebookID,
		MessageID: messageID,
		Metadata: map[string]interface{}{
			"docs_retrieved": len(docs),
		},
	}, nil
}

// Slide represents a parsed PPT slide
type Slide struct {
	Style   string
	Content string
}

// ParsePPTSlides parses the LLM output into individual slides
func (a *Agent) ParsePPTSlides(content string) []Slide {
	var slides []Slide

	// 1. Extract style instructions
	style := ""
	styleStart := strings.Index(content, "<STYLE_INSTRUCTIONS>")
	styleEnd := strings.Index(content, "</STYLE_INSTRUCTIONS>")
	if styleStart != -1 && styleEnd > styleStart {
		style = content[styleStart+20 : styleEnd]
	}

	// 2. Split by Slide markers.
	// We look for "Slide X" or "幻灯片 X" with optional Markdown headers
	re := regexp.MustCompile(`(?m)^(?:\s*#{1,6}\s*)?(?:Slide|幻灯片|第\d+张幻灯片|##)\s*\d+[:\s]*.*$`)
	indices := re.FindAllStringIndex(content, -1)

	if len(indices) > 0 {
		for i := 0; i < len(indices); i++ {
			start := indices[i][0]
			end := len(content)
			if i+1 < len(indices) {
				end = indices[i+1][0]
			}

			slideContent := content[start:end]
			// Validation: Must contain at least one of the section markers
			lower := strings.ToLower(slideContent)
			if strings.Contains(lower, "叙事目标") ||
				strings.Contains(lower, "narrative goal") ||
				strings.Contains(lower, "关键内容") {
				slides = append(slides, Slide{
					Style:   style,
					Content: slideContent,
				})
			}
		}
	}

	// 3. If still nothing, try splitting by the required // NARRATIVE GOAL / // 叙事目标
	if len(slides) == 0 {
		// Use a more specific marker for splitting if Slide headers are missing
		marker := "// 叙事目标"
		if !strings.Contains(content, marker) {
			marker = "// NARRATIVE GOAL"
		}

		if strings.Contains(content, marker) {
			parts := strings.Split(content, marker)
			for i := 1; i < len(parts); i++ {
				slides = append(slides, Slide{
					Style:   style,
					Content: marker + parts[i],
				})
			}
		}
	}

	// Final fallback for completely unstructured content
	if len(slides) == 0 {
		slides = append(slides, Slide{Style: style, Content: content})
	}

	return slides
}

// GeneratePodcastScript generates a podcast script from sources
func (a *Agent) GeneratePodcastScript(ctx context.Context, sources []Source, voice string) (string, error) {
	req := &TransformationRequest{
		Type:   "podcast",
		Length: "medium",
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateOutline generates an outline from sources
func (a *Agent) GenerateOutline(ctx context.Context, sources []Source) (string, error) {
	req := &TransformationRequest{
		Type:   "outline",
		Length: "detailed",
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateFAQ generates an FAQ from sources
func (a *Agent) GenerateFAQ(ctx context.Context, sources []Source) (string, error) {
	req := &TransformationRequest{
		Type:   "faq",
		Length: "comprehensive",
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateStudyGuide generates a study guide from sources
func (a *Agent) GenerateStudyGuide(ctx context.Context, sources []Source) (string, error) {
	req := &TransformationRequest{
		Type:   "study_guide",
		Length: "comprehensive",
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateExamNotes generates exam notes from sources
func (a *Agent) GenerateExamNotes(ctx context.Context, sources []Source) (string, error) {
	req := &TransformationRequest{
		Type:   "exam_notes",
		Length: "comprehensive",
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateTextbook generates a textbook logically structured with exactly 5 chapters, formatting in Markdown, cross-referencing chapters, and ending Chapter 5 with exactly 10 revision questions based ONLY on the combinedText.
func (a *Agent) GenerateTextbook(ctx context.Context, notebookName string, combinedText string) (string, error) {
	prompt := fmt.Sprintf(`You are an expert academic author. Create a comprehensive textbook based ONLY on the following source material.
The textbook must be for the notebook named "%s".

Requirements:
- Exactly 5 chapters.
- Format using Markdown.
- Cross-reference chapters where appropriate.
- End Chapter 5 with exactly 10 revision questions based ONLY on the provided text.

Source Material:
%s`, notebookName, combinedText)

	return a.provider.GenerateTextWithModel(ctx, prompt, a.cfg.OpenAIModel)
}

// GenerateSummary generates a summary from sources
func (a *Agent) GenerateSummary(ctx context.Context, sources []Source, length string) (string, error) {
	req := &TransformationRequest{
		Type:   "summary",
		Length: length,
		Format: "markdown",
	}

	resp, err := a.GenerateTransformation(ctx, req, sources)
	if err != nil {
		return "", err
	}

	return resp.Content, nil
}

// GenerateNotebookOverview generates a summary and 3 deep questions from all sources
func (a *Agent) GenerateNotebookOverview(ctx context.Context, sources []Source) (*NotebookOverviewResponse, error) {
	golog.Infof("[GenerateNotebookOverview] Start - sourceCount: %d", len(sources))

	// Build context from sources
	var sourceContext strings.Builder
	for i, src := range sources {
		sourceContext.WriteString(fmt.Sprintf("\n## Source %d: %s\n", i+1, src.Name))

		// Use MaxContextLength from config, or default to a safe large value
		limit := a.cfg.MaxContextLength
		if limit <= 0 {
			limit = 100000
		}

		if src.Content != "" {
			if len(src.Content) <= limit {
				sourceContext.WriteString(src.Content)
			} else {
				sourceContext.WriteString(src.Content[:limit])
				sourceContext.WriteString(fmt.Sprintf("\n... [Content truncated, total length: %d]", len(src.Content)))
			}
		} else {
			sourceContext.WriteString(fmt.Sprintf("[Source content: %s, type: %s]", src.Name, src.Type))
		}
		sourceContext.WriteString("\n")
	}

	// Build prompt
	promptTemplate := prompts.NewPromptTemplate(
		notebookOverviewPrompt(),
		[]string{"sources"},
	)
	promptTemplate.TemplateFormat = prompts.TemplateFormatGoTemplate

	promptValue, err := promptTemplate.Format(map[string]any{
		"sources": sourceContext.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to format prompt: %w", err)
	}

	// Generate response
	responseCtx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	response, err := a.provider.GenerateFromSinglePrompt(responseCtx, a.llm, promptValue)
	if err != nil {
		golog.Errorf("[GenerateNotebookOverview] Failed - error: %v", err)
		return nil, fmt.Errorf("failed to generate overview: %w", err)
	}

	// Clean response: remove markdown code blocks if present
	cleanedResponse := response
	if strings.Contains(cleanedResponse, "```") {
		// Find content between code blocks
		codeBlockStart := strings.Index(cleanedResponse, "```")
		if codeBlockStart != -1 {
			// Skip the ``` and any language identifier
			afterStart := cleanedResponse[codeBlockStart+3:]
			lineEnd := strings.Index(afterStart, "\n")
			if lineEnd != -1 {
				cleanedResponse = afterStart[lineEnd+1:]
			}
			// Find the closing ```
			codeBlockEnd := strings.LastIndex(cleanedResponse, "```")
			if codeBlockEnd != -1 {
				cleanedResponse = strings.TrimSpace(cleanedResponse[:codeBlockEnd])
			}
		}
	}

	// Parse JSON response
	var result NotebookOverviewResponse
	if err := json.Unmarshal([]byte(cleanedResponse), &result); err != nil {
		golog.Errorf("[GenerateNotebookOverview] Failed to parse JSON: %v, cleaned response: %s", err, cleanedResponse)
		return nil, fmt.Errorf("failed to parse overview response: %w", err)
	}

	golog.Infof("[GenerateNotebookOverview] Success - summaryLength: %d, questionCount: %d",
		len(result.Summary), len(result.Questions))
	return &result, nil
}

// callDeepInsight executes the DeepInsight CLI tool and returns the generated report
func (a *Agent) callDeepInsight(ctx context.Context, summary string) (string, error) {
	// Create a temporary file for the report output
	tmpFile := "./tmp/deepinsight_report_" + fmt.Sprintf("%d", time.Now().Unix()) + ".md"

	// Execute DeepInsight command
	// DeepInsight -o report.md "summary text"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	output, err := execCommandContext(ctx, "./DeepInsight", "-o", tmpFile, escapeShellArg(summary))
	if err != nil {
		golog.Infof("failed to exec DeepInsight: err=%v, output=%s", err, output)
		return "", fmt.Errorf("DeepInsight command failed: %w, output: %s", err, output)
	}

	// Read the generated report
	reportContent, err := execCommandContext(ctx, "/bin/cat", tmpFile)
	if err != nil {
		golog.Infof("failed to read DeepInsight report: err=%v, output=%s", err, output)
		return "", fmt.Errorf("failed to read DeepInsight report: %w", err)
	}

	// Clean up temp file
	_, _ = execCommandContext(context.Background(), "/bin/rm", "-f", tmpFile)

	return reportContent, nil
}

// escapeShellArg escapes a shell argument to prevent injection
func escapeShellArg(arg string) string {
	return "'" + strings.ReplaceAll(arg, "'", "'\"'\"'") + "'"
}

// execCommandContext is a helper to execute commands with context
func execCommandContext(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), err
	}
	return string(output), nil
}
