package backend

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// Store handles data persistence for notebooks, sources, notes, and chat sessions
type Store struct {
	db     *sql.DB
	dbPath string
}

// NewStore creates a new store
func NewStore(cfg Config) (*Store, error) {
	// Ensure data directory exists
	if err := os.MkdirAll(filepath.Dir(cfg.StorePath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	absPath, _ := filepath.Abs(cfg.StorePath)
	fmt.Printf("📦 Initializing SQLite Store at: %s\n", absPath)

	db, err := sql.Open("sqlite", cfg.StorePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign key constraints
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	store := &Store{db: db, dbPath: cfg.StorePath}

	// Initialize schema
	if err := store.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return store, nil
}

// initSchema creates the database schema
func (s *Store) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		hash_id TEXT UNIQUE DEFAULT NULL,
		email TEXT NOT NULL UNIQUE,
		name TEXT,
		avatar_url TEXT,
		provider TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS notebooks (
		id TEXT PRIMARY KEY,
		user_id TEXT,
		name TEXT NOT NULL,
		description TEXT,
		color TEXT DEFAULT '#8B5CF6',
		icon TEXT DEFAULT '📓',
		is_public INTEGER DEFAULT 0,
		public_token TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
	`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}



	// Check if user_id column exists in notebooks table (migration)
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('notebooks') WHERE name='user_id'").Scan(&count)
	if err == nil && count == 0 {
		// Add user_id column
		if _, err := s.db.Exec("ALTER TABLE notebooks ADD COLUMN user_id TEXT REFERENCES users(id)"); err != nil {
			return fmt.Errorf("failed to add user_id column to notebooks: %w", err)
		}
	}

	// Check if is_public column exists in notebooks table (migration)
	err = s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('notebooks') WHERE name='is_public'").Scan(&count)
	if err == nil && count == 0 {
		// Add is_public column
		if _, err := s.db.Exec("ALTER TABLE notebooks ADD COLUMN is_public INTEGER DEFAULT 0"); err != nil {
			return fmt.Errorf("failed to add is_public column to notebooks: %w", err)
		}
	}

	// Check if public_token column exists in notebooks table (migration)
	err = s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('notebooks') WHERE name='public_token'").Scan(&count)
	if err == nil && count == 0 {
		// Add public_token column
		if _, err := s.db.Exec("ALTER TABLE notebooks ADD COLUMN public_token TEXT"); err != nil {
			return fmt.Errorf("failed to add public_token column to notebooks: %w", err)
		}
	}

	// Check if color column exists in notebooks table (migration)
	err = s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('notebooks') WHERE name='color'").Scan(&count)
	if err == nil && count == 0 {
		if _, err := s.db.Exec("ALTER TABLE notebooks ADD COLUMN color TEXT DEFAULT '#8B5CF6'"); err != nil {
			return fmt.Errorf("failed to add color column to notebooks: %w", err)
		}
	}

	// Check if icon column exists in notebooks table (migration)
	err = s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('notebooks') WHERE name='icon'").Scan(&count)
	if err == nil && count == 0 {
		if _, err := s.db.Exec("ALTER TABLE notebooks ADD COLUMN icon TEXT DEFAULT '📓'"); err != nil {
			return fmt.Errorf("failed to add icon column to notebooks: %w", err)
		}
	}

	restSchema := `
	CREATE TABLE IF NOT EXISTS sources (
		id TEXT PRIMARY KEY,
		notebook_id TEXT NOT NULL,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		url TEXT,
		content TEXT,
		file_name TEXT,
		file_size INTEGER,
		chunk_count INTEGER DEFAULT 0,
		status TEXT DEFAULT 'completed',
		progress INTEGER DEFAULT 100,
		error_msg TEXT DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS notes (
		id TEXT PRIMARY KEY,
		notebook_id TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		type TEXT NOT NULL,
		source_ids TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS chat_sessions (
		id TEXT PRIMARY KEY,
		notebook_id TEXT NOT NULL,
		title TEXT NOT NULL,
		summary TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS chat_messages (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		sources TEXT,
		created_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS podcasts (
		id TEXT PRIMARY KEY,
		notebook_id TEXT NOT NULL,
		title TEXT NOT NULL,
		script TEXT,
		audio_url TEXT,
		duration INTEGER DEFAULT 0,
		voice TEXT NOT NULL,
		status TEXT NOT NULL,
		source_ids TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		metadata TEXT,
		FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_sources_notebook ON sources(notebook_id);
	CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
	CREATE INDEX IF NOT EXISTS idx_chat_sessions_notebook ON chat_sessions(notebook_id);
	CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
	CREATE INDEX IF NOT EXISTS idx_podcasts_notebook ON podcasts(notebook_id);

	CREATE TABLE IF NOT EXISTS activity_logs (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		action TEXT NOT NULL,
		resource_type TEXT,
		resource_id TEXT,
		resource_name TEXT,
		details TEXT,
		ip_address TEXT,
		user_agent TEXT,
		created_at INTEGER NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
	CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
	`

	_, err = s.db.Exec(restSchema)
	if err != nil {
		return err
	}

	// Migration: Add status tracking columns to sources table
	if err := s.migrateSourceStatusColumns(); err != nil {
		return err
	}

	// Migration: Add hash_id column to users table for existing databases
	if err := s.migrateAddHashIDColumn(); err != nil {
		return err
	}

	return nil
}

// migrateSourceStatusColumns adds status tracking columns to sources table
func (s *Store) migrateSourceStatusColumns() error {
	// Check if status column exists
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('sources') WHERE name = 'status'`).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check status column: %w", err)
	}

	if count > 0 {
		return nil // Columns already exist
	}

	log.Printf("🔄 Adding status tracking columns to sources table...")
	
	// Add status column
	_, err = s.db.Exec(`ALTER TABLE sources ADD COLUMN status TEXT DEFAULT 'completed'`)
	if err != nil {
		return fmt.Errorf("failed to add status column: %w", err)
	}

	// Add progress column
	_, err = s.db.Exec(`ALTER TABLE sources ADD COLUMN progress INTEGER DEFAULT 100`)
	if err != nil {
		return fmt.Errorf("failed to add progress column: %w", err)
	}

	// Add error_msg column
	_, err = s.db.Exec(`ALTER TABLE sources ADD COLUMN error_msg TEXT DEFAULT ''`)
	if err != nil {
		return fmt.Errorf("failed to add error_msg column: %w", err)
	}

	log.Printf("✅ Status tracking columns added successfully")
	return nil
}

// migrateAddHashIDColumn adds hash_id column to users table for existing databases
func (s *Store) migrateAddHashIDColumn() error {
	// Check if hash_id column exists
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'hash_id'`).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check hash_id column: %w", err)
	}

	if count > 0 {
		return nil // Column already exists
	}

	// Add hash_id column WITHOUT UNIQUE constraint first
	// We'll add the unique index after populating data
	log.Printf("🔄 Adding hash_id column to users table...")
	_, err = s.db.Exec(`ALTER TABLE users ADD COLUMN hash_id TEXT DEFAULT NULL`)
	if err != nil {
		return fmt.Errorf("failed to add hash_id column: %w", err)
	}
	log.Printf("✅ hash_id column added successfully")

	// Immediately migrate existing users to have hash_id
	ctx := context.Background()
	count, err = s.generateHashIDsForExistingUsers(ctx)
	if err != nil {
		log.Printf("⚠️  Failed to generate hash_ids for existing users: %v", err)
	} else if count > 0 {
		log.Printf("✅ Generated hash_id for %d existing users", count)
	}

	// Create unique index on hash_id (only on non-null values)
	log.Printf("🔄 Creating unique index on hash_id...")
	_, err = s.db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_hash_id ON users(hash_id) WHERE hash_id IS NOT NULL AND hash_id != ''`)
	if err != nil {
		log.Printf("⚠️  Failed to create unique index on hash_id: %v", err)
		// Don't fail the migration, just log the error
	} else {
		log.Printf("✅ Unique index on hash_id created successfully")
	}

	return nil
}

// generateHashIDsForExistingUsers generates hash_id for users who don't have one
func (s *Store) generateHashIDsForExistingUsers(ctx context.Context) (int, error) {
	// Find users without hash_id
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, created_at FROM users WHERE hash_id IS NULL OR hash_id = ''
	`)
	if err != nil {
		return 0, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	type userIDWithTime struct {
		ID        string
		CreatedAt time.Time
	}
	userIDs := make([]userIDWithTime, 0)
	for rows.Next() {
		var u userIDWithTime
		var createdAt int64
		if err := rows.Scan(&u.ID, &createdAt); err != nil {
			return 0, fmt.Errorf("failed to scan user: %w", err)
		}
		u.CreatedAt = time.Unix(createdAt, 0)
		userIDs = append(userIDs, u)
	}

	if len(userIDs) == 0 {
		return 0, nil
	}

	// Generate hash_id for each user
	count := 0
	for _, u := range userIDs {
		// Generate hash_id using user's created_at as base timestamp
		timestamp := u.CreatedAt.UnixMilli()
		var randomBytes [4]byte
		if _, err := rand.Read(randomBytes[:]); err != nil {
			randomBytes[0] = byte(timestamp >> 24)
			randomBytes[1] = byte(timestamp >> 16)
			randomBytes[2] = byte(timestamp >> 8)
			randomBytes[3] = byte(timestamp)
		}
		randomPart := uint64(binary.BigEndian.Uint32(randomBytes[:]))
		hashIDValue := (uint64(timestamp) << 24) | (randomPart & 0xFFFFFF)
		hashID := GenerateBase62ID(hashIDValue)

		// Check for collision and retry if needed
		maxRetries := 10
		for retry := 0; retry < maxRetries; retry++ {
			// Try to update
			result, err := s.db.ExecContext(ctx, `
				UPDATE users SET hash_id = ? WHERE id = ? AND (hash_id IS NULL OR hash_id = '')
			`, hashID, u.ID)
			if err != nil {
				// Check if it's a unique constraint violation
				if strings.Contains(err.Error(), "UNIQUE constraint") || strings.Contains(err.Error(), "constraint failed") {
					// Collision, generate new hash_id
					var newRandomBytes [4]byte
					rand.Read(newRandomBytes[:])
					newRandomPart := uint64(binary.BigEndian.Uint32(newRandomBytes[:]))
					hashIDValue = (uint64(timestamp) << 24) | (newRandomPart & 0xFFFFFF)
					hashID = GenerateBase62ID(hashIDValue)
					continue
				}
				return count, err
			}

			rowsAffected, _ := result.RowsAffected()
			if rowsAffected > 0 {
				count++
			}
			break
		}
	}

	return count, nil
}

// User operations

// CreateUser creates or updates a user
func (s *Store) CreateUser(ctx context.Context, user *User) error {
	now := time.Now()
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	user.UpdatedAt = now

	// Check if user exists
	existing, err := s.GetUserByEmail(ctx, user.Email)
	if err == nil && existing != nil {
		// Update existing user
		user.ID = existing.ID
		user.CreatedAt = existing.CreatedAt // Keep original created_at

		// Generate hash_id if existing user doesn't have one
		if existing.HashID == "" {
			// Generate unique hash_id with collision detection
			maxRetries := 10
			for i := 0; i < maxRetries; i++ {
				timestamp := existing.CreatedAt.UnixMilli()
				var randomBytes [4]byte
				if _, err := rand.Read(randomBytes[:]); err != nil {
					randomBytes[0] = byte(existing.CreatedAt.Unix() >> 24)
					randomBytes[1] = byte(existing.CreatedAt.Unix() >> 16)
					randomBytes[2] = byte(existing.CreatedAt.Unix() >> 8)
					randomBytes[3] = byte(existing.CreatedAt.Unix())
				}
				randomPart := uint64(binary.BigEndian.Uint32(randomBytes[:]))
				hashIDValue := (uint64(timestamp) << 24) | (randomPart & 0xFFFFFF)
				candidateHashID := GenerateBase62ID(hashIDValue)

				// Check if hash_id already exists
				var exists bool
				err := s.db.QueryRowContext(ctx, `SELECT 1 FROM users WHERE hash_id = ? LIMIT 1`, candidateHashID).Scan(&exists)
				if err == sql.ErrNoRows {
					user.HashID = candidateHashID
					break
				}
				if err != nil {
					// Error might be due to missing hash_id column, just use the generated hash_id
					user.HashID = candidateHashID
					break
				}
				time.Sleep(time.Millisecond)
			}
		} else {
			user.HashID = existing.HashID // Keep original hash_id
		}

		// Update user in database
		// Try to update with hash_id first
		if user.HashID != "" {
			_, err = s.db.ExecContext(ctx, `
				UPDATE users
				SET name = ?, avatar_url = ?, provider = ?, updated_at = ?, hash_id = ?
				WHERE id = ?
			`, user.Name, user.AvatarURL, user.Provider, now.Unix(), user.HashID, user.ID)
		} else {
			_, err = s.db.ExecContext(ctx, `
				UPDATE users
				SET name = ?, avatar_url = ?, provider = ?, updated_at = ?
				WHERE id = ?
			`, user.Name, user.AvatarURL, user.Provider, now.Unix(), user.ID)
		}

		// If update fails due to missing hash_id column, retry without it
		if err != nil && (strings.Contains(err.Error(), "no such column") || strings.Contains(err.Error(), "has no column named") || strings.Contains(err.Error(), "Unknown column")) {
			_, err = s.db.ExecContext(ctx, `
				UPDATE users
				SET name = ?, avatar_url = ?, provider = ?, updated_at = ?
				WHERE id = ?
			`, user.Name, user.AvatarURL, user.Provider, now.Unix(), user.ID)
		}
		return err
	}

	if user.ID == "" {
		user.ID = uuid.New().String()
	}

	// Generate hash_id if not set (with randomness to prevent guessing)
	if user.HashID == "" {
		// Generate unique hash_id with collision detection
		maxRetries := 10
		for i := 0; i < maxRetries; i++ {
			// Use timestamp (in milliseconds) + 32-bit random for entropy
			// This makes hash_id unpredictable even with timing information
			timestamp := now.UnixMilli()

			// Add 32 bits of randomness
			var randomBytes [4]byte
			if _, err := rand.Read(randomBytes[:]); err != nil {
				randomBytes[0] = byte(now.Unix() >> 24)
				randomBytes[1] = byte(now.Unix() >> 16)
				randomBytes[2] = byte(now.Unix() >> 8)
				randomBytes[3] = byte(now.Unix())
			}
			randomPart := uint64(binary.BigEndian.Uint32(randomBytes[:]))

			// Combine timestamp (40 bits) + random (24 bits) to keep hash_id in reasonable range
			// This gives us ~16 million possible hash_ids per millisecond
			hashIDValue := (uint64(timestamp) << 24) | (randomPart & 0xFFFFFF)
			candidateHashID := GenerateBase62ID(hashIDValue)

			// Check if hash_id already exists
			var exists bool
			err := s.db.QueryRowContext(ctx, `SELECT 1 FROM users WHERE hash_id = ? LIMIT 1`, candidateHashID).Scan(&exists)
			if err == sql.ErrNoRows {
				// hash_id is unique, use it
				user.HashID = candidateHashID
				break
			}
			// If query failed for other reasons, still try to use the hash_id (will be caught by UNIQUE constraint if collision)
			if err != nil {
				user.HashID = candidateHashID
				break
			}
			// hash_id collision, try again with new random value
			// Add small delay to change timestamp slightly
			time.Sleep(time.Millisecond)
		}

		// If still empty after retries, use a more collision-resistant approach
		if user.HashID == "" {
			// Use timestamp + full 32-bit random
			timestamp := now.UnixMilli()
			var randomBytes [4]byte
			rand.Read(randomBytes[:])
			randomPart := uint64(binary.BigEndian.Uint32(randomBytes[:]))
			hashIDValue := (uint64(timestamp) << 32) | randomPart
			user.HashID = GenerateBase62ID(hashIDValue)
		}
	}

	// Try INSERT with hash_id first (for new installations)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO users (id, hash_id, email, name, avatar_url, provider, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, user.ID, user.HashID, user.Email, user.Name, user.AvatarURL, user.Provider, user.CreatedAt.Unix(), user.UpdatedAt.Unix())

	// If INSERT fails due to missing hash_id column (existing database), retry without it
	if err != nil && (strings.Contains(err.Error(), "no such column") || strings.Contains(err.Error(), "has no column named") || strings.Contains(err.Error(), "Unknown column")) {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO users (id, email, name, avatar_url, provider, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, user.ID, user.Email, user.Name, user.AvatarURL, user.Provider, user.CreatedAt.Unix(), user.UpdatedAt.Unix())
	}

	return err
}

// GetUser retrieves a user by ID
func (s *Store) GetUser(ctx context.Context, id string) (*User, error) {
	var user User
	var createdAt, updatedAt int64

	// Try to read hash_id first (for new installations)
	var hashID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, hash_id, email, name, avatar_url, provider, created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(&user.ID, &hashID, &user.Email, &user.Name, &user.AvatarURL, &user.Provider, &createdAt, &updatedAt)

	if err != nil {
		// If query fails due to missing hash_id column, try without it
		if strings.Contains(err.Error(), "no such column") || strings.Contains(err.Error(), "has no column named") {
			err = s.db.QueryRowContext(ctx, `
				SELECT id, email, name, avatar_url, provider, created_at, updated_at
				FROM users WHERE id = ?
			`, id).Scan(&user.ID, &user.Email, &user.Name, &user.AvatarURL, &user.Provider, &createdAt, &updatedAt)
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("user not found")
			}
			if err != nil {
				return nil, err
			}
		} else {
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("user not found")
			}
			return nil, err
		}
	}

	// Handle hash_id (may be NULL or empty string for existing users)
	if hashID.Valid && hashID.String != "" {
		user.HashID = hashID.String
	}

	user.CreatedAt = time.Unix(createdAt, 0)
	user.UpdatedAt = time.Unix(updatedAt, 0)

	return &user, nil
}

// GetUserByEmail retrieves a user by Email
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	var createdAt, updatedAt int64

	// Try to read hash_id first (for new installations)
	var hashID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, hash_id, email, name, avatar_url, provider, created_at, updated_at
		FROM users WHERE email = ?
	`, email).Scan(&user.ID, &hashID, &user.Email, &user.Name, &user.AvatarURL, &user.Provider, &createdAt, &updatedAt)

	if err != nil {
		// If query fails due to missing hash_id column, try without it
		if strings.Contains(err.Error(), "no such column") || strings.Contains(err.Error(), "has no column named") {
			err = s.db.QueryRowContext(ctx, `
				SELECT id, email, name, avatar_url, provider, created_at, updated_at
				FROM users WHERE email = ?
			`, email).Scan(&user.ID, &user.Email, &user.Name, &user.AvatarURL, &user.Provider, &createdAt, &updatedAt)
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("user not found")
			}
			if err != nil {
				return nil, err
			}
		} else {
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("user not found")
			}
			return nil, err
		}
	}

	// Handle hash_id (may be NULL or empty string for existing users)
	if hashID.Valid && hashID.String != "" {
		user.HashID = hashID.String
	}

	user.CreatedAt = time.Unix(createdAt, 0)
	user.UpdatedAt = time.Unix(updatedAt, 0)

	return &user, nil
}

// GetUserByHashID retrieves a user by HashID
func (s *Store) GetUserByHashID(ctx context.Context, hashID string) (*User, error) {
	var user User
	var createdAt, updatedAt int64

	// Check if hash_id column exists first
	var columnCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'hash_id'
	`).Scan(&columnCount)
	if err != nil || columnCount == 0 {
		return nil, fmt.Errorf("hash_id not supported in current database schema")
	}

	err = s.db.QueryRowContext(ctx, `
		SELECT id, hash_id, email, name, avatar_url, provider, created_at, updated_at
		FROM users WHERE hash_id = ?
	`, hashID).Scan(&user.ID, &user.HashID, &user.Email, &user.Name, &user.AvatarURL, &user.Provider, &createdAt, &updatedAt)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}

	user.CreatedAt = time.Unix(createdAt, 0)
	user.UpdatedAt = time.Unix(updatedAt, 0)

	return &user, nil
}

// Notebook operations

// CreateNotebook creates a new notebook
func (s *Store) CreateNotebook(ctx context.Context, userID, name, description, color, icon string, metadata map[string]interface{}) (*Notebook, error) {
	id := uuid.New().String()
	now := time.Now()

	metadataJSON, _ := json.Marshal(metadata)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO notebooks (id, user_id, name, description, color, icon, created_at, updated_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, userID, name, description, color, icon, now.Unix(), now.Unix(), string(metadataJSON))
	if err != nil {
		return nil, err
	}

	return s.GetNotebook(ctx, id)
}

// GetNotebook retrieves a notebook by ID
func (s *Store) GetNotebook(ctx context.Context, id string) (*Notebook, error) {
	var nb Notebook
	var metadataJSON string
	var createdAt, updatedAt int64
	var userID sql.NullString
	var isPublic sql.NullInt64
	var publicToken sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, description, color, icon, is_public, public_token, created_at, updated_at, metadata
		FROM notebooks WHERE id = ?
	`, id).Scan(&nb.ID, &userID, &nb.Name, &nb.Description, &nb.Color, &nb.Icon, &isPublic, &publicToken, &createdAt, &updatedAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("notebook not found")
	}
	if err != nil {
		return nil, err
	}

	if userID.Valid {
		nb.UserID = userID.String
	}

	nb.IsPublic = isPublic.Valid && isPublic.Int64 > 0
	if publicToken.Valid {
		nb.PublicToken = publicToken.String
	}

	nb.CreatedAt = time.Unix(createdAt, 0)
	nb.UpdatedAt = time.Unix(updatedAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &nb.Metadata)
	} else {
		nb.Metadata = make(map[string]interface{})
	}

	// Fetch source IDs
	if sourceIDs, err := s.GetSourceIDsForNotebook(ctx, nb.ID); err == nil {
		nb.SourceIDs = sourceIDs
	}

	return &nb, nil
}

// ListNotebooks retrieves all notebooks for a user
func (s *Store) ListNotebooks(ctx context.Context, userID string) ([]Notebook, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, description, color, icon, is_public, public_token, created_at, updated_at, metadata
		FROM notebooks
		WHERE user_id = ?
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notebooks := make([]Notebook, 0)
	for rows.Next() {
		var nb Notebook
		var metadataJSON string
		var createdAt, updatedAt int64
		var uid sql.NullString
		var isPublic sql.NullInt64
		var publicToken sql.NullString

		if err := rows.Scan(&nb.ID, &uid, &nb.Name, &nb.Description, &nb.Color, &nb.Icon, &isPublic, &publicToken, &createdAt, &updatedAt, &metadataJSON); err != nil {
			return nil, err
		}

		if uid.Valid {
			nb.UserID = uid.String
		}

		nb.IsPublic = isPublic.Valid && isPublic.Int64 > 0
		if publicToken.Valid {
			nb.PublicToken = publicToken.String
		}

		nb.CreatedAt = time.Unix(createdAt, 0)
		nb.UpdatedAt = time.Unix(updatedAt, 0)

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &nb.Metadata)
		} else {
			nb.Metadata = make(map[string]interface{})
		}

		if sourceIDs, err := s.GetSourceIDsForNotebook(ctx, nb.ID); err == nil {
			nb.SourceIDs = sourceIDs
		}

		notebooks = append(notebooks, nb)
	}

	return notebooks, nil
}

// UpdateNotebook updates a notebook
func (s *Store) UpdateNotebook(ctx context.Context, id string, name, description, color, icon string, metadata map[string]interface{}) (*Notebook, error) {
	now := time.Now()

	metadataJSON, _ := json.Marshal(metadata)

	_, err := s.db.ExecContext(ctx, `
		UPDATE notebooks
		SET name = ?, description = ?, color = ?, icon = ?, updated_at = ?, metadata = ?
		WHERE id = ?
	`, name, description, color, icon, now.Unix(), string(metadataJSON), id)
	if err != nil {
		return nil, err
	}

	return s.GetNotebook(ctx, id)
}

// SetNotebookPublic sets the notebook's public status and generates/updates the public token
func (s *Store) SetNotebookPublic(ctx context.Context, id string, isPublic bool) (*Notebook, error) {
	now := time.Now()

	if isPublic {
		// Generate a unique public token
		token := uuid.New().String()
		_, err := s.db.ExecContext(ctx, `
			UPDATE notebooks
			SET is_public = 1, public_token = ?, updated_at = ?
			WHERE id = ?
		`, token, now.Unix(), id)
		if err != nil {
			return nil, err
		}
	} else {
		// Clear public status and token
		_, err := s.db.ExecContext(ctx, `
			UPDATE notebooks
			SET is_public = 0, public_token = NULL, updated_at = ?
			WHERE id = ?
		`, now.Unix(), id)
		if err != nil {
			return nil, err
		}
	}

	return s.GetNotebook(ctx, id)
}

// GetNotebookByPublicToken retrieves a notebook by its public token
func (s *Store) GetNotebookByPublicToken(ctx context.Context, token string) (*Notebook, error) {
	var nb Notebook
	var metadataJSON string
	var createdAt, updatedAt int64
	var userID sql.NullString
	var isPublic sql.NullInt64
	var publicToken sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, description, color, icon, is_public, public_token, created_at, updated_at, metadata
		FROM notebooks WHERE public_token = ? AND is_public = 1
	`, token).Scan(&nb.ID, &userID, &nb.Name, &nb.Description, &nb.Color, &nb.Icon, &isPublic, &publicToken, &createdAt, &updatedAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("public notebook not found")
	}
	if err != nil {
		return nil, err
	}

	if userID.Valid {
		nb.UserID = userID.String
	}

	nb.IsPublic = isPublic.Valid && isPublic.Int64 > 0
	if publicToken.Valid {
		nb.PublicToken = publicToken.String
	}

	nb.CreatedAt = time.Unix(createdAt, 0)
	nb.UpdatedAt = time.Unix(updatedAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &nb.Metadata)
	} else {
		nb.Metadata = make(map[string]interface{})
	}

	if sourceIDs, err := s.GetSourceIDsForNotebook(ctx, nb.ID); err == nil {
		nb.SourceIDs = sourceIDs
	}

	return &nb, nil
}

// DeleteNotebook deletes a notebook and all its data
func (s *Store) DeleteNotebook(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM notebooks WHERE id = ?`, id)
	return err
}

// ListNotebooksWithStats retrieves all notebooks with their source and note counts for a user
func (s *Store) ListNotebooksWithStats(ctx context.Context, userID string) ([]NotebookWithStats, error) {
	query := `
		SELECT
			n.id, n.user_id, n.name, n.description, n.color, n.icon, n.is_public, n.public_token, n.created_at, n.updated_at, n.metadata,
			COALESCE((SELECT COUNT(*) FROM sources WHERE notebook_id = n.id), 0) as source_count,
			COALESCE((SELECT COUNT(*) FROM notes WHERE notebook_id = n.id), 0) as note_count
		FROM notebooks n
		WHERE n.user_id = ?
		ORDER BY n.updated_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notebooks := make([]NotebookWithStats, 0)
	for rows.Next() {
		var nb NotebookWithStats
		var metadataJSON string
		var createdAt, updatedAt int64
		var uid sql.NullString
		var isPublic sql.NullInt64
		var publicToken sql.NullString

		if err := rows.Scan(&nb.ID, &uid, &nb.Name, &nb.Description, &nb.Color, &nb.Icon, &isPublic, &publicToken, &createdAt, &updatedAt, &metadataJSON, &nb.SourceCount, &nb.NoteCount); err != nil {
			return nil, err
		}

		if uid.Valid {
			nb.UserID = uid.String
		}

		nb.IsPublic = isPublic.Valid && isPublic.Int64 > 0
		if publicToken.Valid {
			nb.PublicToken = publicToken.String
		}

		nb.CreatedAt = time.Unix(createdAt, 0)
		nb.UpdatedAt = time.Unix(updatedAt, 0)

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &nb.Metadata)
		} else {
			nb.Metadata = make(map[string]interface{})
		}

		if sourceIDs, err := s.GetSourceIDsForNotebook(ctx, nb.ID); err == nil {
			nb.SourceIDs = sourceIDs
		}

		notebooks = append(notebooks, nb)
	}

	return notebooks, nil
}

// GetSourceIDsForNotebook retrieves all source IDs for a notebook
func (s *Store) GetSourceIDsForNotebook(ctx context.Context, notebookID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id FROM sources WHERE notebook_id = ?", notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// LinkSourceToNotebook updates a source's notebook ID
func (s *Store) LinkSourceToNotebook(ctx context.Context, notebookID, sourceID string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE sources SET notebook_id = ?, updated_at = ? WHERE id = ?", notebookID, time.Now().Unix(), sourceID)
	return err
}


// ListPublicNotebooks lists public notebooks that have infograph or ppt notes
func (s *Store) ListPublicNotebooks(ctx context.Context) ([]NotebookWithStats, error) {
	query := `
		SELECT DISTINCT
			n.id, n.user_id, n.name, n.description, n.is_public, n.public_token, n.created_at, n.updated_at, n.metadata,
			COALESCE((SELECT COUNT(*) FROM sources WHERE notebook_id = n.id), 0) as source_count,
			COALESCE((SELECT COUNT(*) FROM notes WHERE notebook_id = n.id), 0) as note_count,
			(
				SELECT json_extract(notes.metadata, '$.image_url')
				FROM notes
				WHERE notes.notebook_id = n.id AND notes.type = 'infograph'
					AND json_extract(notes.metadata, '$.image_url') IS NOT NULL
				ORDER BY notes.created_at DESC
				LIMIT 1
			) as cover_image_url,
			(
				SELECT json_extract(notes.metadata, '$.slides[0]')
				FROM notes
				WHERE notes.notebook_id = n.id AND notes.type = 'ppt'
					AND json_extract(notes.metadata, '$.slides') IS NOT NULL
					AND json_array_length(json_extract(notes.metadata, '$.slides')) > 0
				ORDER BY notes.created_at DESC
				LIMIT 1
			) as ppt_first_slide
		FROM notebooks n
			INNER JOIN notes notes ON notes.notebook_id = n.id
		WHERE n.is_public = 1
			AND notes.type IN ('infograph', 'ppt')
		ORDER BY n.updated_at DESC
		LIMIT 20
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notebooks := make([]NotebookWithStats, 0)
	for rows.Next() {
		var nb NotebookWithStats
		var metadataJSON string
		var createdAt, updatedAt int64
		var uid sql.NullString
		var isPublic sql.NullInt64
		var publicToken sql.NullString
		var coverImageURL sql.NullString
		var pptFirstSlide sql.NullString

		if err := rows.Scan(&nb.ID, &uid, &nb.Name, &nb.Description, &isPublic, &publicToken, &createdAt, &updatedAt, &metadataJSON, &nb.SourceCount, &nb.NoteCount, &coverImageURL, &pptFirstSlide); err != nil {
			return nil, err
		}

		if uid.Valid {
			nb.UserID = uid.String
		}

		nb.IsPublic = isPublic.Valid && isPublic.Int64 > 0
		if publicToken.Valid {
			nb.PublicToken = publicToken.String
		}

		nb.CreatedAt = time.Unix(createdAt, 0)
		nb.UpdatedAt = time.Unix(updatedAt, 0)

		// Use infograph image URL first, then PPT first slide
		if coverImageURL.Valid && coverImageURL.String != "" {
			// Convert to web path (authenticated API)
			fileName := filepath.Base(coverImageURL.String)
			nb.CoverImageURL = "/api/files/" + fileName
		} else if pptFirstSlide.Valid && pptFirstSlide.String != "" {
			// Parse JSON array and extract first slide URL
			var slides []string
			if err := json.Unmarshal([]byte(pptFirstSlide.String), &slides); err == nil && len(slides) > 0 {
				fileName := filepath.Base(slides[0])
				nb.CoverImageURL = "/api/files/" + fileName
			}
		}

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &nb.Metadata)
		} else {
			nb.Metadata = make(map[string]interface{})
		}

		notebooks = append(notebooks, nb)
	}

	return notebooks, nil
}

// Source operations

// CreateSource creates a new source
func (s *Store) CreateSource(ctx context.Context, source *Source) error {
	if source.ID == "" {
		source.ID = uuid.New().String()
	}
	now := time.Now()
	source.CreatedAt = now
	source.UpdatedAt = now

	metadataJSON, _ := json.Marshal(source.Metadata)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sources (id, notebook_id, name, type, url, content, file_name, file_size, chunk_count, status, progress, error_msg, created_at, updated_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, source.ID, source.NotebookID, source.Name, source.Type, source.URL, source.Content,
		source.FileName, source.FileSize, source.ChunkCount, source.Status, source.Progress, source.ErrorMsg,
		now.Unix(), now.Unix(), string(metadataJSON))

	return err
}

// GetSource retrieves a source by ID
func (s *Store) GetSource(ctx context.Context, id string) (*Source, error) {
	var src Source
	var metadataJSON string
	var createdAt, updatedAt int64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, notebook_id, name, type, url, content, file_name, file_size, chunk_count, status, progress, error_msg, created_at, updated_at, metadata
		FROM sources WHERE id = ?
	`, id).Scan(&src.ID, &src.NotebookID, &src.Name, &src.Type, &src.URL, &src.Content,
		&src.FileName, &src.FileSize, &src.ChunkCount, &src.Status, &src.Progress, &src.ErrorMsg,
		&createdAt, &updatedAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("source not found")
	}
	if err != nil {
		return nil, err
	}

	src.CreatedAt = time.Unix(createdAt, 0)
	src.UpdatedAt = time.Unix(updatedAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &src.Metadata)
	} else {
		src.Metadata = make(map[string]interface{})
	}

	return &src, nil
}

// GetSourceByFileName finds a source by its filename and returns the source with its notebook info
func (s *Store) GetSourceByFileName(ctx context.Context, filename string) (*Source, *Notebook, error) {
	var src Source
	var notebook Notebook
	var metadataJSON string
	var notebookMetadataJSON string
	var createdAt, updatedAt, notebookCreatedAt, notebookUpdatedAt int64
	var publicToken sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT
			s.id, s.notebook_id, s.name, s.type, s.url, s.content, s.file_name, s.file_size, s.chunk_count,
			s.status, s.progress, s.error_msg,
			s.created_at, s.updated_at, s.metadata,
			n.id as nb_id, n.user_id as nb_user_id, n.name as nb_name, n.description as nb_description,
			n.is_public as nb_is_public, n.public_token as nb_public_token,
			n.created_at as nb_created_at, n.updated_at as nb_updated_at, n.metadata as nb_metadata
		FROM sources s
		INNER JOIN notebooks n ON s.notebook_id = n.id
		WHERE s.file_name = ?
	`, filename).Scan(
		&src.ID, &src.NotebookID, &src.Name, &src.Type, &src.URL, &src.Content,
		&src.FileName, &src.FileSize, &src.ChunkCount, &src.Status, &src.Progress, &src.ErrorMsg,
		&createdAt, &updatedAt, &metadataJSON,
		&notebook.ID, &notebook.UserID, &notebook.Name, &notebook.Description,
		&notebook.IsPublic, &publicToken,
		&notebookCreatedAt, &notebookUpdatedAt, &notebookMetadataJSON,
	)

	if err == sql.ErrNoRows {
		return nil, nil, fmt.Errorf("source not found")
	}
	if err != nil {
		return nil, nil, err
	}

	src.CreatedAt = time.Unix(createdAt, 0)
	src.UpdatedAt = time.Unix(updatedAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &src.Metadata)
	} else {
		src.Metadata = make(map[string]interface{})
	}

	notebook.CreatedAt = time.Unix(notebookCreatedAt, 0)
	notebook.UpdatedAt = time.Unix(notebookUpdatedAt, 0)

	if publicToken.Valid {
		notebook.PublicToken = publicToken.String
	} else {
		notebook.PublicToken = ""
	}

	if notebookMetadataJSON != "" {
		json.Unmarshal([]byte(notebookMetadataJSON), &notebook.Metadata)
	} else {
		notebook.Metadata = make(map[string]interface{})
	}

	return &src, &notebook, nil
}

// ListSources retrieves all sources for a notebook
func (s *Store) ListSources(ctx context.Context, notebookID string) ([]Source, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, notebook_id, name, type, url, content, file_name, file_size, chunk_count, status, progress, error_msg, created_at, updated_at, metadata
		FROM sources WHERE notebook_id = ? ORDER BY created_at DESC
	`, notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := make([]Source, 0)
	for rows.Next() {
		var src Source
		var metadataJSON string
		var createdAt, updatedAt int64

		if err := rows.Scan(&src.ID, &src.NotebookID, &src.Name, &src.Type, &src.URL, &src.Content,
			&src.FileName, &src.FileSize, &src.ChunkCount, &src.Status, &src.Progress, &src.ErrorMsg,
			&createdAt, &updatedAt, &metadataJSON); err != nil {
			return nil, err
		}

		src.CreatedAt = time.Unix(createdAt, 0)
		src.UpdatedAt = time.Unix(updatedAt, 0)

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &src.Metadata)
		} else {
			src.Metadata = make(map[string]interface{})
		}

		sources = append(sources, src)
	}

	return sources, nil
}

// DeleteSource deletes a source
func (s *Store) DeleteSource(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sources WHERE id = ?`, id)
	return err
}

// UpdateSourceChunkCount updates the chunk count for a source
func (s *Store) UpdateSourceChunkCount(ctx context.Context, id string, chunkCount int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sources SET chunk_count = ? WHERE id = ?`, chunkCount, id)
	return err
}

// Note operations

// CreateNote creates a new note
func (s *Store) CreateNote(ctx context.Context, note *Note) error {
	note.ID = uuid.New().String()
	now := time.Now()
	note.CreatedAt = now
	note.UpdatedAt = now

	metadataJSON, _ := json.Marshal(note.Metadata)
	sourceIDsJSON, _ := json.Marshal(note.SourceIDs)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO notes (id, notebook_id, title, content, type, source_ids, created_at, updated_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, note.ID, note.NotebookID, note.Title, note.Content, note.Type, string(sourceIDsJSON),
		now.Unix(), now.Unix(), string(metadataJSON))

	return err
}

// GetNote retrieves a note by ID
func (s *Store) GetNote(ctx context.Context, id string) (*Note, error) {
	var note Note
	var metadataJSON, sourceIDsJSON string
	var createdAt, updatedAt int64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, notebook_id, title, content, type, source_ids, created_at, updated_at, metadata
		FROM notes WHERE id = ?
	`, id).Scan(&note.ID, &note.NotebookID, &note.Title, &note.Content, &note.Type,
		&sourceIDsJSON, &createdAt, &updatedAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("note not found")
	}
	if err != nil {
		return nil, err
	}

	note.CreatedAt = time.Unix(createdAt, 0)
	note.UpdatedAt = time.Unix(updatedAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &note.Metadata)
	} else {
		note.Metadata = make(map[string]interface{})
	}

	if sourceIDsJSON != "" {
		json.Unmarshal([]byte(sourceIDsJSON), &note.SourceIDs)
	}

	return &note, nil
}

// ListNotes retrieves all notes for a notebook
func (s *Store) ListNotes(ctx context.Context, notebookID string) ([]Note, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, notebook_id, title, content, type, source_ids, created_at, updated_at, metadata
		FROM notes WHERE notebook_id = ? ORDER BY created_at DESC
	`, notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := make([]Note, 0)
	for rows.Next() {
		var note Note
		var metadataJSON, sourceIDsJSON string
		var createdAt, updatedAt int64

		if err := rows.Scan(&note.ID, &note.NotebookID, &note.Title, &note.Content, &note.Type,
			&sourceIDsJSON, &createdAt, &updatedAt, &metadataJSON); err != nil {
			return nil, err
		}

		note.CreatedAt = time.Unix(createdAt, 0)
		note.UpdatedAt = time.Unix(updatedAt, 0)

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &note.Metadata)
		} else {
			note.Metadata = make(map[string]interface{})
		}

		if sourceIDsJSON != "" {
			json.Unmarshal([]byte(sourceIDsJSON), &note.SourceIDs)
		}

		notes = append(notes, note)
	}

	return notes, nil
}

// GetNoteByFileName finds a note by its filename in metadata (image_url or slides)
// Returns the note with its notebook info
func (s *Store) GetNoteByFileName(ctx context.Context, filename string) (*Note, *Notebook, error) {
	log.Printf("DEBUG: GetNoteByFileName called for filename: %s", filename)

	// Get all notes and search for the filename
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			n.id, n.notebook_id, n.title, n.content, n.type, n.source_ids,
			n.created_at, n.updated_at, n.metadata,
			nb.id as nb_id, nb.user_id as nb_user_id, nb.name as nb_name, nb.description as nb_description,
			nb.is_public as nb_is_public, nb.public_token as nb_public_token,
			nb.created_at as nb_created_at, nb.updated_at as nb_updated_at, nb.metadata as nb_metadata
		FROM notes n
		INNER JOIN notebooks nb ON n.notebook_id = nb.id
	`)
	if err != nil {
		log.Printf("DEBUG: Query error: %v", err)
		return nil, nil, err
	}
	defer rows.Close()

	noteCount := 0
	for rows.Next() {
		noteCount++

		var note Note
		var notebook Notebook
		var metadataJSON, sourceIDsJSON, notebookMetadataJSON string
		var createdAt, updatedAt, nbCreatedAt, nbUpdatedAt int64
		var nbPublicToken sql.NullString

		if err := rows.Scan(
			&note.ID, &note.NotebookID, &note.Title, &note.Content, &note.Type, &sourceIDsJSON,
			&createdAt, &updatedAt, &metadataJSON,
			&notebook.ID, &notebook.UserID, &notebook.Name, &notebook.Description,
			&notebook.IsPublic, &nbPublicToken,
			&nbCreatedAt, &nbUpdatedAt, &notebookMetadataJSON,
		); err != nil {
			log.Printf("DEBUG: Scan error at row %d: %v", noteCount, err)
			continue
		}

		// Convert NullString to string
		if nbPublicToken.Valid {
			notebook.PublicToken = nbPublicToken.String
		} else {
			notebook.PublicToken = ""
		}

		note.CreatedAt = time.Unix(createdAt, 0)
		note.UpdatedAt = time.Unix(updatedAt, 0)
		notebook.CreatedAt = time.Unix(nbCreatedAt, 0)
		notebook.UpdatedAt = time.Unix(nbUpdatedAt, 0)

		if metadataJSON != "" {
			if err := json.Unmarshal([]byte(metadataJSON), &note.Metadata); err != nil {
				log.Printf("Failed to unmarshal note metadata: %v, JSON: %s", err, metadataJSON)
				note.Metadata = make(map[string]interface{})
			}
		} else {
			note.Metadata = make(map[string]interface{})
		}

		if notebookMetadataJSON != "" {
			if err := json.Unmarshal([]byte(notebookMetadataJSON), &notebook.Metadata); err != nil {
				log.Printf("Failed to unmarshal notebook metadata: %v", err)
				notebook.Metadata = make(map[string]interface{})
			}
		} else {
			notebook.Metadata = make(map[string]interface{})
		}

		if sourceIDsJSON != "" {
			json.Unmarshal([]byte(sourceIDsJSON), &note.SourceIDs)
		}

		// Debug: print metadata for infograph type notes
		if note.Type == "infograph" {
			log.Printf("DEBUG: Found infograph note %s, metadata: %+v", note.ID, note.Metadata)
		}

		// Check if filename is in image_url
		if imageURL, ok := note.Metadata["image_url"]; ok {
			if imageURLStr, ok := imageURL.(string); ok {
				log.Printf("DEBUG: Checking image_url: %s vs %s", filepath.Base(imageURLStr), filename)
				if filepath.Base(imageURLStr) == filename {
					log.Printf("Found file in note image_url: %s, notebook: %s, public: %v", filename, notebook.ID, notebook.IsPublic)
					return &note, &notebook, nil
				}
			}
		}

		// Check if filename is in slides
		if slides, ok := note.Metadata["slides"]; ok {
			// Try to handle slides as JSON array
			if slidesArray, ok := slides.([]interface{}); ok {
				for _, slide := range slidesArray {
					if slideURL, ok := slide.(string); ok && filepath.Base(slideURL) == filename {
						return &note, &notebook, nil
					}
				}
			}
			// Try to handle slides as JSON string (from SQLite)
			if slidesStr, ok := slides.(string); ok && slidesStr != "" {
				var slidesArray []string
				if err := json.Unmarshal([]byte(slidesStr), &slidesArray); err == nil {
					for _, slideURL := range slidesArray {
						if filepath.Base(slideURL) == filename {
							return &note, &notebook, nil
						}
					}
				}
			}
		}
	}

	log.Printf("DEBUG: Checked %d notes, file not found", noteCount)
	return nil, nil, fmt.Errorf("note not found for filename")
}

// DeleteNote deletes a note
func (s *Store) DeleteNote(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM notes WHERE id = ?`, id)
	return err
}

// Chat operations

// CreateChatSession creates a new chat session
func (s *Store) CreateChatSession(ctx context.Context, notebookID, title string) (*ChatSession, error) {
	id := uuid.New().String()
	now := time.Now()

	if title == "" {
		title = "New Chat"
	}

	metadataJSON, _ := json.Marshal(map[string]interface{}{})

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO chat_sessions (id, notebook_id, title, created_at, updated_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, notebookID, title, now.Unix(), now.Unix(), string(metadataJSON))
	if err != nil {
		return nil, err
	}

	return s.GetChatSession(ctx, id)
}

// GetChatSession retrieves a chat session by ID
func (s *Store) GetChatSession(ctx context.Context, id string) (*ChatSession, error) {
	var session ChatSession
	var metadataJSON string
	var summary sql.NullString
	var createdAt, updatedAt int64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, notebook_id, title, summary, created_at, updated_at, metadata
		FROM chat_sessions WHERE id = ?
	`, id).Scan(&session.ID, &session.NotebookID, &session.Title, &summary, &createdAt, &updatedAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("chat session not found")
	}
	if err != nil {
		return nil, err
	}

	session.CreatedAt = time.Unix(createdAt, 0)
	session.UpdatedAt = time.Unix(updatedAt, 0)

	if summary.Valid {
		session.Summary = summary.String
	} else {
		session.Summary = ""
	}

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &session.Metadata)
	} else {
		session.Metadata = make(map[string]interface{})
	}

	// Load messages
	session.Messages, err = s.listChatMessages(ctx, id)
	if err != nil {
		return nil, err
	}

	return &session, nil
}

// ListChatSessions retrieves all chat sessions for a notebook
func (s *Store) ListChatSessions(ctx context.Context, notebookID string) ([]ChatSession, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, notebook_id, title, summary, created_at, updated_at, metadata
		FROM chat_sessions WHERE notebook_id = ? ORDER BY updated_at DESC
	`, notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]ChatSession, 0)
	for rows.Next() {
		var session ChatSession
		var metadataJSON string
		var summary sql.NullString
		var createdAt, updatedAt int64

		if err := rows.Scan(&session.ID, &session.NotebookID, &session.Title, &summary, &createdAt, &updatedAt, &metadataJSON); err != nil {
			return nil, err
		}

		session.CreatedAt = time.Unix(createdAt, 0)
		session.UpdatedAt = time.Unix(updatedAt, 0)

		if summary.Valid {
			session.Summary = summary.String
		} else {
			session.Summary = ""
		}

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &session.Metadata)
		} else {
			session.Metadata = make(map[string]interface{})
		}

		sessions = append(sessions, session)
	}

	return sessions, nil
}

// AddChatMessage adds a message to a chat session
func (s *Store) AddChatMessage(ctx context.Context, sessionID, role, content string, sources []string) (*ChatMessage, error) {
	id := uuid.New().String()
	now := time.Now()

	metadataJSON, _ := json.Marshal(map[string]interface{}{})
	sourcesJSON, _ := json.Marshal(sources)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO chat_messages (id, session_id, role, content, sources, created_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, sessionID, role, content, string(sourcesJSON), now.Unix(), string(metadataJSON))
	if err != nil {
		return nil, err
	}

	// Update session timestamp
	_, err = s.db.ExecContext(ctx, `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`, now.Unix(), sessionID)
	if err != nil {
		return nil, err
	}

	return s.getChatMessage(ctx, id)
}

// listChatMessages retrieves all messages for a session
func (s *Store) listChatMessages(ctx context.Context, sessionID string) ([]ChatMessage, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, role, content, sources, created_at, metadata
		FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]ChatMessage, 0)
	for rows.Next() {
		var msg ChatMessage
		var metadataJSON, sourcesJSON string
		var createdAt int64

		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Content, &sourcesJSON, &createdAt, &metadataJSON); err != nil {
			return nil, err
		}

		msg.CreatedAt = time.Unix(createdAt, 0)

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &msg.Metadata)
		} else {
			msg.Metadata = make(map[string]interface{})
		}

		if sourcesJSON != "" {
			json.Unmarshal([]byte(sourcesJSON), &msg.Sources)
		}

		messages = append(messages, msg)
	}

	return messages, nil
}

// getChatMessage retrieves a single message by ID
func (s *Store) getChatMessage(ctx context.Context, id string) (*ChatMessage, error) {
	var msg ChatMessage
	var metadataJSON, sourcesJSON string
	var createdAt int64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, role, content, sources, created_at, metadata
		FROM chat_messages WHERE id = ?
	`, id).Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Content, &sourcesJSON, &createdAt, &metadataJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("chat message not found")
	}
	if err != nil {
		return nil, err
	}

	msg.CreatedAt = time.Unix(createdAt, 0)

	if metadataJSON != "" {
		json.Unmarshal([]byte(metadataJSON), &msg.Metadata)
	} else {
		msg.Metadata = make(map[string]interface{})
	}

	if sourcesJSON != "" {
		json.Unmarshal([]byte(sourcesJSON), &msg.Sources)
	}

	return &msg, nil
}

// DeleteChatSession deletes a chat session
func (s *Store) DeleteChatSession(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM chat_sessions WHERE id = ?`, id)
	return err
}

// UpdateSessionTitle updates the title of a chat session
func (s *Store) UpdateSessionTitle(ctx context.Context, id, title string) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `
		UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?
	`, title, now.Unix(), id)
	return err
}

// UpdateSessionMetadata updates the metadata of a chat session
func (s *Store) UpdateSessionMetadata(ctx context.Context, id string, metadata map[string]interface{}) error {
	metadataJSON, _ := json.Marshal(metadata)
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `
		UPDATE chat_sessions SET metadata = ?, updated_at = ? WHERE id = ?
	`, string(metadataJSON), now.Unix(), id)
	return err
}

// LogActivity logs a user activity to both database and audit log file
func (s *Store) LogActivity(ctx context.Context, log *ActivityLog) error {
	if log.ID == "" {
		log.ID = uuid.New().String()
	}
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now()
	}

	// Write to database
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, resource_name, details, ip_address, user_agent, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, log.ID, log.UserID, log.Action, log.ResourceType, log.ResourceID, log.ResourceName, log.Details, log.IPAddress, log.UserAgent, log.CreatedAt.Unix())

	// Also write to audit log file (async, don't fail if it errors)
	LogUserActivity(log.Action, log.UserID, log.ResourceType, log.ResourceID, log.ResourceName, log.Details, log.IPAddress, log.UserAgent)

	return err
}

// Close closes the database connection
func (s *Store) Close() error {
	return s.db.Close()
}

// UpdateSourceStatus updates the processing status of a source
func (s *Store) UpdateSourceStatus(ctx context.Context, id, status string, progress int, errorMsg string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sources 
		SET status = ?, progress = ?, error_msg = ?, updated_at = ?
		WHERE id = ?
	`, status, progress, errorMsg, now, id)
	return err
}

// UpdateSourceContent updates the content and chunk count of a source
func (s *Store) UpdateSourceContent(ctx context.Context, id string, content string, chunkCount int) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sources 
		SET content = ?, chunk_count = ?, status = 'completed', progress = 100, updated_at = ?
		WHERE id = ?
	`, content, chunkCount, now, id)
	return err
}
