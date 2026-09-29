package backend

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/kataras/golog"
	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
)

var auditLogger *golog.Logger

func init() {
	// Create audit logger
	auditLogger = golog.New()

	// Create logs directory if not exists
	if err := os.MkdirAll("./logs", 0755); err != nil {
		golog.Errorf("failed to create logs directory: %v", err)
	}

	// Setup log rotation
	logFiles := "./logs/audit.log.%Y%m%d"
	writer, err := rotatelogs.New(
		logFiles,
		rotatelogs.WithLinkName("./logs/audit.log"),
		rotatelogs.WithMaxAge(time.Duration(7)*24*time.Hour),
		rotatelogs.WithRotationTime(24*time.Hour),
	)
	if err != nil {
		golog.Errorf("failed to create rotatelogs writer: %v", err)
		auditLogger.SetOutput(os.Stdout)
	} else {
		// Write to both file and stdout
		auditLogger.SetOutput(io.MultiWriter(writer, os.Stdout))
	}

	// Set audit logger configuration
	auditLogger.SetLevel("info")
	auditLogger.SetTimeFormat("2006-01-02 15:04:05")
}

// getClientIP extracts the real client IP from the request, taking into account
// proxies and load balancers that set X-Forwarded-For, X-Real-IP, etc.
func getClientIP(c *gin.Context) string {
	// Check X-Forwarded-For header (set by Nginx and other proxies)
	// Format: X-Forwarded-For: <client>, <proxy1>, <proxy2>
	// The first IP is the original client IP
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		// Parse the first IP from the comma-separated list
		for i, char := range xff {
			if char == ',' {
				return xff[:i]
			}
		}
		return xff
	}

	// Check X-Real-IP header (often set by Nginx)
	if xri := c.GetHeader("X-Real-IP"); xri != "" {
		return xri
	}

	// Check CF-Connecting-IP (Cloudflare)
	if cfip := c.GetHeader("CF-Connecting-IP"); cfip != "" {
		return cfip
	}

	// Check True-Client-IP (Akamai and Cloudflare Enterprise)
	if tci := c.GetHeader("True-Client-IP"); tci != "" {
		return tci
	}

	// Fall back to RemoteAddr
	return c.ClientIP()
}

// responseBodyWriter wraps gin.ResponseWriter to capture response body
type responseBodyWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (r *responseBodyWriter) Write(b []byte) (int, error) {
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

// AuditMiddleware creates a middleware that logs all HTTP requests with full details
func AuditMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Capture request body for POST/PUT/PATCH requests
		var requestBody string
		if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" {
			bodyBytes, err := io.ReadAll(c.Request.Body)
			if err == nil {
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				if len(bodyBytes) > 1000 {
					requestBody = string(bodyBytes[:1000]) + "... (truncated)"
				} else {
					requestBody = string(bodyBytes)
				}
			}
		}

		// Capture response body
		w := &responseBodyWriter{
			ResponseWriter: c.Writer,
			body:           bytes.NewBufferString(""),
		}
		c.Writer = w

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start).Milliseconds()

		// Get client IP (handling proxy headers)
		clientIP := getClientIP(c)

		// Build log message
		msg := fmt.Sprintf("[AUDIT] client_ip=%s method=%s path=%s status=%d latency_ms=%d",
			clientIP, c.Request.Method, c.Request.URL.Path, c.Writer.Status(), latency)

		if requestBody != "" {
			msg += fmt.Sprintf(" request_body=%s", requestBody)
		}

		if w.body.Len() > 0 {
			respBytes := w.body.Bytes()
			if len(respBytes) > 1000 {
				msg += fmt.Sprintf(" response_body=%s... (truncated)", string(respBytes[:1000]))
			} else {
				msg += fmt.Sprintf(" response_body=%s", string(respBytes))
			}
		}

		if len(c.Errors) > 0 {
			msg += fmt.Sprintf(" errors=%s", c.Errors.String())
		}

		auditLogger.Info(msg)
	}
}

// AuditMiddlewareLite creates a lightweight middleware that logs HTTP requests
// without capturing request/response bodies (better performance)
func AuditMiddlewareLite() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start).Milliseconds()

		// Get client IP (handling proxy headers)
		clientIP := getClientIP(c)

		// Build log message
		msg := fmt.Sprintf("[AUDIT] client_ip=%s method=%s path=%s status=%d latency_ms=%d user_agent=%s",
			clientIP, c.Request.Method, c.Request.URL.Path, c.Writer.Status(), latency, c.GetHeader("User-Agent"))

		if len(c.Errors) > 0 {
			msg += fmt.Sprintf(" errors=%s", c.Errors.String())
		}

		auditLogger.Info(msg)
	}
}

// AuthMiddleware authenticates requests using JWT
func AuthMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		// Remove "Bearer " prefix
		if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
			tokenString = tokenString[7:]
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})

		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			userID, ok := claims["user_id"].(string)
			if !ok {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
				return
			}
			c.Set("user_id", userID)
		} else {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		c.Next()
	}
}

// OptionalAuthMiddleware tries to authenticate using JWT, but doesn't require it
// It supports Authorization header, cookie, and token URL parameter
func OptionalAuthMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// Try Authorization header first
		tokenString = c.GetHeader("Authorization")
		if tokenString != "" {
			auditLogger.Infof("OptionalAuth: Found Authorization header")
			// Remove "Bearer " prefix
			if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
				tokenString = tokenString[7:]
			}
		}

		// Try cookie
		if tokenString == "" {
			if cookie, err := c.Cookie("token"); err == nil && cookie != "" {
				tokenString = cookie
				auditLogger.Infof("OptionalAuth: Found token in cookie")
			}
		}

		// Try token parameter as fallback
		if tokenString == "" {
			tokenString = c.Query("token")
			if tokenString != "" {
				auditLogger.Infof("OptionalAuth: Found token in query parameter")
			}
		}

		// If no token found, continue without setting user_id
		if tokenString == "" {
			auditLogger.Infof("OptionalAuth: No token found (checked header, cookie, and query param)")
			c.Next()
			return
		}

		// Try to validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})

		if err != nil {
			// Invalid token, continue without setting user_id
			auditLogger.Infof("OptionalAuth: Invalid token: %v", err)
			c.Next()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			if userID, ok := claims["user_id"].(string); ok {
				auditLogger.Infof("OptionalAuth: Successfully authenticated user_id: %s", userID)
				c.Set("user_id", userID)
			}
		}

		c.Next()
	}
}

// GetAuditLogger returns the audit logger instance
func GetAuditLogger() *golog.Logger {
	return auditLogger
}

// LogUserActivity logs user activity to the audit log file
func LogUserActivity(action, userID, resourceType, resourceID, resourceName, details, ipAddress, userAgent string) {
	msg := fmt.Sprintf("[USER_ACTIVITY] action=%s user_id=%s resource_type=%s resource_id=%s resource_name=%q details=%q ip=%s user_agent=%q",
		action, userID, resourceType, resourceID, resourceName, details, ipAddress, userAgent)
	auditLogger.Info(msg)
}

// HashIDAuthMiddleware authenticates requests using user hash_id
// The hash_id should be provided as a query parameter or header
func HashIDAuthMiddleware(store interface{ GetUserByHashID(context.Context, string) (*User, error) }) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try hash_id query parameter first
		hashID := c.Query("hash_id")

		// Try X-Hash-ID header as fallback
		if hashID == "" {
			hashID = c.GetHeader("X-Hash-ID")
		}

		if hashID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "hash_id parameter or X-Hash-ID header required"})
			return
		}

		// Validate hash_id format (base62, expected length 8-16)
		if len(hashID) < 8 || len(hashID) > 16 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid hash_id format"})
			return
		}

		// Look up user by hash_id
		user, err := store.GetUserByHashID(c.Request.Context(), hashID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid hash_id"})
			return
		}

		// Set user_id and hash_id in context
		c.Set("user_id", user.ID)
		c.Set("hash_id", hashID)

		auditLogger.Infof("HashIDAuth: Successfully authenticated hash_id=%s, user_id=%s", hashID, user.ID)

		c.Next()
	}
}
