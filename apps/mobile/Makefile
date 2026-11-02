# Раннер юнита apps/mobile: APK собирается gradlew-ом внутри android/,
# а перед этим обязателен sync бандла из apps/web.
SHELL := /bin/bash
.DEFAULT_GOAL := help
ARGS ?=

.PHONY: help dev build sync check

help: ## Цели юнита apps/mobile
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## Запуск на подключённом устройстве с livereload
	./scripts/dev $(ARGS)

build: ## Debug-APK (web build + sync + gradlew)
	./scripts/build $(ARGS)

sync: ## Только копирование бандла в android/
	./scripts/sync $(ARGS)

check: ## Конфиг Capacitor, платформа и свежесть бандла
	./scripts/check $(ARGS)
