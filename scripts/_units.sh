#!/usr/bin/env bash
# Библиотека выбора юнитов для scripts/. Не запускается напрямую, подключается:
#   . "$(dirname "$0")/_units.sh"
#
# Юнит — каталог первого уровня в apps/ или packages/ со своим манифестом.

UNITS_KINDS="apps packages"

# Имя пакета из манифеста юнита (пусто, если манифеста нет).
_units_name() {
  local dir=$1
  [ -f "$dir/package.json" ] || return 0
  sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$dir/package.json" | head -1
}

# Все юниты обоих каталогов.
_units_all() {
  local kind dir
  for kind in $UNITS_KINDS; do
    [ -d "$kind" ] || continue
    for dir in "$kind"/*/; do
      dir=${dir%/}
      [ -f "$dir/package.json" ] || continue
      echo "$dir"
    done
  done
}

# Только приложения — цель по умолчанию для dev/build/preview.
_units_apps() {
  local dir
  [ -d apps ] || return 0
  for dir in apps/*/; do
    dir=${dir%/}
    [ -f "$dir/package.json" ] || continue
    echo "$dir"
  done
}

# units_resolve [селекторы...] — печатает каталоги выбранных юнитов.
#   (без аргументов) — все приложения
#   --all            — все юниты, включая packages/
#   <селектор>       — каталог, basename каталога или имя пакета: orbs / @tao/orbs / apps/orbs
# --all несовместим с перечислением имён: смешение скрывает опечатку.
units_resolve() {
  local -a want=()
  local arg dir base name all=0

  for arg in "$@"; do
    case "$arg" in
      --all) all=1 ;;
      -*) printf 'неизвестный флаг: %s\n' "$arg" >&2; return 2 ;;
      *) want+=("$arg") ;;
    esac
  done

  if [ "$all" -eq 1 ] && [ ${#want[@]} -gt 0 ]; then
    printf -- '--all несовместим с перечислением юнитов\n' >&2
    return 2
  fi
  if [ "$all" -eq 1 ]; then _units_all; return 0; fi
  if [ ${#want[@]} -eq 0 ]; then _units_apps; return 0; fi

  for arg in "${want[@]}"; do
    local hit=0
    while IFS= read -r dir; do
      base=${dir##*/}
      name=$(_units_name "$dir")
      if [ "$arg" = "$dir" ] || [ "$arg" = "$base" ] || { [ -n "$name" ] && [ "$arg" = "$name" ]; }; then
        printf '%s\n' "$dir"
        hit=1
      fi
    done < <(_units_all)
    if [ "$hit" -eq 0 ]; then
      printf 'юнит не найден: %s\n' "$arg" >&2
      return 1
    fi
  done
}

# units_run <команда> [селекторы...] — прогоняет команду по выбранным юнитам.
# Порядок: цель в Makefile юнита -> фолбэк unit_<команда>_fallback из вызывающего скрипта.
units_run() {
  local cmd=$1; shift
  local resolved dir rc=0

  resolved=$(units_resolve "$@") || return $?
  if [ -z "$resolved" ]; then
    printf 'юниты не выбраны: нет каталогов в apps/ или packages/\n' >&2
    return 2
  fi

  while IFS= read -r dir; do
    if [ -f "$dir/Makefile" ] && grep -qE "^${cmd}:" "$dir/Makefile"; then
      printf '==> %s: make %s\n' "$dir" "$cmd" >&2
      # ARGS сбрасывается: селектор диспетчера относится к корню и не должен
      # протечь в Makefile юнита как его собственный аргумент.
      make -C "$dir" "$cmd" ARGS= || rc=$?
    elif declare -F "unit_${cmd}_fallback" >/dev/null; then
      printf '==> %s: %s (корневая реализация)\n' "$dir" "$cmd" >&2
      "unit_${cmd}_fallback" "$dir" || rc=$?
    else
      printf '==> %s: пропуск, нет цели %s и нет фолбэка\n' "$dir" "$cmd" >&2
    fi
  done <<< "$resolved"

  return "$rc"
}
