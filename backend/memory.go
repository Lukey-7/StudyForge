package backend

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/prompts"
)

// MemoryConfig holds configuration for the MemoryManager
type MemoryConfig struct {
	MaxHistory          int      // Maximum number of messages to keep in active memory
	SummaryThreshold    int      // Number of messages that triggers summary generation (fallback)
	SummaryTokenLimit   int      // Token limit for summary generation
	ImportantKeywords   []string // Keywords that mark important messages
	RecencyDecay        float64  // Exponential decay factor for recency scoring (0.0-1.0)
	KeywordMatchWeight  float64  // Weight for keyword matching in scoring
	QueryRelevanceWeight float64 // Weight for query relevance in scoring
	SourceRefWeight     float64  // Weight for source references in scoring
	MaxContextBytes     int      // Maximum bytes for context window (default: 100000)
	BytesThreshold      int      // Threshold bytes that triggers memory compression (default: 90000)
}

// DefaultMemoryConfig returns a default configuration for MemoryManager
func DefaultMemoryConfig() MemoryConfig {
	return MemoryConfig{
		MaxHistory:          10,
		SummaryThreshold:    20, // Generate summary when messages exceed 2x maxHistory (fallback)
		SummaryTokenLimit:   2000,
		ImportantKeywords: []string{
			"note", "important", "key", "critical", "essential", "remember",
			"conclusion", "summary", "result", "outcome",
			"decision", "choose", "select", "determine",
			"problem", "issue", "question", "concern",
			"need", "require", "want", "must",
			"goal", "objective", "target", "aim",
		},
		RecencyDecay:        0.1, // Exponential decay
		KeywordMatchWeight:  5.0,
		QueryRelevanceWeight: 8.0,
		SourceRefWeight:     3.0,
		MaxContextBytes:     100000, // Maximum bytes for context window
		BytesThreshold:      90000,  // Trigger memory compression at 90% of max
	}
}

// MemoryManager manages conversation memory and context for chat sessions
type MemoryManager struct {
	store   *Store
	llm     llms.Model
	config  MemoryConfig
}

// ConversationState represents the state of a conversation
type ConversationState struct {
	SessionID    string
	Summary      string           // Conversation summary
	History      []ChatMessage    // Raw history
	MemoryBuffer []ChatMessage    // Selected important messages
	ContextDocs  []DocumentRef    // Current context documents
}

// DocumentRef represents a reference to a document
type DocumentRef struct {
	ID         string
	Name       string
	Relevance  float64
}

// NewMemoryManager creates a new memory manager with default configuration
func NewMemoryManager(store *Store, llm llms.Model, maxHistory int) *MemoryManager {
	config := DefaultMemoryConfig()
	if maxHistory > 0 {
		config.MaxHistory = maxHistory
		config.SummaryThreshold = maxHistory * 2
	}

	return &MemoryManager{
		store:  store,
		llm:    llm,
		config: config,
	}
}

// NewMemoryManagerWithConfig creates a new memory manager with custom configuration
func NewMemoryManagerWithConfig(store *Store, llm llms.Model, config MemoryConfig) *MemoryManager {
	if config.MaxHistory <= 0 {
		config.MaxHistory = 10
	}
	if config.SummaryThreshold <= 0 {
		config.SummaryThreshold = config.MaxHistory * 2
	}
	if config.SummaryTokenLimit <= 0 {
		config.SummaryTokenLimit = 2000
	}
	if config.RecencyDecay <= 0 {
		config.RecencyDecay = 0.1
	}
	if config.KeywordMatchWeight <= 0 {
		config.KeywordMatchWeight = 5.0
	}
	if config.QueryRelevanceWeight <= 0 {
		config.QueryRelevanceWeight = 8.0
	}
	if config.SourceRefWeight <= 0 {
		config.SourceRefWeight = 3.0
	}
	if config.MaxContextBytes <= 0 {
		config.MaxContextBytes = 100000
	}
	if config.BytesThreshold <= 0 {
		config.BytesThreshold = 90000
	}

	return &MemoryManager{
		store:  store,
		llm:    llm,
		config: config,
	}
}

// GetConversationHistory retrieves and processes conversation history for a session
// It implements a sliding window + summary strategy based on bytes size
func (m *MemoryManager) GetConversationHistory(ctx context.Context, sessionID, currentQuery string) ([]ChatMessage, string, error) {
	// 1. Retrieve all historical messages and metadata from GetChatSession (avoid duplicate queries)
	session, err := m.store.GetChatSession(ctx, sessionID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get session: %w", err)
	}

	allHistory := session.Messages

	if len(allHistory) == 0 {
		return []ChatMessage{}, "", nil
	}

	// 2. Get existing summary from session metadata
	var summary string
	if session.Metadata != nil {
		if s, ok := session.Metadata["summary"].(string); ok {
			summary = s
		}
	}

	// 3. Calculate current context bytes
	totalBytes := m.calculateMessagesBytes(allHistory, "")
	summaryBytes := len(summary)
	contextBytes := totalBytes + summaryBytes

	golog.Infof("[MemoryManager] Session %s context stats: messages=%d, contextBytes=%d, summaryBytes=%d, threshold=%d, max=%d",
		sessionID, len(allHistory), contextBytes, summaryBytes, m.config.BytesThreshold, m.config.MaxContextBytes)

	// 4. Memory management strategy based on bytes size
	if contextBytes >= m.config.BytesThreshold {
		golog.Infof("[MemoryManager] Context bytes %d >= threshold %d, triggering memory compression", contextBytes, m.config.BytesThreshold)

		// Strategy 1: Apply sliding window (compress messages)
		compressedMessages := m.applySlidingWindow(allHistory, currentQuery)
		compressedBytes := m.calculateMessagesBytes(compressedMessages, summary)

		golog.Infof("[MemoryManager] After sliding window: messages=%d, bytes=%d", len(compressedMessages), compressedBytes)

		// Strategy 2: If still over threshold after sliding window, generate summary
		if compressedBytes >= m.config.BytesThreshold && m.llm != nil {
			golog.Infof("[MemoryManager] Bytes %d still >= threshold after sliding window, generating summary", compressedBytes)

			newSummary, err := m.generateSummary(ctx, compressedMessages)
			if err != nil {
				golog.Warnf("[MemoryManager] Failed to generate summary: %v", err)
			} else {
				summary = newSummary
				// Save summary to session metadata
				if err := m.updateSessionSummary(ctx, sessionID, summary); err != nil {
					golog.Warnf("[MemoryManager] Failed to save summary: %v", err)
				}

				// Recalculate with new summary and try sliding window again
				summaryBytes = len(summary)
				compressedMessages = m.applySlidingWindow(allHistory, summary)
				compressedBytes = m.calculateMessagesBytes(compressedMessages, summary)
				golog.Infof("[MemoryManager] After summary generation: summaryBytes=%d, messages=%d, bytes=%d",
					summaryBytes, len(compressedMessages), compressedBytes)
			}
		}

		return compressedMessages, summary, nil
	}

	// 5. Normal path: apply sliding window with current query for relevance
	recentHistory := m.applySlidingWindow(allHistory, currentQuery)

	return recentHistory, summary, nil
}

// generateSummary generates an intelligent summary of the conversation history
// It captures user intent, decisions, action items, and key topics
func (m *MemoryManager) generateSummary(ctx context.Context, messages []ChatMessage) (string, error) {
	if m.llm == nil {
		// Fallback: return simple message count if no LLM available
		return fmt.Sprintf("Conversation contains %d messages", len(messages)), nil
	}

	// Build history text for summary generation
	// Use more messages for better context, but limit to avoid token overflow
	maxMessagesForSummary := minInt(len(messages), 30)

	var historyText strings.Builder
	historyText.WriteString("Please summarize the following conversation in English, focusing on:\n")
	historyText.WriteString("1. The user's main needs and goals\n")
	historyText.WriteString("2. Key themes and topics discussed\n")
	historyText.WriteString("3. Important decisions or conclusions\n")
	historyText.WriteString("4. To-dos or action items\n")
	historyText.WriteString("5. Main sources or materials referenced\n\n")
	historyText.WriteString("Conversation History:\n")

	for i := len(messages) - maxMessagesForSummary; i < len(messages); i++ {
		msg := messages[i]
		role := "User"
		if msg.Role == "assistant" {
			role = "Assistant"
		}
		historyText.WriteString(fmt.Sprintf("%s: %s\n", role, msg.Content))
	}

	// Enhanced summary prompt template
	promptTemplate := prompts.NewPromptTemplate(
		historyText.String()+"\n\nSummary (please be concise, avoid using markdown tags):",
		[]string{},
	)
	promptTemplate.TemplateFormat = prompts.TemplateFormatGoTemplate

	promptValue, err := promptTemplate.Format(map[string]any{})
	if err != nil {
		return "", err
	}

	// Generate summary with timeout
	summaryCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	response, err := llms.GenerateFromSinglePrompt(summaryCtx, m.llm, promptValue)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(response), nil
}

// selectRelevantHistory selects the most relevant messages from history based on current query
// It uses a multi-factor scoring algorithm considering:
// - Recency (exponential decay - more recent messages have higher weight)
// - Keyword matching (important keywords increase score)
// - Query relevance (direct matches with current query)
// - Source references (messages with sources are more important)
func (m *MemoryManager) selectRelevantHistory(messages []ChatMessage, currentQuery string, maxCount int) []ChatMessage {
	if len(messages) <= maxCount {
		return messages
	}

	type msgScore struct {
		msg   ChatMessage
		score float64
	}

	scores := make([]msgScore, len(messages))
	queryLower := strings.ToLower(currentQuery)
	queryWords := strings.Fields(queryLower) // Extract words for better matching

	for i, msg := range messages {
		score := 0.0
		msgLower := strings.ToLower(msg.Content)

		// 1. Exponential recency score - more recent messages have exponentially higher weight
		// Using exponential decay: score = base * e^(decay * position_ratio)
		positionRatio := float64(i) / float64(len(messages))
		recencyScore := 15.0 * math.Exp(m.config.RecencyDecay*positionRatio*10) / math.Exp(m.config.RecencyDecay*10)
		score += recencyScore

		// 2. Keyword matching - check for important keywords
		keywordMatches := 0
		for _, keyword := range m.config.ImportantKeywords {
			if strings.Contains(msgLower, strings.ToLower(keyword)) {
				keywordMatches++
			}
		}
		score += float64(keywordMatches) * m.config.KeywordMatchWeight

		// 3. Query relevance - multi-word matching for better accuracy
		queryMatchCount := 0
		for _, word := range queryWords {
			if len(word) > 2 && strings.Contains(msgLower, word) {
				queryMatchCount++
			}
		}
		if queryMatchCount > 0 {
			score += float64(queryMatchCount) * (m.config.QueryRelevanceWeight / float64(len(queryWords)+1))
		}

		// 4. Source references - messages citing sources are more important
		if len(msg.Sources) > 0 {
			score += m.config.SourceRefWeight * float64(len(msg.Sources))
		}

		// 5. Length penalty - very short messages might be less important
		if len(msg.Content) < 20 {
			score *= 0.8
		}

		scores[i] = msgScore{msg: messages[i], score: score}
	}

	// Sort by score (descending) - using simple bubble sort for compatibility
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	// Select top-k messages
	selected := make([]ChatMessage, 0, maxCount)
	for i := 0; i < minInt(maxCount, len(scores)); i++ {
		selected = append(selected, scores[i].msg)
	}

	// Sort selected messages by creation time to maintain chronological order
	for i := 0; i < len(selected); i++ {
		for j := i + 1; j < len(selected); j++ {
			if selected[j].CreatedAt.Before(selected[i].CreatedAt) {
				selected[i], selected[j] = selected[j], selected[i]
			}
		}
	}

	return selected
}

// updateSessionSummary updates the session summary in metadata
func (m *MemoryManager) updateSessionSummary(ctx context.Context, sessionID, summary string) error {
	session, err := m.store.GetChatSession(ctx, sessionID)
	if err != nil {
		return err
	}

	if session.Metadata == nil {
		session.Metadata = make(map[string]interface{})
	}
	session.Metadata["summary"] = summary
	session.Metadata["summary_updated_at"] = time.Now().Format(time.RFC3339)

	return m.store.UpdateSessionMetadata(ctx, sessionID, session.Metadata)
}

// ClearMemory clears the memory buffer for a session (useful for resetting context)
func (m *MemoryManager) ClearMemory(ctx context.Context, sessionID string) error {
	// Clear summary
	session, err := m.store.GetChatSession(ctx, sessionID)
	if err != nil {
		return err
	}

	if session.Metadata != nil {
		delete(session.Metadata, "summary")
		delete(session.Metadata, "summary_updated_at")
		return m.store.UpdateSessionMetadata(ctx, sessionID, session.Metadata)
	}

	return nil
}

// CompressMessages merges consecutive messages from the same role to reduce context size
// This is useful for reducing token usage while maintaining conversation flow
func (m *MemoryManager) CompressMessages(messages []ChatMessage) []ChatMessage {
	if len(messages) <= 1 {
		return messages
	}

	compressed := make([]ChatMessage, 0, len(messages))

	i := 0
	for i < len(messages) {
		current := messages[i]

		// Check if next message has same role and can be merged
		if i+1 < len(messages) && current.Role == messages[i+1].Role {
			// Merge consecutive messages from same role
			merged := ChatMessage{
				Role:      current.Role,
				Content:   current.Content,
				CreatedAt: current.CreatedAt,
				Sources:   append([]string{}, current.Sources...),
			}

			// Keep merging while next message has same role
			i++
			for i < len(messages) && messages[i].Role == current.Role {
				merged.Content += "\n" + messages[i].Content
				merged.Sources = append(merged.Sources, messages[i].Sources...)
				i++
			}

			compressed = append(compressed, merged)
		} else {
			compressed = append(compressed, current)
			i++
		}
	}

	return compressed
}

// GetStats returns statistics about the memory state for a session
func (m *MemoryManager) GetStats(ctx context.Context, sessionID string) (map[string]interface{}, error) {
	session, err := m.store.GetChatSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	stats := map[string]interface{}{
		"total_messages":      len(session.Messages),
		"max_history":         m.config.MaxHistory,
		"summary_threshold":   m.config.SummaryThreshold,
		"has_summary":         false,
		"summary_updated_at":  nil,
		"important_keywords_count": len(m.config.ImportantKeywords),
	}

	if session.Metadata != nil {
		if summary, ok := session.Metadata["summary"].(string); ok && summary != "" {
			stats["has_summary"] = true
			stats["summary_length"] = len(summary)
		}
		if updatedAt, ok := session.Metadata["summary_updated_at"].(string); ok {
			stats["summary_updated_at"] = updatedAt
		}
	}

	return stats, nil
}

// GenerateTitle generates a short title for a chat session based on the first user message
func (m *MemoryManager) GenerateTitle(ctx context.Context, firstUserMessage string) (string, error) {
	if m.llm == nil {
		// Fallback: truncate the message if no LLM available (use rune-based slicing)
		runes := []rune(firstUserMessage)
		if len(runes) > 15 {
			return string(runes[:15]) + "...", nil
		}
		return firstUserMessage, nil
	}

	// Generate a short, concise title
	promptTemplate := prompts.NewPromptTemplate(
		`Based on the following user question, generate a short session title (maximum 5 words, do not use punctuation):

User Question: {{.message}}

Title:`,
		[]string{"message"},
	)
	promptTemplate.TemplateFormat = prompts.TemplateFormatGoTemplate

	promptValue, err := promptTemplate.Format(map[string]any{
		"message": firstUserMessage,
	})
	if err != nil {
		return "", err
	}

	// Generate title with timeout
	titleCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	response, err := llms.GenerateFromSinglePrompt(titleCtx, m.llm, promptValue)
	if err != nil {
		return "", err
	}

	// Clean up the title
	title := strings.TrimSpace(response)
	// Remove quotes and common punctuation
	title = strings.Trim(title, `"'""，。！？、；：""''「」【】《》`)

	// Truncate if too long (use rune-based slicing for multi-byte characters)
	runes := []rune(title)
	if len(runes) > 15 {
		runes = runes[:15]
	}
	title = string(runes)

	if title == "" {
		return "New Chat", nil
	}

	return title, nil
}

// minInt returns the minimum of two integers
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// calculateMessagesBytes calculates the total bytes of messages with optional summary
func (m *MemoryManager) calculateMessagesBytes(messages []ChatMessage, summary string) int {
	totalBytes := len(summary) // Include summary in calculation

	for _, msg := range messages {
		totalBytes += len(msg.Role)
		totalBytes += len(msg.Content)
		// Account for role prefix and formatting overhead
		totalBytes += 20 // Approximate overhead for role formatting (e.g., "User: \nAssistant: ")
	}

	return totalBytes
}

// applySlidingWindow applies sliding window compression to reduce context bytes
// It selects relevant messages based on scoring and ensures the result fits within max bytes
func (m *MemoryManager) applySlidingWindow(messages []ChatMessage, currentQuery string) []ChatMessage {
	if len(messages) <= m.config.MaxHistory {
		return messages
	}

	// First pass: Use selectRelevantHistory to get the most relevant messages
	relevantMessages := m.selectRelevantHistory(messages, currentQuery, m.config.MaxHistory)

	// Calculate bytes of selected messages
	currentBytes := m.calculateMessagesBytes(relevantMessages, "")

	// If still too large, apply byte-based truncation
	if currentBytes > m.config.MaxContextBytes {
		return m.truncateToMaxBytes(relevantMessages, m.config.MaxContextBytes)
	}

	return relevantMessages
}

// truncateToMaxBytes truncates messages to fit within the specified byte limit
// It keeps the most recent messages while removing older ones as needed
func (m *MemoryManager) truncateToMaxBytes(messages []ChatMessage, maxBytes int) []ChatMessage {
	// Start from the end (most recent messages)
	var result []ChatMessage
	var totalBytes int

	for i := len(messages) - 1; i >= 0; i-- {
		msgBytes := len(messages[i].Role) + len(messages[i].Content) + 20 // 20 for formatting overhead

		if totalBytes+msgBytes > maxBytes {
			break
		}

		result = append([]ChatMessage{messages[i]}, result...)
		totalBytes += msgBytes
	}

	if len(result) == 0 && len(messages) > 0 {
		// Always keep at least the last message if possible
		result = []ChatMessage{messages[len(messages)-1]}
	}

	golog.Infof("[MemoryManager] Truncated messages from %d to %d, bytes: %d/%d",
		len(messages), len(result), totalBytes, maxBytes)

	return result
}
