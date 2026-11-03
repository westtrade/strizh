#!/usr/bin/env bash
# Подготовка pkg-config для сборки Tauri. Не запускается напрямую, подключается:
#   . "$(dirname "$0")/_pkgconfig.sh"
#
# Зачем это нужно. Рантайм-библиотеки GTK-стека в системе могут быть
# установлены (libwebkit2gtk-4.1-0, libgtk-3-0), а dev-пакетов с файлами
# `.pc`, заголовками и симлинками `libfoo.so` — нет. Rust-крейтам нужен только
# линкер, а не заголовки, поэтому сборка проходит и без dev-пакетов, если
# подставить `.pc`-описания самому.
#
# Функция desktop_ensure_pkgconfig:
#   1. если все нужные модули видны pkg-config — ничего не делает;
#   2. иначе пробует собрать шимы в кэш-каталог (только при наличии .so.0);
#   3. иначе печатает точную команду установки dev-пакетов и выходит с ошибкой.

DESKTOP_PC_MODULES=(webkit2gtk-4.1 javascriptcoregtk-4.1 libsoup-3.0 dbus-1 gtk+-3.0)

# Таблица шимов: "имя-в-pkg-config | basename библиотеки | версия | Requires".
# Третья колонка нужна только для проверки версии в .pc-требованиях крейтов.
DESKTOP_PC_TABLE=(
	"glib-2.0|glib-2.0|2.82.0|"
	"gobject-2.0|gobject-2.0|2.82.0|glib-2.0"
	"gio-2.0|gio-2.0|2.82.0|glib-2.0 gobject-2.0"
	"gmodule-2.0|gmodule-2.0|2.82.0|glib-2.0"
	"gthread-2.0|gthread-2.0|2.82.0|glib-2.0"
	"atk-1.0|atk-1.0|2.56.0|glib-2.0 gobject-2.0"
	"gdk_pixbuf-2.0|gdk_pixbuf-2.0|2.44.0|glib-2.0 gobject-2.0 gio-2.0"
	"cairo|cairo|1.18.0|"
	"cairo-gobject|cairo-gobject|1.18.0|cairo"
	"pango-1.0|pango-1.0|1.56.0|glib-2.0 gobject-2.0"
	"pangocairo-1.0|pangocairo-1.0|1.56.0|pango-1.0 cairo"
	"pangoft2-1.0|pangoft2-1.0|1.56.0|pango-1.0"
	"harfbuzz|harfbuzz|10.1.0|"
	"freetype2|freetype|2.13.3|"
	"fontconfig|fontconfig|2.15.0|"
	"pixman-1|pixman-1|0.46.4|"
	"xkbcommon|xkbcommon|1.13.1|"
	"wayland-client|wayland-client|1.24.0|"
	"epoxy|epoxy|1.5.10|"
	"dbus-1|dbus-1|1.16.2|"
	"libsoup-3.0|soup-3.0|3.6.6|glib-2.0 gobject-2.0 gio-2.0"
	"javascriptcoregtk-4.1|javascriptcoregtk-4.1|2.52.6|glib-2.0 gobject-2.0"
	"gtk+-3.0|gtk-3|3.24.52|glib-2.0 gobject-2.0 gio-2.0 atk-1.0 cairo cairo-gobject pango-1.0 pangocairo-1.0 gdk_pixbuf-2.0"
	"gdk-3.0|gdk-3|3.24.52|gtk+-3.0"
	"gdk-x11-3.0|gdk-3|3.24.52|gdk-3.0"
	"webkit2gtk-4.1|webkit2gtk-4.1|2.52.6|glib-2.0 gobject-2.0 gio-2.0 libsoup-3.0 javascriptcoregtk-4.1 gtk+-3.0"
	"x11|X11|1.8.11|"
	"xcb|xcb|1.17.0|"
	"zlib|z|1.3.1|"
)

# Крейты `*-sys` спрашивают пакеты под другими именами, чем gtk-шные .pc:
# `atk-sys` хочет «atk», `pango-sys` — «pango». Делаем псевдонимы.
DESKTOP_PC_ALIASES=(
	"atk-1.0:atk"
	"pango-1.0:pango"
	"glib-2.0:glib"
	"gobject-2.0:gobject"
	"gio-2.0:gio"
	"gtk+-3.0:gtk"
	"gdk-3.0:gdk"
	"gdk_pixbuf-2.0:gdk-pixbuf-2.0"
)

_desktop_lib_dir() {
	local dir
	for dir in /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /usr/lib/aarch64-linux-gnu; do
		[ -d "$dir" ] && {
			printf '%s' "$dir"
			return 0
		}
	done
	return 1
}

_desktop_pc_cache_dir() {
	printf '%s' "${XDG_CACHE_HOME:-$HOME/.cache}/strizh/pkgconfig"
}

_desktop_has_module() {
	pkg-config --exists "$1" 2>/dev/null
}

# Ищет реальный файл библиотеки: сначала `libfoo.so`, затем версионированный.
_desktop_find_lib() {
	local libdir=$1 base=$2 candidate
	for candidate in "$libdir/lib$base.so" "$libdir/lib$base.so.0"; do
		[ -e "$candidate" ] && {
			printf '%s' "$candidate"
			return 0
		}
	done
	candidate=$(find "$libdir" -maxdepth 1 -name "lib$base.so.*" -type f 2>/dev/null | sort -V | tail -1)
	[ -n "$candidate" ] && {
		printf '%s' "$candidate"
		return 0
	}
	return 1
}

_desktop_write_shims() {
	local libdir pc_dir entry name base version requires real
	libdir=$(_desktop_lib_dir) || return 1
	pc_dir=$(_desktop_pc_cache_dir)
	mkdir -p "$pc_dir" || return 1

	for entry in "${DESKTOP_PC_TABLE[@]}"; do
		IFS='|' read -r name base version requires <<<"$entry"
		real=$(_desktop_find_lib "$libdir" "$base") || continue
		# pkg-config ищет `lib<name>.so` для `-l<name>`: симлинк рядом с .pc
		# избавляет от dev-пакета с его собственными симлинками.
		ln -sf "$real" "$pc_dir/lib$base.so" 2>/dev/null || true
		{
			printf 'Name: %s\n' "$name"
			printf 'Description: %s (линкерный шим без dev-пакета)\n' "$name"
			printf 'Version: %s\n' "$version"
			[ -n "$requires" ] && printf 'Requires: %s\n' "$requires"
			printf 'Libs: -L%s -L%s -l%s\n' "$pc_dir" "$libdir" "$base"
			printf 'Cflags:\n'
		} >"$pc_dir/$name.pc"
	done

	for entry in "${DESKTOP_PC_ALIASES[@]}"; do
		cp "$pc_dir/${entry%%:*}.pc" "$pc_dir/${entry##*:}.pc" 2>/dev/null || true
	done

	# soup3-sys берёт имя из `links = "libsoup-3.0"` и просит -llibsoup-3.0.
	ln -sf "$libdir/libsoup-3.0.so.0" "$pc_dir/liblibsoup-3.0.so" 2>/dev/null || true

	printf '%s' "$pc_dir"
}

# Готовит окружение pkg-config. Печатает предупреждение, если пришлось
# подставлять шимы вместо dev-пакетов.
desktop_ensure_pkgconfig() {
	local missing=() module pc_dir
	for module in "${DESKTOP_PC_MODULES[@]}"; do
		_desktop_has_module "$module" || missing+=("$module")
	done
	if [ ${#missing[@]} -eq 0 ]; then
		return 0
	fi

	pc_dir=$(_desktop_write_shims) || pc_dir=""
	if [ -n "$pc_dir" ]; then
		export PKG_CONFIG_PATH="$pc_dir${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
		# Проверяем, что шимы действительно закрыли все модули.
		local still=()
		for module in "${DESKTOP_PC_MODULES[@]}"; do
			_desktop_has_module "$module" || still+=("$module")
		done
		if [ ${#still[@]} -eq 0 ]; then
			printf 'WARN  dev-пакеты не найдены (%s)\n' "${missing[*]}" >&2
			printf 'WARN  линкую против установленных библиотек через шимы в %s\n' "$pc_dir" >&2
			printf 'WARN  для чистой сборки поставьте dev-пакеты (см. apps/desktop/README.md)\n' >&2
			return 0
		fi
		printf 'не хватает модулей даже с шимами: %s\n' "${still[*]}" >&2
	else
		printf 'не хватает модулей pkg-config: %s\n' "${missing[*]}" >&2
	fi

	cat >&2 <<'EOF'
поставьте dev-пакеты:
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
                   libdbus-1-dev librsvg2-dev build-essential
EOF
	return 1
}
