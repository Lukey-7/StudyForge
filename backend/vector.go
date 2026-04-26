package backend

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/kataras/golog"
	"github.com/tmc/langchaingo/schema"
)

// VectorStore wraps different vector store implementations
type VectorStore struct {
	cfg  Config
	docs []schema.Document
	mu   sync.RWMutex
}

// VectorStats contains statistics about the vector store
type VectorStats struct {
	TotalDocuments int
	TotalVectors   int
	Dimension      int
}

// NewVectorStore creates a new vector store based on configuration
func NewVectorStore(cfg Config) (*VectorStore, error) {
	// Ensure data directory exists
	if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	return &VectorStore{
		cfg:  cfg,
		docs: make([]schema.Document, 0),
	}, nil
}

// IngestDocuments loads and indexes documents from file paths
func (vs *VectorStore) IngestDocuments(ctx context.Context, notebookID string, paths []string) error {
	for _, path := range paths {
		fmt.Printf("[VectorStore] Loading file: %s\n", path)

		content, err := vs.ExtractDocument(ctx, path)
		if err != nil {
			return fmt.Errorf("failed to extract document %s: %w", path, err)
		}

		fmt.Printf("[VectorStore] File loaded, size: %d bytes\n", len(content))
		if _, err := vs.IngestText(ctx, notebookID, filepath.Base(path), content); err != nil {
			return err
		}
	}

	return nil
}

// ExtractDocument reads and converts a document to text/markdown
func (vs *VectorStore) ExtractDocument(ctx context.Context, path string) (string, error) {
	// Check if file is an audio file
	ext := strings.ToLower(filepath.Ext(path))
	if vs.isAudioFile(ext) {
		return vs.transcribeAudio(path)
	}

	// Check if file needs markitdown conversion
	if vs.cfg.EnableMarkitdown && vs.needsMarkitdown(ext) {
		content, err := vs.convertWithMarkitdown(path)
		if err != nil {
			// markitdown failed, fall back to simple text extraction
			golog.Warnf("[VectorStore] markitdown conversion failed for %s: %v, falling back to simple text extraction", path, err)
			// Continue to fallback below
		} else {
			return content, nil
		}
	}

	// Direct read for text files or as fallback when markitdown fails
	bytes, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// IngestText ingests raw text content
func (vs *VectorStore) IngestText(ctx context.Context, notebookID, sourceName, content string) (int, error) {
	// Split content into chunks
	chunks := vs.splitText(content, vs.cfg.ChunkSize, vs.cfg.ChunkOverlap)

	vs.mu.Lock()
	defer vs.mu.Unlock()

	// Create documents
	for i, chunk := range chunks {
		doc := schema.Document{
			PageContent: chunk,
			Metadata: map[string]any{
				"notebook_id": notebookID,
				"source":      sourceName,
				"chunk":       i,
			},
		}
		vs.docs = append(vs.docs, doc)
	}

	golog.Infof("[VectorStore] Ingested %d chunks from source '%s' (total docs: %d)\n", len(chunks), sourceName, len(vs.docs))
	return len(chunks), nil
}

// splitText splits text into chunks
func (vs *VectorStore) splitText(text string, chunkSize, chunkOverlap int) []string {
	if chunkSize <= 0 {
		chunkSize = 1000
	}
	if chunkOverlap < 0 {
		chunkOverlap = 200
	}

	// Quiet output for large texts
	if len(text) > 10000 {
		fmt.Printf("[VectorStore] Splitting text (len=%d)...\n", len(text))
	} else {
		fmt.Printf("[VectorStore] Splitting text (len=%d, chunkSize=%d, overlap=%d)\n", len(text), chunkSize, chunkOverlap)
	}

	var chunks []string

	// Check if text contains mostly CJK characters (Chinese, Japanese, Korean)
	runes := []rune(text)
	cjkCount := 0
	sampleSize := 1000
	if len(runes) < sampleSize {
		sampleSize = len(runes)
	}
	for i := 0; i < sampleSize; i++ {
		r := runes[i]
		if r >= 0x4E00 && r <= 0x9FFF { // CJK Unified Ideographs
			cjkCount++
		}
	}
	cjkRatio := float64(cjkCount) / float64(sampleSize)

	if cjkRatio > 0.3 {
		// For CJK text, split by character count (runes)
		// fmt.Println("[VectorStore] Using CJK splitting (by character count)")
		for i := 0; i < len(runes); i += (chunkSize - chunkOverlap) {
			end := i + chunkSize
			if end > len(runes) {
				end = len(runes)
			}

			chunk := string(runes[i:end])
			chunks = append(chunks, chunk)

			if end >= len(runes) {
				break
			}
		}
	} else {
		// For Western text, split by words
		// fmt.Println("[VectorStore] Using word-based splitting")
		words := strings.Fields(text)

		for i := 0; i < len(words); i += (chunkSize - chunkOverlap) {
			end := i + chunkSize
			if end > len(words) {
				end = len(words)
			}

			chunk := strings.Join(words[i:end], " ")
			chunks = append(chunks, chunk)

			if end >= len(words) {
				break
			}
		}
	}

	// fmt.Printf("[VectorStore] Created %d chunks\n", len(chunks))
	return chunks
}

// SimilaritySearch performs a similarity search (simple keyword matching for now)
func (vs *VectorStore) SimilaritySearch(ctx context.Context, notebookID, query string, numDocs int) ([]schema.Document, error) {
	if numDocs <= 0 {
		numDocs = 5
	}

	vs.mu.RLock()
	defer vs.mu.RUnlock()

	// fmt.Printf("[VectorStore] Searching for '%s' in notebook %s (total docs: %d)\n", query, notebookID, len(vs.docs))

	if len(vs.docs) == 0 {
		// fmt.Println("[VectorStore] No documents available for search")
		return []schema.Document{}, nil
	}

	// Filter docs by notebookID
	candidateDocs := make([]schema.Document, 0)
	for _, doc := range vs.docs {
		if nid, ok := doc.Metadata["notebook_id"].(string); ok && nid == notebookID {
			candidateDocs = append(candidateDocs, doc)
		}
	}

	if len(candidateDocs) == 0 {
		return []schema.Document{}, nil
	}

	// For Chinese and general text, use substring matching
	// Also extract individual words for English
	queryLower := strings.ToLower(query)
	queryRunes := []rune(queryLower)

	type docScore struct {
		doc   schema.Document
		score float64
	}

	scores := make([]docScore, 0, len(candidateDocs))
	for _, doc := range candidateDocs {
		content := strings.ToLower(doc.PageContent)
		score := 0.0

		// 1. Check if query appears as substring in content (good for Chinese)
		if strings.Contains(content, queryLower) {
			score += 10.0
		}

		// 2. For each character in query, check if it appears in content
		// This helps with partial matches
		matchCount := 0
		for _, r := range queryRunes {
			if strings.ContainsRune(content, r) {
				matchCount++
			}
		}
		if matchCount > 0 {
			charMatchRatio := float64(matchCount) / float64(len(queryRunes))
			score += charMatchRatio * 5.0
		}

		// 3. Word-based matching for English/Space-separated languages
		queryWords := strings.Fields(queryLower)
		for _, word := range queryWords {
			if len(word) > 2 && strings.Contains(content, word) {
				score += 2.0
			}
		}

		// 4. Check for common question keywords
		questionKeywords := []string{"introduce", "what", "about", "content", "document", "explain"}
		for _, keyword := range questionKeywords {
			if strings.Contains(queryLower, keyword) {
				// If query asks about the document, boost all documents
				score += 1.0
				break
			}
		}

		if score > 0 {
			scores = append(scores, docScore{doc: doc, score: score})
		}
	}

	// fmt.Printf("[VectorStore] Found %d matching documents\n", len(scores))

	// Sort by score descending
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	// If no matches found, return top recent documents (fallback)
	// This allows the LLM to use the full context
	if len(scores) == 0 {
		// fmt.Println("[VectorStore] No matches found, returning fallback documents")
		result := make([]schema.Document, 0, min(numDocs, len(candidateDocs)))
		// Return from end (most recent)
		for i := len(candidateDocs) - 1; i >= 0 && len(result) < numDocs; i-- {
			result = append(result, candidateDocs[i])
		}
		return result, nil
	}

	// Return top results
	result := make([]schema.Document, 0, numDocs)
	for i := 0; i < len(scores) && i < numDocs; i++ {
		result = append(result, scores[i].doc)
	}

	return result, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Delete removes documents by source
func (vs *VectorStore) Delete(ctx context.Context, source string) error {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	filtered := make([]schema.Document, 0, len(vs.docs))
	for _, doc := range vs.docs {
		if docSource, ok := doc.Metadata["source"].(string); !ok || docSource != source {
			filtered = append(filtered, doc)
		}
	}
	vs.docs = filtered

	return nil
}

// GetStats returns statistics about the vector store
func (vs *VectorStore) GetStats(ctx context.Context) (VectorStats, error) {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	stats := VectorStats{
		TotalDocuments: len(vs.docs),
		Dimension:      1536, // Default for OpenAI/Gemini embeddings
	}

	return stats, nil
}

// needsMarkitdown checks if a file extension requires markitdown conversion
func (vs *VectorStore) needsMarkitdown(ext string) bool {
	markitdownExts := map[string]bool{
		".pdf":  true,
		".docx": true,
		".doc":  true,
		".pptx": true,
		".ppt":  true,
		".xlsx": true,
		".xls":  true,
	}
	return markitdownExts[ext]
}


// isVideoURL checks if the URL is from a video platform (YouTube, Bilibili)
func isVideoURL(url string) bool {
	patterns := []string{
		"youtube.com",
		"youtu.be",
		"bilibili.com",
		"b23.tv",
	}
	lowerURL := strings.ToLower(url)
	for _, pattern := range patterns {
		if strings.Contains(lowerURL, pattern) {
			return true
		}
	}
	return false
}

// extractVideoSubtitle extracts subtitle from video URL using yt-dlp
func (vs *VectorStore) extractVideoSubtitle(url string) (string, error) {
	fmt.Printf("[VectorStore] Extracting subtitle from video: %s\n", url)

	// Create temporary file for subtitle
	tmpSubFile := filepath.Join(os.TempDir(), fmt.Sprintf("subtitle_%d.srt", os.Getpid()))

	// Use yt-dlp to download subtitles
	// --write-subs: write subtitles
	// --sub-langs all: download all available languages
	// --skip-download: don't download the video itself
	// --sub-format srt: use SRT format
	// -o: output file
	cmd := exec.Command("yt-dlp",
		"--write-subs",
		"--sub-langs", "all",
		"--skip-download",
		"--sub-format", "srt",
		"-o", tmpSubFile,
		url,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VectorStore] yt-dlp error: %s\n", string(output))
		return "", fmt.Errorf("failed to extract subtitle: %w, output: %s", err, string(output))
	}

	// Find the actual subtitle file (yt-dlp may add language suffix)
	matches, _ := filepath.Glob(tmpSubFile + "*.srt")
	if len(matches) == 0 {
		return "", fmt.Errorf("no subtitle file found")
	}
	actualSubFile := matches[0]

	// Read the subtitle file
	subContent, err := os.ReadFile(actualSubFile)
	if err != nil {
		os.Remove(actualSubFile)
		return "", fmt.Errorf("failed to read subtitle file: %w", err)
	}

	// Clean up subtitle file
	os.Remove(actualSubFile)

	// Convert SRT to plain text format
	textContent := vs.convertSRTToText(string(subContent))

	fmt.Printf("[VectorStore] Subtitle extracted successfully, size: %d bytes\n", len(textContent))
	return textContent, nil
}

// convertSRTToText converts SRT subtitle format to readable text
func (vs *VectorStore) convertSRTToText(srtContent string) string {
	lines := strings.Split(srtContent, "\n")
	var result []string
	currentText := []string{}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		// Skip empty lines
		if line == "" {
			if len(currentText) > 0 {
				result = append(result, strings.Join(currentText, " "))
				currentText = []string{}
			}
			continue
		}

		// Skip sequence numbers (1, 2, 3, ...)
		if _, err := fmt.Sscanf(line, "%d", new(int)); err == nil && len(line) < 10 {
			if len(currentText) > 0 {
				result = append(result, strings.Join(currentText, " "))
				currentText = []string{}
			}
			continue
		}

		// Skip timestamp lines (00:00:00,000 --> 00:00:05,000)
		if strings.Contains(line, "-->") {
			if len(currentText) > 0 {
				result = append(result, strings.Join(currentText, " "))
				currentText = []string{}
			}
			continue
		}

		// Skip hex/hash lines (sometimes in SRT files)
		if strings.HasPrefix(line, "#") {
			continue
		}

		// Remove HTML tags and common subtitle artifacts
		line = strings.ReplaceAll(line, "<i>", "")
		line = strings.ReplaceAll(line, "</i>", "")
		line = strings.ReplaceAll(line, "<b>", "")
		line = strings.ReplaceAll(line, "</b>", "")
		line = strings.ReplaceAll(line, "&lt;", "<")
		line = strings.ReplaceAll(line, "&gt;", ">")
		line = strings.ReplaceAll(line, "&amp;", "&")
		line = strings.ReplaceAll(line, "&#39;", "'")
		line = strings.ReplaceAll(line, "&quot;", "\"")

		// Add to current text if it's not empty
		if line != "" {
			currentText = append(currentText, line)
		}
	}

	// Don't forget the last segment
	if len(currentText) > 0 {
		result = append(result, strings.Join(currentText, " "))
	}

	return strings.Join(result, "\n")
}
// ExtractFromURL fetches and converts content from a URL using markitdown
func (vs *VectorStore) ExtractFromURL(ctx context.Context, url string) (string, error) {
	fmt.Printf("[VectorStore] Fetching content from URL: %s\n", url)

	if !vs.cfg.EnableMarkitdown {
		return "", fmt.Errorf("markitdown is disabled, cannot fetch URL content")
	}

	// Check if it's a video URL and extract subtitles
	if isVideoURL(url) {
		return vs.extractVideoSubtitle(url)
	}

	// Step 1: Use curl to download the webpage to a temporary HTML file
	tmpHTMLFile := filepath.Join(os.TempDir(), fmt.Sprintf("webpage_%d.html", os.Getpid()))
	tmpMDFile := filepath.Join(os.TempDir(), fmt.Sprintf("markitdown_url_%d.md", os.Getpid()))

	// Use curl with user agent to download the webpage
	curlCmd := exec.Command("curl", "-s", "-L", "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "-o", tmpHTMLFile, url)
	curlOutput, err := curlCmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VectorStore] curl error: %s\n", string(curlOutput))
		return "", fmt.Errorf("failed to download webpage: %w, output: %s", err, string(curlOutput))
	}

	fmt.Printf("[VectorStore] Downloaded webpage to: %s\n", tmpHTMLFile)

	// Step 2: Use markitdown to convert the local HTML file to markdown
	cmd := exec.Command("markitdown", tmpHTMLFile, "-o", tmpMDFile)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VectorStore] markitdown error: %s\n", string(output))
		// Clean up HTML file on error
		os.Remove(tmpHTMLFile)
		return "", fmt.Errorf("failed to convert webpage to markdown: %w, output: %s", err, string(output))
	}

	// Step 3: Read the converted markdown content
	content, err := os.ReadFile(tmpMDFile)
	if err != nil {
		// Clean up files on error
		os.Remove(tmpHTMLFile)
		os.Remove(tmpMDFile)
		return "", fmt.Errorf("failed to read markitdown output: %w", err)
	}

	// Step 4: Clean up temporary files
	os.Remove(tmpHTMLFile)
	os.Remove(tmpMDFile)

	fmt.Printf("[VectorStore] URL content fetched and converted successfully, output size: %d bytes\n", len(content))
	return string(content), nil
}
func (vs *VectorStore) convertWithMarkitdown(filePath string) (string, error) {
	fmt.Printf("[VectorStore] Converting with markitdown: %s\n", filePath)

	// Create temporary output file
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("markitdown_%s.md", filepath.Base(filePath)))

	// Run markitdown command
	cmd := exec.Command("markitdown", filePath, "-o", tmpFile)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VectorStore] markitdown error: %s\n", string(output))
		return "", fmt.Errorf("markitdown conversion failed: %w, output: %s", err, string(output))
	}

	// Read the converted markdown content
	content, err := os.ReadFile(tmpFile)
	if err != nil {
		return "", fmt.Errorf("failed to read markitdown output: %w", err)
	}

	// Clean up temporary file
	os.Remove(tmpFile)

	fmt.Printf("[VectorStore] markitdown conversion successful, output size: %d bytes\n", len(content))
	return string(content), nil
}

// isAudioFile checks if the file extension is an audio format
func (vs *VectorStore) isAudioFile(ext string) bool {
	audioExts := map[string]bool{
		".mp3":  true,
		".wav":  true,
		".m4a":  true,
		".aac":  true,
		".flac": true,
		".ogg":  true,
		".wma":  true,
		".opus": true,
		".mp4":  true, // Also handle video files with audio
		".avi":  true,
		".mkv":  true,
		".mov":  true,
		".webm": true,
	}
	return audioExts[ext]
}

// transcribeAudio transcribes an audio file using vosk-transcriber
func (vs *VectorStore) transcribeAudio(audioPath string) (string, error) {
	fmt.Printf("[VectorStore] Transcribing audio file: %s\n", audioPath)

	if !vs.cfg.EnableVoskTranscriber {
		return "", fmt.Errorf("vosk-transcriber is disabled. Please set ENABLE_VOSK_TRANSCRIBER=true and ensure vosk-transcriber is installed")
	}

	// Check if vosk-transcriber is available
	if _, err := exec.LookPath("vosk-transcriber"); err != nil {
		return "", fmt.Errorf("vosk-transcriber not found. Please install it from https://github.com/alphacep/vosk-transcriber")
	}

	// Prepare output file path
	outputFile := filepath.Join(os.TempDir(), fmt.Sprintf("transcript_%d.txt", os.Getpid()))

	// Build command arguments
	args := []string{"-i", audioPath, "-o", outputFile}
	
	// Add model path if specified
	if vs.cfg.VoskModelPath != "" {
		args = []string{"-m", vs.cfg.VoskModelPath, "-i", audioPath, "-o", outputFile}
	}

	// Run vosk-transcriber
	cmd := exec.Command("vosk-transcriber", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VectorStore] vosk-transcriber error: %s\n", string(output))
		return "", fmt.Errorf("failed to transcribe audio: %w, output: %s", err, string(output))
	}

	// Read the transcript file
	transcript, err := os.ReadFile(outputFile)
	if err != nil {
		os.Remove(outputFile)
		return "", fmt.Errorf("failed to read transcript file: %w", err)
	}

	// Clean up output file
	os.Remove(outputFile)

	transcriptText := string(transcript)
	fmt.Printf("[VectorStore] Audio transcribed successfully, transcript size: %d bytes\n", len(transcriptText))
	
	return transcriptText, nil
}
