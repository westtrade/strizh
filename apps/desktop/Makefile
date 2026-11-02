# Раннер юнита apps/desktop: Tauri запускается и собирается только из этого
# каталога, где лежит src-tauri/. Корню для этого нужен бы свой фолбэк на
# каждый платформенный случай — здесь он один.
SHELL := /bin/bash
.DEFAULT_GOAL := help
ARGS ?=

.PHONY: help dev build check bundle

help: ## Цели юнита apps/desktop
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## tauri dev: окно с горячей перезагрузкой фронтенда
	./scripts/dev $(ARGS)

build: ## Сборка приложения без установщиков
	./scripts/build $(ARGS)

bundle: ## Сборка установщиков (.deb, .AppImage, .dmg, .msi)
	./scripts/bundle $(ARGS)

check: ## Проверки, которым не нужен Rust-компилятор
	./scripts/check $(ARGS)
