package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/kataras/golog"
	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
	"github.com/smallnest/notex/backend"
)

var Version = "1.0.0"

func main() {
	// Command line flags
	serverMode := flag.Bool("server", false, "Run in HTTP server mode")
	ingestFile := flag.String("ingest", "", "Path to a file to ingest")
	notebookName := flag.String("notebook", "", "Notebook name (for ingest)")
	version := flag.Bool("version", false, "Show version information")
	flag.Parse()

	if *version {
		fmt.Printf("StudyForge v%s\n", Version)
		fmt.Println("A privacy-first, open-source alternative to NotebookLM")
		fmt.Println("Powered by LangGraphGo")
		os.Exit(0)
	}

	defer func() {
		if err := recover(); err != nil {
			golog.Error("recover:", err)
			buf := make([]byte, 8192)
			n := runtime.Stack(buf, true)
			golog.Error("stack:", string(buf[:n]))
		}
	}()

	golog.SetTimeFormat("2006/01/02 15:04:05.000")
	logFiles := "./logs/studyforge.log.%Y%m%d"
	w, err := rotatelogs.New(
		logFiles,
		rotatelogs.WithLinkName("./logs/studyforge.log"),
		rotatelogs.WithMaxAge(7*24*time.Hour),
		rotatelogs.WithRotationTime(24*time.Hour))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create log file: %v\n", err)
		os.Exit(1)
	}
	defer w.Close()
	golog.SetOutput(w)

	// Load and validate configuration
	cfg := backend.LoadConfig()
	if err := backend.ValidateConfig(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Configuration Error:\n\n%v\n\n", err)
		fmt.Fprintf(os.Stderr, "Required environment variables:\n")
		fmt.Fprintf(os.Stderr, "  - OPENAI_API_KEY (Gemini or OpenAI-compatible key)\n\n")
		fmt.Fprintf(os.Stderr, "Optional:\n")
		fmt.Fprintf(os.Stderr, "  - VECTOR_STORE_TYPE (default: sqlite)\n")
		fmt.Fprintf(os.Stderr, "  - STORE_PATH (default: ./data/checkpoints.db)\n")
		fmt.Fprintf(os.Stderr, "  - SERVER_PORT (default: 8080)\n\n")
		os.Exit(1)
	}

	ctx := context.Background()

	switch {
	case *serverMode:
		// Server mode
		runServerMode(cfg)

	case *ingestFile != "":
		// Ingest mode
		if *notebookName == "" {
			*notebookName = "Default Notebook"
		}
		runIngestMode(ctx, cfg, *ingestFile, *notebookName)

	default:
		printUsage()
	}
}

func runServerMode(cfg backend.Config) {
	server, err := backend.NewServer(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Failed to create server: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n✅ StudyForge v%s\n", Version)
	fmt.Printf("📡 Server: http://%s:%s\n", cfg.ServerHost, cfg.ServerPort)
	fmt.Printf("🤖 LLM: %s\n", cfg.OpenAIModel)
	fmt.Printf("📦 Vector Store: %s\n\n", cfg.VectorStoreType)

	if err := server.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Server error: %v\n", err)
		os.Exit(1)
	}
}

func runIngestMode(ctx context.Context, cfg backend.Config, filePath, notebookName string) {
	golog.Infof("📂 ingesting file: %s...", filePath)

	// Initialize vector store
	vectorStore, err := backend.NewVectorStore(cfg)
	if err != nil {
		golog.Fatalf("failed to initialize vector store: %v", err)
	}

	// Initialize store
	store, err := backend.NewStore(cfg)
	if err != nil {
		golog.Fatalf("failed to initialize store: %v", err)
	}

	// Create or get notebook
	notebooks, _ := store.ListNotebooks(ctx, "")
	var notebookID string
	for _, nb := range notebooks {
		if nb.Name == notebookName {
			notebookID = nb.ID
			break
		}
	}

	if notebookID == "" {
		nb, err := store.CreateNotebook(ctx, "", notebookName, "Created by ingest mode", "", "", nil)
		if err != nil {
			golog.Fatalf("failed to create notebook: %v", err)
		}
		notebookID = nb.ID
		golog.Infof("📓 created notebook: %s", notebookName)
	}

	// Extract content
	content, err := vectorStore.ExtractDocument(ctx, filePath)
	if err != nil {
		golog.Fatalf("extraction failed: %v", err)
	}

	// Create source in database
	fileInfo, _ := os.Stat(filePath)
	source := &backend.Source{
		NotebookID: notebookID,
		Name:       filepath.Base(filePath),
		Type:       "file",
		FileName:   filepath.Base(filePath),
		FileSize:   fileInfo.Size(),
		Content:    content,
		Metadata:   map[string]interface{}{"path": filePath},
	}

	if err := store.CreateSource(ctx, source); err != nil {
		golog.Fatalf("failed to create source: %v", err)
	}

	// Ingest document
	if _, err := vectorStore.IngestText(ctx, notebookID, source.Name, content); err != nil {
		golog.Fatalf("ingestion failed: %v", err)
	}

	golog.Infof("✅ ingestion complete!")
	golog.Infof("📓 notebook: %s (ID: %s)", notebookName, notebookID)
}

func printUsage() {
	fmt.Println("StudyForge - AI Study System")
	fmt.Println("\nUsage:")
	fmt.Println("  studyforge [options]")
	fmt.Println("\nOptions:")
	fmt.Println("  -server          Start the web server")
	fmt.Println("  -ingest <file>   Ingest a file into the vector store")
	fmt.Println("  -notebook <name> Notebook name for ingest (default: 'Default Notebook')")
	fmt.Println("  -version         Show version information")
	fmt.Println("\nExamples:")
	fmt.Println("  # Start web server")
	fmt.Println("  studyforge -server")
	fmt.Println("\n  # Ingest a file")
	fmt.Println("  studyforge -ingest document.pdf -notebook 'My Notes'")
	fmt.Println("\nEnvironment Variables:")
	fmt.Println("  OPENAI_API_KEY      Your OpenAI API key")
	fmt.Println("  OPENAI_MODEL        Model name (default: gemini-2.5-flash)")
	fmt.Println("  VECTOR_STORE_TYPE   Vector store type (default: sqlite)")
	fmt.Println("  SERVER_PORT         Server port (default: 8080)")
	fmt.Println("\nFor more information, visit: https://github.com/smallnest/langgraphgo")
}
