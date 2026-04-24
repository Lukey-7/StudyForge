package backend

import (
	"crypto/rand"
	"time"

	"github.com/kataras/golog"
)

const (
	// Base62 charset for generating compact IDs
	base62Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

// GenerateBase62ID converts a number to base62 string
func GenerateBase62ID(n uint64) string {
	if n == 0 {
		return "0"
	}
	var result []byte
	base := uint64(len(base62Chars))
	for n > 0 {
		result = append([]byte{base62Chars[n%base]}, result...)
		n /= base
	}
	return string(result)
}

// StringUtils provides string manipulation utilities
type StringUtils struct{}

// GenerateRandomString generates a random string containing only hex characters (0-9, a-f)
func (su *StringUtils) GenerateRandomString(length int) string {
	if length <= 0 || length > 50 {
		length = 20
	}
	const hexChars = "0123456789abcdef"
	result := make([]byte, length)
	randomBytes := make([]byte, length)

	_, err := rand.Read(randomBytes)
	if err != nil {
		// Fallback to time-based randomness if crypto/rand fails
		golog.Warn("crypto/rand failed, using time-based fallback for random string generation")
		for i := range result {
			result[i] = hexChars[time.Now().UnixNano()%int64(len(hexChars))]
		}
		return string(result)
	}

	// Convert to hex characters (0-9, a-f)
	for i, b := range randomBytes {
		result[i] = hexChars[b%byte(len(hexChars))]
	}
	return string(result)
}

// GenerateSecureRandomString generates a cryptographically secure random string
// Only contains alphanumeric characters for better compatibility
func (su *StringUtils) GenerateSecureRandomString(length int) string {
	if length <= 0 {
		length = 20
	}

	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	randomBytes := make([]byte, length)

	_, err := rand.Read(randomBytes)
	if err != nil {
		// Fallback to time-based randomness
		golog.Warn("crypto/rand failed, using time-based fallback for secure random string")
		for i := range result {
			result[i] = charset[time.Now().UnixNano()%int64(len(charset))]
		}
		return string(result)
	}

	for i, b := range randomBytes {
		result[i] = charset[b%byte(len(charset))]
	}
	return string(result)
}

// Global utility instances for convenient access
var (
	Strings = &StringUtils{}
)
