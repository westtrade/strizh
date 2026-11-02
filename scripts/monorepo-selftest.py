#!/usr/bin/env python3
"""Самотест monorepo-check.py: собирает фикстуры и сверяет вердикт.

Запускается без аргументов из любого каталога. Каждый кейс — отдельный
временный репозиторий; проверяется, что ожидаемые FAIL/WARN появились/нет.

    ./scripts/monorepo-check.py --self-test
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

CHECK = Path(__file__).resolve().parent / "monorepo-check.py"

BASE_PKG = {"name": "demo", "private": True, "workspaces": ["apps/*", "packages/*"]}
TYPE_LINE = "Тип репозитория: мультипакет (apps/ + packages/)"


def unit(root: Path, kind: str, name: str, *, pkg: dict | None = None, readme: bool = True) -> Path:
    d = root / kind / name
    (d / "src").mkdir(parents=True, exist_ok=True)
    data = pkg if pkg is not None else {"name": f"@demo/{name}", "private": True, "main": "./src/index.ts"}
    (d / "package.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    (d / "src" / "index.ts").write_text("", encoding="utf-8")
    if readme:
        (d / "README.md").write_text(f"# {name}\n", encoding="utf-8")
    return d


def make_repo(root: Path, *, readme: str | None = TYPE_LINE, workspaces: list[str] | None = None,
              kinds: tuple[str, ...] = ("apps", "packages")) -> None:
    (root / "tsconfig.base.json").write_text('{"compilerOptions":{}}', encoding="utf-8")
    pkg = dict(BASE_PKG, workspaces=workspaces if workspaces is not None else ["apps/*", "packages/*"])
    (root / "package.json").write_text(json.dumps(pkg, indent=2), encoding="utf-8")
    (root / "bun.lock").write_text("", encoding="utf-8")
    if readme is not None:
        (root / "README.md").write_text(f"# demo\n\n{readme}\n", encoding="utf-8")
    for kind in kinds:
        (root / kind).mkdir(exist_ok=True)


def run(root: Path, *args: str) -> tuple[int, str]:
    proc = subprocess.run([sys.executable, str(CHECK), "--root", str(root), *args],
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout + proc.stderr


CASES: list[tuple[str, callable, int, list[str], list[str]]] = []


def case(name: str, expect_rc: int, must: list[str], must_not: list[str] | None = None):
    def deco(fn):
        CASES.append((name, fn, expect_rc, must, must_not or []))
        return fn
    return deco


@case("чистый мультипакет", 0, ["тип объявлен", "соблюдена"], ["FAIL  "])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "apps", "web")
    unit(root, "packages", "lib")


@case("нет строки типа в README", 1, ["не объявлен тип репозитория"], [])
def _(root: Path) -> None:
    make_repo(root, readme=None)
    unit(root, "apps", "web")


@case("монолит в README, но есть apps/", 1, ["объявлен монолит, но есть apps/"], [])
def _(root: Path) -> None:
    make_repo(root, readme="Тип репозитория: монолит")
    unit(root, "apps", "web")


@case("лишний каталог в workspaces", 1, ["лишние каталоги юнитов"], [])
def _(root: Path) -> None:
    make_repo(root, workspaces=["apps/*", "packages/*", "dino-land/*"])
    unit(root, "apps", "web")


@case("юнит без манифеста", 1, ["нет манифеста"], [])
def _(root: Path) -> None:
    make_repo(root)
    (root / "apps" / "ghost").mkdir(parents=True)


@case("семвер вместо workspace:*", 1, ["нужен workspace:*"], [])
def _(root: Path) -> None:
    make_repo(root, kinds=("apps", "packages"))
    unit(root, "apps", "web", pkg={"name": "@demo/web", "private": True,
                                   "dependencies": {"@demo/lib": "^1.0.0"}})
    unit(root, "packages", "lib")


@case("пакет зависит от приложения", 1, ["пакет зависит от приложения"], [])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "apps", "web")
    unit(root, "packages", "lib", pkg={"name": "@demo/lib", "private": True,
                                       "dependencies": {"@demo/web": "workspace:*"}})


@case("цикл зависимостей", 1, ["цикл зависимостей"], [])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "packages", "a", pkg={"name": "@demo/a", "private": True,
                                     "dependencies": {"@demo/b": "workspace:*"}})
    unit(root, "packages", "b", pkg={"name": "@demo/b", "private": True,
                                     "dependencies": {"@demo/a": "workspace:*"}})


@case("мёртвый приватный пакет", 0, ["никем не потребляется"], [])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "apps", "web")
    unit(root, "packages", "orphan")


@case("публикуемый пакет без потребителя — молчим", 0, [], ["никем не потребляется"])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "apps", "web")
    unit(root, "packages", "pub", pkg={"name": "@demo/pub", "private": False,
                                       "main": "./src/index.ts"})


@case("дрейф имени пакета и каталога", 0, ["не совпадает с каталогом"], [])
def _(root: Path) -> None:
    make_repo(root)
    unit(root, "apps", "squish", pkg={"name": "@demo/squish-volley", "private": True})


@case("юнит с Makefile и scripts по контракту", 0, ["свой Makefile + scripts/"], [])
def _(root: Path) -> None:
    make_repo(root)
    d = unit(root, "apps", "web")
    (d / "scripts").mkdir()
    script = d / "scripts" / "dev"
    script.write_text("#!/usr/bin/env bash\ntrue\n", encoding="utf-8")
    script.chmod(0o755)
    (d / "Makefile").write_text("SHELL := /bin/bash\n.PHONY: dev\ndev:\n\t./scripts/dev\n", encoding="utf-8")


@case("scripts в юните без Makefile", 0, ["есть scripts/, но нет Makefile"], [])
def _(root: Path) -> None:
    make_repo(root)
    d = unit(root, "apps", "web")
    (d / "scripts").mkdir()
    s = d / "scripts" / "dev"
    s.write_text("#!/usr/bin/env bash\ntrue\n", encoding="utf-8")
    s.chmod(0o755)


@case("скрипт юнита без цели в Makefile", 1, ["нет цели 'dev:'"], [])
def _(root: Path) -> None:
    make_repo(root)
    d = unit(root, "apps", "web")
    (d / "scripts").mkdir()
    s = d / "scripts" / "dev"
    s.write_text("#!/usr/bin/env bash\ntrue\n", encoding="utf-8")
    s.chmod(0o755)
    (d / "Makefile").write_text("SHELL := /bin/bash\n.PHONY: other\nother:\n\t@true\n", encoding="utf-8")


def main() -> int:
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        for i, (name, build, expect_rc, must, must_not) in enumerate(CASES):
            root = Path(tmp) / f"case{i}"
            root.mkdir()
            build(root)
            rc, out = run(root)
            problems = []
            if rc != expect_rc:
                problems.append(f"код возврата {rc}, ожидался {expect_rc}")
            for needle in must:
                if needle not in out:
                    problems.append(f"нет в выводе: {needle!r}")
            for needle in must_not:
                if needle in out:
                    problems.append(f"лишнее в выводе: {needle!r}")
            if problems:
                failed += 1
                print(f"FAIL  {name}")
                for p in problems:
                    print(f"        {p}")
            else:
                print(f"ok    {name}")
    print()
    total = len(CASES)
    print(f"Кейсов: {total}, провалено: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
