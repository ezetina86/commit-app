# Makefile for Commit Habit Tracker

# Tool Detection
CONTAINER_CMD := $(shell command -v podman 2> /dev/null || command -v docker 2> /dev/null || echo docker)
COMPOSE_CMD := $(shell command -v podman-compose 2> /dev/null || command -v docker-compose 2> /dev/null || echo "docker compose")

.PHONY: build clean prune test test-frontend test-backend test-all lint lint-backend lint-frontend help

# Default target
help:
	@echo "Commit Habit Tracker Management Commands (using $(CONTAINER_CMD) and $(COMPOSE_CMD)):"
	@echo "  make build          Clean, prune, and build container images"
	@echo "  make clean          Stop and remove containers"
	@echo "  make prune          Remove unused container data (volumes, networks, images)"
	@echo "  make test-frontend  Run frontend tests with coverage"
	@echo "  make test-backend   Run backend tests with coverage"
	@echo "  make test-all       Run both frontend and backend tests"
	@echo "  make lint           Run gofmt + go vet (backend) and ESLint (frontend)"

# --- Build and Cleanup ---

build: clean prune
	$(COMPOSE_CMD) up --build -d

clean:
	$(COMPOSE_CMD) down --remove-orphans

prune:
	$(CONTAINER_CMD) system prune -f
	$(CONTAINER_CMD) volume prune -f

# --- Testing ---

test-frontend:
	cd web && npm run coverage

test-backend:
	cd api && go test -cover ./...

test-all: test-backend test-frontend

# --- Linting ---

lint: lint-backend lint-frontend

lint-backend:
	@UNFORMATTED=$$(cd api && gofmt -l .); \
	if [ -n "$$UNFORMATTED" ]; then \
		echo "gofmt: the following files need formatting:"; \
		echo "$$UNFORMATTED"; \
		exit 1; \
	fi
	cd api && go vet ./...

lint-frontend:
	cd web && npm run lint
