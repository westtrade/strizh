#!/usr/bin/env python3
"""Проверяет раскладку мультипакетного репозитория: apps/ + packages/.

Структура: у корня ровно два каталога юнитов — apps/ (приложения) и packages/
(библиотеки и сервисы). У каждого юнита свой манифест, README и tsconfig.
Зависимости идут только вниз: apps -> packages -> packages. Один lockfile в корне.
Тип репозитория объявлен в README строкой «Тип репозитория: …».

Код возврата: 0 — FAIL нет, 1 — есть FAIL (или любой WARN при --strict).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

KIND_DIRS = ("apps", "packages")
MANIFESTS = ("package.json", "deno.json", "Cargo.toml", "pyproject.toml", "go.mod")
ROOT_MANIFESTS = ("package.json", "deno.json", "Cargo.toml")
LOCKS = ("bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock")
TS_ROOTS = ("tsconfig.base.json", "tsconfig.json")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
DEP_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

# «Тип репозитория: мультипакет (apps/ + packages/)» — единственный машинный след решения.
TYPE_RE = re.compile(r"^.*Тип репозитория\s*:\s*(.+)$", re.M)
MONOLITH = "монолит"
MULTI = "мультипакет"


class Report:
    def __init__(self) -> None:
        self.fails: list[str] = []
        self.warns: list[str] = []
        self.oks: list[str] = []

    def fail(self, msg: str) -> None:
        self.fails.append(msg)

    def warn(self, msg: str) -> None:
        self.warns.append(msg)

    def ok(self, msg: str) -> None:
        self.oks.append(msg)

    def dump(self, strict: bool) -> int:
        for msg in self.oks:
            print(f"OK    {msg}")
        for msg in self.warns:
            print(f"WARN  {msg}")
        for msg in self.fails:
            print(f"FAIL  {msg}")
        print()
        print(f"FAIL: {len(self.fails)}  WARN: {len(self.warns)}")
        broken = bool(self.fails) or (strict and bool(self.warns))
        if broken:
            print("Раскладка мультипакетного репозитория нарушена.", file=sys.stderr)
            return 1
        print("Раскладка мультипакетного репозитория соблюдена.")
        return 0


# --- манифесты --------------------------------------------------------------


def read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def workspace_globs(root: Path) -> list[str]:
    """Глобы workspace-ов из корневых манифестов (package.json, deno.json, Cargo.toml)."""
    globs: list[str] = []
    for name in ("package.json", "deno.json"):
        path = root / name
        if not path.is_file():
            continue
        workspaces = read_json(path).get("workspaces")
        if isinstance(workspaces, dict):
            workspaces = workspaces.get("packages")
        if isinstance(workspaces, list):
            globs += [g for g in workspaces if isinstance(g, str)]
    cargo = root / "Cargo.toml"
    if cargo.is_file():
        match = re.search(r"\[workspace\][^\[]*?members\s*=\s*\[(.*?)\]", read_text(cargo), re.S)
        if match:
            globs += re.findall(r'"([^"]+)"', match.group(1))
    return globs


def unit_manifest(unit_dir: Path) -> Path | None:
    for name in MANIFESTS:
        candidate = unit_dir / name
        if candidate.is_file():
            return candidate
    return None


def unit_name(unit_dir: Path, manifest: Path) -> str:
    """Имя юнита: из манифеста, иначе имя каталога."""
    if manifest.name in ("package.json", "deno.json"):
        name = read_json(manifest).get("name")
        if isinstance(name, str) and name:
            return name
    elif manifest.name in ("Cargo.toml", "pyproject.toml"):
        match = re.search(r'^name\s*=\s*"([^"]+)"', read_text(manifest), re.M)
        if match:
            return match.group(1)
    elif manifest.name == "go.mod":
        match = re.search(r"^module\s+(\S+)", read_text(manifest), re.M)
        if match:
            return match.group(1).rstrip("/").split("/")[-1]
    return unit_dir.name


def internal_deps(manifest: Path) -> dict[str, str]:
    """Зависимости пакета: имя -> спецификация версии."""
    if manifest.name != "package.json":
        return {}
    data = read_json(manifest)
    deps: dict[str, str] = {}
    for section in DEP_SECTIONS:
        block = data.get(section)
        if isinstance(block, dict):
            deps.update({k: str(v) for k, v in block.items()})
    return deps


# --- тип репозитория (P0) ---------------------------------------------------


def declared_type(root: Path) -> tuple[str | None, str]:
    """Объявленный тип репозитория и путь README, где он найден."""
    for name in ("README.md", "README", "readme.md"):
        path = root / name
        if not path.is_file():
            continue
        match = TYPE_RE.search(read_text(path))
        if not match:
            return None, name
        value = match.group(1).strip().lower()
        if MULTI in value:
            return MULTI, name
        if MONOLITH in value:
            return MONOLITH, name
        return "неизвестно: " + match.group(1).strip(), name
    return None, "README.md"


def check_type(root: Path, report: Report, has_kinds: bool) -> None:
    kind, where = declared_type(root)
    if kind is None:
        expected = "мультипакет (apps/ + packages/)" if has_kinds else "монолит"
        report.fail(f"{where}: не объявлен тип репозитория — добавь строку «Тип репозитория: {expected}»")
        return
    if kind == MULTI:
        if not has_kinds:
            report.fail(f"{where}: объявлен мультипакет, но нет apps/ и packages/")
        else:
            report.ok(f"тип объявлен в {where}: мультипакет")
    elif kind == MONOLITH:
        if has_kinds:
            present = " и ".join(k + "/" for k in KIND_DIRS if (root / k).is_dir())
            report.fail(
                f"{where}: объявлен монолит, но есть {present} — либо перенеси код и обнови README, "
                "либо убери каталоги юнитов"
            )
        else:
            report.ok(f"тип объявлен в {where}: монолит")
    else:
        report.fail(f"{where}: тип репозитория не распознан — ожидается «монолит» или «мультипакет»")


# --- структура --------------------------------------------------------------


def check_root(root: Path, report: Report) -> list[str]:
    kinds = [k for k in KIND_DIRS if (root / k).is_dir()]
    if not kinds:
        report.fail(
            "нет ни apps/, ни packages/ — это не мультипакетный репозиторий; "
            "для монолита раскладка описана в разделе 2.2 скилла"
        )
        return []
    report.ok(f"каталоги юнитов на месте: {', '.join(k + '/' for k in kinds)}")

    if not any((root / m).is_file() for m in ROOT_MANIFESTS):
        report.fail(f"нет корневого манифеста ({' | '.join(ROOT_MANIFESTS)})")
    else:
        report.ok("корневой манифест найден")

    globs = workspace_globs(root)
    if not globs:
        report.fail("корневой манифест не объявляет workspaces (ожидается apps/* и packages/*)")
    else:
        for kind in kinds:
            if not any(g.startswith(kind + "/") for g in globs):
                report.fail(f"workspaces не покрывают {kind}/ — добавь \"{kind}/*\" в манифест")
            else:
                report.ok(f"{kind}/* объявлен в workspaces")
        strays = [g for g in globs if not any(g.startswith(k + "/") for k in KIND_DIRS)]
        if strays:
            report.fail(
                f"в workspaces лишние каталоги юнитов: {', '.join(strays)} — "
                "юнит живёт только в apps/ или packages/"
            )
    return kinds


def collect_units(root: Path, kinds: list[str], report: Report) -> dict[str, tuple[str, Path, Path]]:
    """Юнит -> (kind, каталог, манифест)."""
    units: dict[str, tuple[str, Path, Path]] = {}
    for kind in kinds:
        for unit_dir in sorted(p for p in (root / kind).iterdir() if p.is_dir() and not p.is_symlink()):
            manifest = unit_manifest(unit_dir)
            if manifest is None:
                report.fail(f"{kind}/{unit_dir.name}: нет манифеста ({', '.join(MANIFESTS)}) — не юнит")
                continue
            name = unit_name(unit_dir, manifest)
            if name in units:
                report.fail(f"имя юнита дублируется: {name} ({units[name][1]} и {unit_dir})")
                continue
            units[name] = (kind, unit_dir, manifest)
    return units


def unit_scripts(scripts: Path) -> list[Path]:
    """Исполняемые файлы юнита: без префикса _ и без документации."""
    if not scripts.is_dir():
        return []
    return [
        p
        for p in sorted(scripts.iterdir())
        if p.is_file()
        and not p.name.startswith("_")
        and not p.name.lower().startswith(("readme", "license"))
    ]


def check_unit_runner(kind: str, unit_dir: Path, report: Report) -> None:
    """Юнит вправе иметь свой Makefile + scripts/ — но по правилам раздела 1."""
    label = f"{kind}/{unit_dir.name}"
    scripts = unit_dir / "scripts"
    makefile = unit_dir / "Makefile"
    files = unit_scripts(scripts)
    if not files:
        return
    if not makefile.is_file():
        report.warn(
            f"{label}: есть scripts/, но нет Makefile — свой набор команд юнита тоже "
            "запускается через make (раздел 1); пока это долг, а не блокер"
        )
        return
    text = read_text(makefile)
    for path in files:
        target = path.name.split(".")[0]
        if not path.stat().st_mode & 0o111:
            report.fail(f"{label}/scripts/{path.name}: нет бита исполнения (chmod +x)")
        if not read_text(path).startswith("#!"):
            report.fail(f"{label}/scripts/{path.name}: первая строка не shebang")
        if not re.search(rf"^{re.escape(target)}:", text, re.M):
            report.fail(f"{label}/scripts/{path.name}: нет цели '{target}:' в {label}/Makefile")
    report.ok(f"{label}: свой Makefile + scripts/ (shebang, +x и цели проверены)")


def check_units(root: Path, units: dict[str, tuple[str, Path, Path]], report: Report) -> None:
    has_ts_base = any((root / name).is_file() for name in TS_ROOTS)
    scoped: list[str] = []
    unscoped: list[str] = []

    for name, (kind, unit_dir, manifest) in sorted(units.items()):
        label = f"{kind}/{unit_dir.name}"
        if not NAME_RE.match(unit_dir.name):
            report.warn(f"{label}: имя каталога не kebab-case ({unit_dir.name})")
        if not (unit_dir / "README.md").is_file() and not (unit_dir / "README").is_file():
            report.warn(f"{label}: нет README.md")

        # P1: имя пакета и каталог разошлись — по каталогу ищут, по имени подключают.
        short = name.split("/")[-1]
        if name.startswith("@") and short != unit_dir.name:
            report.warn(
                f"{label}: имя пакета {name} не совпадает с каталогом "
                f"(ожидается @scope/{unit_dir.name}) — переименуй или объясни в README"
            )

        if manifest.name == "package.json":
            data = read_json(manifest)
            if data.get("scripts"):
                report.warn(
                    f"{label}: блок scripts в манифесте — точка входа одна, "
                    "перенеси команды в scripts/ + make (раздел 1)"
                )
            if kind == "apps" and data.get("private") is not True:
                report.warn(f"{label}: приложению стоит private: true — его не публикуют в реестр")
            if kind == "packages":
                if data.get("private") is not True and not name.startswith("@"):
                    report.warn(f"{label}: публикуемый пакет без scope ({name}) — дай имя @scope/{name}")
                if not isinstance(data.get("exports"), dict) and data.get("main") is None:
                    report.warn(f"{label}: нет exports/main — пакет нельзя импортировать по имени")

        if name.startswith("@"):
            scoped.append(name.split("/")[0] + "/")
        elif kind == "packages" and not read_json(manifest).get("private"):
            unscoped.append(label)

        if has_ts_base and manifest.name in ("package.json", "deno.json"):
            tsconfig = unit_dir / "tsconfig.json"
            if tsconfig.is_file():
                if '"extends"' not in read_text(tsconfig):
                    report.warn(f"{label}: tsconfig.json без extends — вынеси общие опции в корневой tsconfig.base.json")
            else:
                report.warn(f"{label}: нет tsconfig.json — юнит не участвует в проверке типов")

        check_unit_runner(kind, unit_dir, report)

    if len(set(scoped)) > 1:
        report.warn(f"несколько scope в одном репозитории: {', '.join(sorted(set(scoped)))} — оставь один")
    if unscoped:
        report.warn(f"юниты вне общего scope: {', '.join(unscoped)}")


# --- зависимости ------------------------------------------------------------


def check_deps(units: dict[str, tuple[str, Path, Path]], report: Report) -> None:
    graph: dict[str, set[str]] = {name: set() for name in units}
    consumers: dict[str, set[str]] = {name: set() for name in units}
    links: list[str] = []
    for name, (kind, unit_dir, manifest) in sorted(units.items()):
        label = f"{kind}/{unit_dir.name}"
        for dep, spec in sorted(internal_deps(manifest).items()):
            if dep == name:
                report.fail(f"{label}: зависит от самого себя")
                continue
            if dep not in units:
                continue
            dep_kind, dep_dir, _ = units[dep]
            graph[name].add(dep)
            consumers[dep].add(name)
            if not spec.startswith("workspace:"):
                report.fail(
                    f"{label}: внутренняя зависимость {dep} объявлена как '{spec}' — "
                    "нужен workspace:* (иначе поедет в реестр за чужой версией)"
                )
            if kind == "packages" and dep_kind == "apps":
                report.fail(f"{label}: пакет зависит от приложения {dep} — направление зависимостей только вниз")
            if kind == "apps" and dep_kind == "apps":
                report.warn(f"{label}: приложение зависит от приложения {dep} — общий код живёт в packages/")
            links.append(f"{label} -> {dep}")

    if links:
        report.ok(f"внутренних зависимостей: {len(links)}, все через workspace:*")
    for cycle in find_cycles(graph):
        report.fail(f"цикл зависимостей: {' -> '.join(cycle)}")

    # P1: пакет, который никто не потребляет, — либо мёртвый код, либо самостоятельный сервис.
    for name, (kind, unit_dir, manifest) in sorted(units.items()):
        if kind != "packages" or consumers[name]:
            continue
        if read_json(manifest).get("private") is not True:
            continue  # публикуемый пакет живёт для внешних потребителей
        report.warn(
            f"packages/{unit_dir.name}: пакет никем не потребляется — "
            "либо подключи его из apps/, либо удали, либо опиши в README как отдельный сервис"
        )


def find_cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    """Все простые циклы (каждый замыкается на минимальном узле, без повторов)."""
    cycles: list[list[str]] = []
    seen: set[frozenset[str]] = set()
    for start in sorted(graph):
        stack = [(start, [start])]
        while stack:
            node, path = stack.pop()
            for nxt in sorted(graph.get(node, ())):
                if nxt == start and len(path) > 1:
                    key = frozenset(path)
                    if key not in seen:
                        seen.add(key)
                        cycles.append(path + [start])
                elif nxt not in path and nxt > start:
                    stack.append((nxt, path + [nxt]))
    return cycles


def check_lockfiles(root: Path, kinds: list[str], report: Report) -> None:
    if not any((root / lock).is_file() for lock in LOCKS):
        report.warn("нет lockfile в корне — воспроизводимой установки нет")
    else:
        report.ok("lockfile один, в корне")
    for kind in kinds:
        for unit_dir in sorted(p for p in (root / kind).iterdir() if p.is_dir()):
            for lock in LOCKS:
                if (unit_dir / lock).is_file():
                    report.warn(
                        f"{kind}/{unit_dir.name}/{lock}: вложенный lockfile — установка должна быть одна, "
                        "в корне (исключение — приложение, которое деплоится отдельным репозиторием)"
                    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Проверить раскладку apps/ + packages/.")
    parser.add_argument("--root", default=None, help="корень репозитория (по умолчанию — на уровень выше scripts/)")
    parser.add_argument("--strict", action="store_true", help="любое WARN считать ошибкой")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"FAIL  корень не найден: {root}", file=sys.stderr)
        return 1

    report = Report()
    has_kinds = any((root / k).is_dir() for k in KIND_DIRS)
    check_type(root, report, has_kinds)
    kinds = check_root(root, report)
    if kinds:
        units = collect_units(root, kinds, report)
        check_units(root, units, report)
        check_deps(units, report)
        check_lockfiles(root, kinds, report)
        apps = sum(1 for kind, _, _ in units.values() if kind == "apps")
        print(f"Юнитов: {apps} приложений, {len(units) - apps} пакетов\n")

    return report.dump(args.strict)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
