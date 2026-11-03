# Единая точка запуска. Логика — в scripts/, здесь только диспетчеризация.
SHELL := /bin/bash
.DEFAULT_GOAL := help
ARGS ?=

.PHONY: version help check-runner monorepo-check monorepo-new monorepo-selftest install dev build bundle check test clean release

help: ## Список целей
	@echo "Использование: make <цель> [ARGS=\"...\"]"
	@echo
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

check-runner: ## Проверить контракт scripts/ + Makefile (корень и юниты)
	@./scripts/check-runner

monorepo-check: ## Проверить раскладку apps/ + packages/
	@./scripts/monorepo-check.py $(ARGS)

monorepo-new: ## Создать юнит: ARGS="app admin-panel --scope @strizh"
	./scripts/monorepo-new.py $(ARGS)

monorepo-selftest: ## Проверить сам проверяльщик на фикстурах
	@./scripts/monorepo-selftest.py $(ARGS)

install: ## Установить зависимости (одна установка, из корня)
	./scripts/install $(ARGS)

# --- мультипакет: одна цель на команду, юнит выбирается через ARGS -----------
#
# make dev                    все приложения
# make dev ARGS="web"         одно приложение (каталог или имя пакета)
# make dev ARGS="@strizh/web" то же по имени пакета
# make dev ARGS="--all"       все юниты, включая packages/
#
# Юнит со своим Makefile сам решает, как выполнять команду; у кого своего
# Makefile нет — работает корневой фолбэк unit_<команда>_fallback из scripts/.

dev: ## Поднять локальную среду разработки
	./scripts/dev $(ARGS)

build: ## Собрать артефакты
	./scripts/build $(ARGS)

bundle: ## Собрать установщики (юнит desktop)
	./scripts/bundle $(ARGS)

check: ## Проверить типы и стиль
	./scripts/check $(ARGS)

test: ## Прогнать тесты
	./scripts/test $(ARGS)

clean: ## Удалить артефакты сборки
	./scripts/clean $(ARGS)

version: ## Показать версию проекта (ARGS="check" — сверить файлы)
	./scripts/version $(ARGS)

release: ## Выпустить релиз: ARGS="minor|patch|1.2.3 [--dry-run]"
	./scripts/release $(ARGS)
