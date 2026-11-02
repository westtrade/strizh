#!/usr/bin/env python3
"""Создаёт юнит мультипакетного репозитория: приложение в apps/ или пакет в packages/.

Юнит — это каталог со своим манифестом, README и tsconfig. Блока scripts в манифесте
нет: команды живут в корневых scripts/ и зовутся через make (раздел 1 скилла).

Примеры:
  ./scripts/monorepo-new.py app admin-panel --scope @omd
  ./scripts/monorepo-new.py package shared-auth --scope @omd
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
KINDS = {"app": "apps", "package": "packages"}


def die(message: str) -> int:
    print(f"FAIL  {message}", file=sys.stderr)
    return 1


def package_json(name: str, kind: str, scope: str | None) -> dict:
    full = f"{scope}/{name}" if scope else name
    data: dict = {"name": full, "version": "0.1.0", "private": True, "type": "module"}
    if kind == "package":
        data["main"] = "./src/index.ts"
        data["types"] = "./src/index.ts"
        data["exports"] = {".": {"types": "./src/index.ts", "default": "./src/index.ts"}}
    return data


def tsconfig(root: Path, kind: str) -> str | None:
    """Конфиг юнита тянет общие опции из корня; без корневого конфига не создаётся."""
    base = None
    for candidate in ("tsconfig.base.json", "tsconfig.json"):
        if (root / candidate).is_file():
            base = candidate
            break
    if base is None:
        return None
    options = {"composite": kind == "package", "moduleResolution": "bundler"}
    if kind == "app":
        options = {"composite": False, "moduleResolution": "bundler", "noEmit": True}
    body = json.dumps({"extends": f"../../{base}", "compilerOptions": options}, ensure_ascii=False, indent=2)
    return body + "\n"


def entry(kind: str, name: str) -> str:
    if kind == "app":
        return f'#!/usr/bin/env bun\n// Точка входа приложения {name}.\nconsole.log("{name}: запуск");\n'
    return f'// Публичный API пакета {name}. Экспортируй отсюда и только отсюда.\nexport const NAME = "{name}";\n'


def readme(kind: str, name: str, scope: str | None) -> str:
    full = f"{scope}/{name}" if scope else name
    run = "make dev" if kind == "app" else "импортируется как библиотека; своих команд не имеет"
    return (
        f"# {full}\n\n"
        f"{'Приложение' if kind == 'app' else 'Пакет'} в составе монорепозитория.\n\n"
        f"- Запуск: {run} (из корня репозитория)\n"
        f"- Каталог: `{KINDS[kind]}/{name}/`\n"
        f"- Точка входа: `src/index.ts`\n"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Создать приложение (apps/) или пакет (packages/).")
    parser.add_argument("kind", choices=sorted(KINDS))
    parser.add_argument("name", help="kebab-case имя каталога")
    parser.add_argument("--scope", default=None, help="npm-scope репозитория, например @omd")
    parser.add_argument("--root", default=None, help="корень репозитория")
    parser.add_argument("--force", action="store_true", help="писать в существующий непустой каталог")
    args = parser.parse_args(argv)

    if not NAME_RE.match(args.name):
        return die(f"имя '{args.name}' не kebab-case: строчные латинские буквы, цифры и дефис")
    scope = args.scope
    if scope and not re.match(r"^@[a-z0-9][a-z0-9-]*$", scope):
        return die(f"scope '{scope}' должен выглядеть как @omd")

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        return die(f"корень не найден: {root}")
    if not (root / "Makefile").is_file():
        return die(f"в {root} нет Makefile — сначала раздел 1 скилла (единая точка запуска)")

    kind_dir = root / KINDS[args.kind]
    target = kind_dir / args.name
    if target.exists() and any(target.iterdir()) and not args.force:
        return die(f"{target} уже существует и не пуст (--force, если это осознанно)")

    kind_dir.mkdir(exist_ok=True)
    (target / "src").mkdir(parents=True, exist_ok=True)

    files = {
        target / "package.json": json.dumps(package_json(args.name, args.kind, scope), ensure_ascii=False, indent=2)
        + "\n",
        target / "README.md": readme(args.kind, args.name, scope),
        target / "src" / "index.ts": entry(args.kind, args.name),
    }
    config = tsconfig(root, args.kind)
    if config is not None:
        files[target / "tsconfig.json"] = config

    for path, content in files.items():
        path.write_text(content, encoding="utf-8")
        print(f"создан  {path.relative_to(root)}")

    entry_path = target / "src" / "index.ts"
    if args.kind == "app":
        entry_path.chmod(0o755)

    full = f"{scope}/{args.name}" if scope else args.name
    print()
    print("Дальше:")
    glob = f"{KINDS[args.kind]}/*"
    print(f'  1. Глоб "{glob}" уже покрывает каталог — правка корневого манифеста не нужна.')
    print("  2. Добавь в Makefile цель и скрипт — у юнита своего блока scripts нет:")
    if args.kind == "app":
        print(f"       dev-{args.name}: ## {full}: локальная разработка")
        print(f"           ./scripts/dev-{args.name} $(ARGS)")
        print(f"     scripts/dev-{args.name}: shebang, set -euo pipefail, cd в корень,")
        print(f"       exec bun --watch apps/{args.name}/src/index.ts")
    else:
        print(f"     пакет — библиотека, своих целей не заводит; подключай его из apps/:")
        print(f"       \"{full}\": \"workspace:*\"")
    print("  3. Проверь раскладку: make monorepo-check")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
