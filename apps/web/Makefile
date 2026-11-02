# Раннер юнита apps/web: SvelteKit собирается только после `svelte-kit sync`,
# поэтому корневому фолбэку эта пара шагов недоступна.
SHELL := /bin/bash
.DEFAULT_GOAL := help
ARGS ?=

.PHONY: help dev build check test

help: ## Цели юнита apps/web
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## Vite dev-сервер (http://localhost:5173)
	./scripts/dev $(ARGS)

build: ## Статическая сборка в build/
	./scripts/build $(ARGS)

check: ## svelte-check + типы
	./scripts/check $(ARGS)

test: ## Тесты утилит
	./scripts/test $(ARGS)
