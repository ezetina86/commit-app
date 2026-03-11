# Makefile for Commit Habit Tracker

.PHONY: build clean prune test test-frontend test-backend test-all help

# Default target
help:
	@echo "Commit Habit Tracker Management Commands:"
	@echo "  make build          Clean, prune, and build Docker images"
	@echo "  make clean          Stop and remove containers"
	@echo "  make prune          Remove unused Docker data (volumes, networks, images)"
	@echo "  make test-frontend  Run frontend tests with coverage"
	@echo "  make test-backend   Run backend tests with coverage"
	@echo "  make test-all       Run both frontend and backend tests"

# --- Build and Cleanup ---

build: clean prune
	docker-compose up --build -d

clean:
	docker-compose down --remove-orphans

prune:
	docker system prune -f
	docker volume prune -f

# --- Testing ---

test-frontend:
	cd web && npm run coverage

test-backend:
	cd api && go test -cover ./...

test-all: test-backend test-frontend
