.PHONY: help dev test process-data up down logs

help:
	@echo "Available commands:"
	@echo "  make up            - Start all services (frontend + nginx, port 8081)"
	@echo "  make dev           - Alias for 'make up'"
	@echo "  make down          - Stop all services"
	@echo "  make test          - Run tests (Docker)"
	@echo "  make logs          - Show logs from all services"
	@echo "  make process-data  - Process IWC dataset (requires uv)"

up:
	docker-compose up

dev: up

down:
	docker-compose down

logs:
	docker-compose logs -f

test:
	docker-compose run --rm test

process-data:
	uv run python data/process_data.py
