// Command realtime runs the Qubedu WebSocket hub (chat, presence, live-class signaling).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/qubedu/realtime/internal/auth"
	"github.com/qubedu/realtime/internal/authz"
	"github.com/qubedu/realtime/internal/hub"
	"github.com/qubedu/realtime/internal/presence"
	"github.com/qubedu/realtime/internal/server"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	secret := env("JWT_SECRET", "dev-only-secret-change-me-dev-only-secret-change-me")
	internalToken := env("INTERNAL_TOKEN", "dev-internal-token-change-me")
	apiURL := env("API_INTERNAL_URL", "http://localhost:8787")
	addr := env("REALTIME_ADDR", ":8788")
	if env("NODE_ENV", "development") == "production" && (len(secret) < 32 || secret[:8] == "dev-only") {
		log.Error("JWT_SECRET must be set in production")
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	var rdb *redis.Client
	if url := os.Getenv("REDIS_URL"); url != "" {
		opt, err := redis.ParseURL(url)
		if err != nil {
			log.Error("invalid REDIS_URL", "err", err)
			os.Exit(1)
		}
		rdb = redis.NewClient(opt)
	} else {
		log.Warn("REDIS_URL not set: API events arrive only through POST /internal/publish")
	}

	h := hub.New(authz.NewAPIChecker(apiURL, internalToken), presence.NewRedis(rdb, apiURL, internalToken, log), log)
	if rdb != nil {
		go server.SubscribeRedis(ctx, rdb, "qubedu:rt", h, log)
	}
	go h.RunPresenceRefresher(ctx, 30*time.Second)

	srv := &http.Server{
		Addr:              addr,
		Handler:           server.New(h, auth.NewVerifier(secret), server.Config{AllowedOrigins: server.SplitOrigins(env("ALLOWED_ORIGINS", "*")), InternalToken: internalToken}, log).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Info("realtime listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	shutdown, done := context.WithTimeout(context.Background(), 10*time.Second)
	defer done()
	_ = srv.Shutdown(shutdown)
	if rdb != nil {
		_ = rdb.Close()
	}
}
