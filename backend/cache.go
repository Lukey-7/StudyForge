package backend

import (
	"context"
	"sync"
	"time"
)

// Cache is a simple in-memory cache with TTL support
type Cache struct {
	mu    sync.RWMutex
	data  map[string]*cacheEntry
	ttl   time.Duration
	stats CacheStats
}

type cacheEntry struct {
	data      interface{}
	expiresAt time.Time
}

type CacheStats struct {
	Hits      int64
	Misses    int64
	Evictions int64
}

// NewCache creates a new cache with the specified TTL
func NewCache(ttl time.Duration) *Cache {
	c := &Cache{
		data: make(map[string]*cacheEntry),
		ttl:  ttl,
	}
	// Start cleanup goroutine
	go c.cleanupLoop()
	return c
}

// Get retrieves a value from the cache
func (c *Cache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.data[key]
	if !exists {
		c.stats.Misses++
		return nil, false
	}

	if time.Now().After(entry.expiresAt) {
		// Entry has expired
		c.stats.Misses++
		return nil, false
	}

	c.stats.Hits++
	return entry.data, true
}

// Set stores a value in the cache
func (c *Cache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data[key] = &cacheEntry{
		data:      value,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Delete removes a value from the cache
func (c *Cache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.data, key)
}

// InvalidatePattern removes all entries matching a key prefix
func (c *Cache) InvalidatePattern(prefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	count := 0
	for key := range c.data {
		if len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			delete(c.data, key)
			count++
		}
	}
	c.stats.Evictions += int64(count)
}

// Clear removes all entries from the cache
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data = make(map[string]*cacheEntry)
}

// cleanupLoop periodically removes expired entries
func (c *Cache) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.cleanup()
	}
}

// cleanup removes expired entries
func (c *Cache) cleanup() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	count := 0
	for key, entry := range c.data {
		if now.After(entry.expiresAt) {
			delete(c.data, key)
			count++
		}
	}
	if count > 0 {
		c.stats.Evictions += int64(count)
	}
}

// GetStats returns the cache statistics
func (c *Cache) GetStats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.stats
}

// Size returns the number of entries in the cache
func (c *Cache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return len(c.data)
}

// CachedStore wraps Store with caching functionality
type CachedStore struct {
	*Store
	cache *Cache
}

// NewCachedStore creates a new cached store
func NewCachedStore(store *Store, ttl time.Duration) *CachedStore {
	return &CachedStore{
		Store: store,
		cache: NewCache(ttl),
	}
}

// Cache key generators
func notebookListKey(userID string) string {
	return "notebooks:list:" + userID
}

func notebookKey(id string) string {
	return "notebook:" + id
}

func notesListKey(notebookID string) string {
	return "notes:" + notebookID
}

func sourcesListKey(notebookID string) string {
	return "sources:" + notebookID
}

func chatSessionsKey(notebookID string) string {
	return "chat_sessions:" + notebookID
}

// ListNotebooks retrieves all notebooks with caching
func (cs *CachedStore) ListNotebooks(ctx context.Context, userID string) ([]Notebook, error) {
	key := notebookListKey(userID)

	if cached, ok := cs.cache.Get(key); ok {
		if notebooks, ok := cached.([]Notebook); ok {
			return notebooks, nil
		}
	}

	notebooks, err := cs.Store.ListNotebooks(ctx, userID)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, notebooks)
	return notebooks, nil
}

// ListNotebooksWithStats retrieves all notebooks with their source and note counts with caching
func (cs *CachedStore) ListNotebooksWithStats(ctx context.Context, userID string) ([]NotebookWithStats, error) {
	key := notebookListKey(userID) + ":stats"

	if cached, ok := cs.cache.Get(key); ok {
		if notebooks, ok := cached.([]NotebookWithStats); ok {
			return notebooks, nil
		}
	}

	notebooks, err := cs.Store.ListNotebooksWithStats(ctx, userID)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, notebooks)
	return notebooks, nil
}

// GetNotebook retrieves a notebook by ID with caching
func (cs *CachedStore) GetNotebook(ctx context.Context, id string) (*Notebook, error) {
	key := notebookKey(id)

	if cached, ok := cs.cache.Get(key); ok {
		if notebook, ok := cached.(*Notebook); ok {
			return notebook, nil
		}
	}

	notebook, err := cs.Store.GetNotebook(ctx, id)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, notebook)
	return notebook, nil
}

// UpdateNotebook updates a notebook and invalidates cache
func (cs *CachedStore) UpdateNotebook(ctx context.Context, id string, name, description, color, icon string, metadata map[string]interface{}) (*Notebook, error) {
	notebook, err := cs.Store.UpdateNotebook(ctx, id, name, description, color, icon, metadata)
	if err != nil {
		return nil, err
	}

	// Invalidate caches
	cs.cache.Delete(notebookKey(id))
	// We can't easily invalidate list cache without userID, so we rely on TTL or clear all
	// Ideally we should pass userID here too, but for now let's clear matching patterns if possible
	// or accept slight staleness.
	// A better approach is to store userID in notebook struct and invalidate specifically.
	if notebook.UserID != "" {
		cs.cache.Delete(notebookListKey(notebook.UserID))
		cs.cache.Delete(notebookListKey(notebook.UserID) + ":stats")
	}

	return notebook, nil
}

// CreateNotebook creates a notebook and invalidates cache
func (cs *CachedStore) CreateNotebook(ctx context.Context, userID, name, description, color, icon string, metadata map[string]interface{}) (*Notebook, error) {
	notebook, err := cs.Store.CreateNotebook(ctx, userID, name, description, color, icon, metadata)
	if err != nil {
		return nil, err
	}

	// Invalidate list cache
	cs.cache.Delete(notebookListKey(userID))
	cs.cache.Delete(notebookListKey(userID) + ":stats")

	return notebook, nil
}

// DeleteNotebook deletes a notebook and invalidates cache
func (cs *CachedStore) DeleteNotebook(ctx context.Context, id string) error {
	// Get notebook first to find userID
	notebook, err := cs.Store.GetNotebook(ctx, id)
	if err != nil {
		return err
	}

	err = cs.Store.DeleteNotebook(ctx, id)
	if err != nil {
		return err
	}

	// Invalidate caches
	cs.cache.Delete(notebookKey(id))
	if notebook.UserID != "" {
		cs.cache.Delete(notebookListKey(notebook.UserID))
		cs.cache.Delete(notebookListKey(notebook.UserID) + ":stats")
	}
	cs.cache.InvalidatePattern(notesListKey(id))
	cs.cache.InvalidatePattern(sourcesListKey(id))
	cs.cache.InvalidatePattern(chatSessionsKey(id))

	return nil
}

// ListNotes retrieves all notes for a notebook with caching
func (cs *CachedStore) ListNotes(ctx context.Context, notebookID string) ([]Note, error) {
	key := notesListKey(notebookID)

	if cached, ok := cs.cache.Get(key); ok {
		if notes, ok := cached.([]Note); ok {
			return notes, nil
		}
	}

	notes, err := cs.Store.ListNotes(ctx, notebookID)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, notes)
	return notes, nil
}

// CreateNote creates a note and invalidates cache
func (cs *CachedStore) CreateNote(ctx context.Context, note *Note) error {
	err := cs.Store.CreateNote(ctx, note)
	if err != nil {
		return err
	}

	// Invalidate notes list cache for this notebook
	cs.cache.Delete(notesListKey(note.NotebookID))

	return nil
}

// DeleteNote deletes a note and invalidates cache
func (cs *CachedStore) DeleteNote(ctx context.Context, id string) error {
	// Get the note first to find its notebook ID
	note, err := cs.Store.GetNote(ctx, id)
	if err != nil {
		return err
	}

	err = cs.Store.DeleteNote(ctx, id)
	if err != nil {
		return err
	}

	// Invalidate notes list cache for this notebook
	cs.cache.Delete(notesListKey(note.NotebookID))

	return nil
}

// ListSources retrieves all sources for a notebook with caching
func (cs *CachedStore) ListSources(ctx context.Context, notebookID string) ([]Source, error) {
	key := sourcesListKey(notebookID)

	if cached, ok := cs.cache.Get(key); ok {
		if sources, ok := cached.([]Source); ok {
			return sources, nil
		}
	}

	sources, err := cs.Store.ListSources(ctx, notebookID)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, sources)
	return sources, nil
}

// CreateSource creates a source and invalidates cache
func (cs *CachedStore) CreateSource(ctx context.Context, source *Source) error {
	err := cs.Store.CreateSource(ctx, source)
	if err != nil {
		return err
	}

	// Invalidate sources list cache for this notebook
	cs.cache.Delete(sourcesListKey(source.NotebookID))

	return nil
}

// DeleteSource deletes a source and invalidates cache
func (cs *CachedStore) DeleteSource(ctx context.Context, id string) error {
	// Get the source first to find its notebook ID
	source, err := cs.Store.GetSource(ctx, id)
	if err != nil {
		return err
	}

	err = cs.Store.DeleteSource(ctx, id)
	if err != nil {
		return err
	}

	// Invalidate sources list cache for this notebook
	cs.cache.Delete(sourcesListKey(source.NotebookID))

	return nil
}

// ListChatSessions retrieves all chat sessions for a notebook with caching
func (cs *CachedStore) ListChatSessions(ctx context.Context, notebookID string) ([]ChatSession, error) {
	key := chatSessionsKey(notebookID)

	if cached, ok := cs.cache.Get(key); ok {
		if sessions, ok := cached.([]ChatSession); ok {
			return sessions, nil
		}
	}

	sessions, err := cs.Store.ListChatSessions(ctx, notebookID)
	if err != nil {
		return nil, err
	}

	cs.cache.Set(key, sessions)
	return sessions, nil
}

// CreateChatSession creates a chat session and invalidates cache
func (cs *CachedStore) CreateChatSession(ctx context.Context, notebookID, title string) (*ChatSession, error) {
	session, err := cs.Store.CreateChatSession(ctx, notebookID, title)
	if err != nil {
		return nil, err
	}

	// Invalidate chat sessions list cache for this notebook
	cs.cache.Delete(chatSessionsKey(notebookID))

	return session, nil
}

// DeleteChatSession deletes a chat session and invalidates cache
func (cs *CachedStore) DeleteChatSession(ctx context.Context, id string) error {
	// Get the session first to find its notebook ID
	session, err := cs.Store.GetChatSession(ctx, id)
	if err != nil {
		return err
	}

	err = cs.Store.DeleteChatSession(ctx, id)
	if err != nil {
		return err
	}

	// Invalidate chat sessions list cache for this notebook
	cs.cache.Delete(chatSessionsKey(session.NotebookID))

	return nil
}

// GetCacheStats returns the cache statistics
func (cs *CachedStore) GetCacheStats() CacheStats {
	return cs.cache.GetStats()
}

// ClearCache clears all cached data
func (cs *CachedStore) ClearCache() {
	cs.cache.Clear()
}
