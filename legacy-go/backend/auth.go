package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/kataras/golog"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

type AuthHandler struct {
	config Config
	store  *Store

	githubConfig *oauth2.Config
	googleConfig *oauth2.Config
}

func NewAuthHandler(cfg Config, store *Store) *AuthHandler {
	ah := &AuthHandler{
		config: cfg,
		store:  store,
	}

	if cfg.GithubClientID != "" {
		ah.githubConfig = &oauth2.Config{
			ClientID:     cfg.GithubClientID,
			ClientSecret: cfg.GithubClientSecret,
			RedirectURL:  cfg.GithubRedirectURL,
			Scopes:       []string{"user:email", "read:user"},
			Endpoint:     github.Endpoint,
		}
	}

	if cfg.GoogleClientID != "" {
		ah.googleConfig = &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint:     google.Endpoint,
		}
	}

	return ah
}

func (h *AuthHandler) HandleLogin(c *gin.Context) {
	provider := c.Param("provider")

	var url string
	switch provider {
	case "github":
		if h.githubConfig == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GitHub auth not configured"})
			return
		}
		url = h.githubConfig.AuthCodeURL("state", oauth2.AccessTypeOnline)
	case "google":
		if h.googleConfig == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google auth not configured"})
			return
		}
		url = h.googleConfig.AuthCodeURL("state", oauth2.AccessTypeOnline)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider"})
		return
	}

	// Redirect to the OAuth provider's authorization page
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *AuthHandler) HandleCallback(c *gin.Context) {
	provider := c.Param("provider")
	code := c.Query("code")

	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code not found"})
		return
	}

	var email, name, avatarURL string

	switch provider {
	case "github":
		token, err := h.githubConfig.Exchange(context.Background(), code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
			return
		}

		client := h.githubConfig.Client(context.Background(), token)
		resp, err := client.Get("https://api.github.com/user")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var ghUser struct {
			Email     string `json:"email"`
			Name      string `json:"name"`
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		}
		json.Unmarshal(body, &ghUser)

		if ghUser.Email == "" {
			// Try to fetch emails
			emailResp, err := client.Get("https://api.github.com/user/emails")
			if err == nil {
				defer emailResp.Body.Close()
				emailBody, _ := io.ReadAll(emailResp.Body)
				var emails []struct {
					Email    string `json:"email"`
					Primary  bool   `json:"primary"`
					Verified bool   `json:"verified"`
				}
				json.Unmarshal(emailBody, &emails)
				for _, e := range emails {
					if e.Primary && e.Verified {
						ghUser.Email = e.Email
						break
					}
				}
			}
		}

		if ghUser.Email == "" {
			ghUser.Email = ghUser.Login + "@github.com"
		}

		email = ghUser.Email
		name = ghUser.Name
		if name == "" {
			name = ghUser.Login
		}
		avatarURL = ghUser.AvatarURL

	case "google":
		token, err := h.googleConfig.Exchange(context.Background(), code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
			return
		}

		client := h.googleConfig.Client(context.Background(), token)
		resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var gUser struct {
			Email   string `json:"email"`
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		json.Unmarshal(body, &gUser)

		email = gUser.Email
		name = gUser.Name
		avatarURL = gUser.Picture

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider"})
		return
	}

	// Create or Update User
	user := &User{
		Email:     email,
		Name:      name,
		AvatarURL: avatarURL,
		Provider:  provider,
	}

	if err := h.store.CreateUser(context.Background(), user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Get the full user object (with ID)
	dbUser, err := h.store.GetUserByEmail(context.Background(), email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user"})
		return
	}

	// Generate JWT
	tokenString, err := GenerateJWT(dbUser.ID, h.config.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Log user login activity
	activityLog := &ActivityLog{
		UserID:       dbUser.ID,
		Action:       "login",
		ResourceName: provider,
		Details:      fmt.Sprintf(`{"provider": "%s", "email": "%s"}`, provider, dbUser.Email),
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
	}
	if err := h.store.LogActivity(context.Background(), activityLog); err != nil {
		// Log error but don't fail the login
		golog.Errorf("failed to log login activity: %v", err)
	}

	// Return token via HTML for popup or redirect
	// Get origin from redirect URL for security
	origin := ""
	if provider == "github" && h.config.GithubRedirectURL != "" {
		origin = getOriginFromURL(h.config.GithubRedirectURL)
	} else if provider == "google" && h.config.GoogleRedirectURL != "" {
		origin = getOriginFromURL(h.config.GoogleRedirectURL)
	}

	// Fallback to request host if origin not configured
	if origin == "" {
		scheme := "https"
		if c.Request.TLS == nil {
			scheme = "http"
		}
		origin = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
	}

	c.Header("Content-Type", "text/html")
	c.String(http.StatusOK, fmt.Sprintf(`
        <script>
            window.opener.postMessage({token: "%s", user: %s}, "%s");
            window.close();
        </script>
    `, tokenString, toJson(dbUser), origin))
}

func (h *AuthHandler) HandleMe(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	user, err := h.store.GetUser(c, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// HandleTestLogin handles test mode login (bypasses OAuth)
func (h *AuthHandler) HandleTestLogin(c *gin.Context) {
	if !h.config.EnableTestMode {
		c.JSON(http.StatusForbidden, gin.H{"error": "Test mode is not enabled"})
		return
	}

	ctx := context.Background()

	// Create or get test user
	testUser := &User{
		ID:        h.config.TestUserID,
		Email:     h.config.TestUserEmail,
		Name:      h.config.TestUserName,
		AvatarURL: h.config.TestUserAvatar,
		Provider:  "test",
	}

	// Try to get existing user first
	existingUser, err := h.store.GetUserByEmail(ctx, h.config.TestUserEmail)
	if err == nil && existingUser != nil {
		// User exists, use existing data
		testUser = existingUser
	} else {
		// Create new user
		if err := h.store.CreateUser(ctx, testUser); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create test user"})
			return
		}
		// Get the created user
		testUser, err = h.store.GetUserByEmail(ctx, h.config.TestUserEmail)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get test user"})
			return
		}
	}

	// Generate JWT
	tokenString, err := GenerateJWT(testUser.ID, h.config.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Log test login activity
	activityLog := &ActivityLog{
		UserID:       testUser.ID,
		Action:       "login",
		ResourceName: "test_mode",
		Details:      `{"provider": "test", "email": "` + testUser.Email + `"}`,
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
	}
	if err := h.store.LogActivity(ctx, activityLog); err != nil {
		golog.Errorf("failed to log test login activity: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user":  testUser,
	})
}

// HandleTestMode returns whether test mode is enabled
func (h *AuthHandler) HandleTestMode(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled": h.config.EnableTestMode,
	})
}

func toJson(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func GenerateJWT(userID, secret string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 24 * 7).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// getOriginFromURL extracts the origin (scheme://host) from a URL
func getOriginFromURL(urlStr string) string {
	if urlStr == "" {
		return ""
	}
	// Simple parsing to extract origin
	// URL format: https://example.com/auth/callback/github
	// We want: https://example.com
	if strings.HasPrefix(urlStr, "https://") {
		idx := strings.Index(urlStr[8:], "/")
		if idx == -1 {
			return urlStr
		}
		return urlStr[:8+idx]
	}
	if strings.HasPrefix(urlStr, "http://") {
		idx := strings.Index(urlStr[7:], "/")
		if idx == -1 {
			return urlStr
		}
		return urlStr[:7+idx]
	}
	return ""
}
