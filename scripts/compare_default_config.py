#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Tuple

CONFIG_FILE = "default-config.json"


def run_git_command(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def load_json_from_text(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {CONFIG_FILE}: {exc}") from exc


def flatten_json(value: Any, prefix: str = "") -> Dict[str, Any]:
    flat: Dict[str, Any] = {}

    if isinstance(value, dict):
        for key, nested_value in value.items():
            key_path = f"{prefix}.{key}" if prefix else key
            if isinstance(nested_value, (dict, list)):
                flat.update(flatten_json(nested_value, key_path))
            else:
                flat[key_path] = nested_value
    elif isinstance(value, list):
        flat[prefix] = value
    else:
        flat[prefix] = value

    return flat


def normalize_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    return value


def get_previous_ref() -> str | None:
    explicit_ref = os.getenv("PREVIOUS_RELEASE_REF")
    if explicit_ref:
        return explicit_ref

    tag_candidates = [
        ["describe", "--tags", "--abbrev=0", "HEAD^"],
        ["describe", "--tags", "--abbrev=0", "HEAD~1"],
    ]
    for cmd in tag_candidates:
        result = run_git_command(*cmd)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    candidates = ["HEAD~1", "HEAD^", "origin/main", "main", "master"]
    for ref in candidates:
        result = run_git_command("rev-parse", "--verify", ref)
        if result.returncode == 0:
            return ref
    return None


def load_previous_json() -> Any | None:
    previous_ref = get_previous_ref()
    if previous_ref is None:
        return None

    result = run_git_command("show", f"{previous_ref}:{CONFIG_FILE}")
    if result.returncode != 0:
        return None

    try:
        return load_json_from_text(result.stdout)
    except ValueError:
        return None


def print_section(title: str, entries: List[str]) -> None:
    print(f"\n{title}")
    if not entries:
        print("- None")
        return

    for item in entries:
        print(f"- {item}")


def compare_json(old_data: Any, new_data: Any) -> Tuple[List[str], List[str], List[str]]:
    old_flat = flatten_json(old_data)
    new_flat = flatten_json(new_data)

    added = sorted(key for key in new_flat if key not in old_flat)
    removed = sorted(key for key in old_flat if key not in new_flat)
    changed = []

    for key in sorted(set(old_flat) & set(new_flat)):
        if normalize_value(old_flat[key]) != normalize_value(new_flat[key]):
            changed.append(f"{key}: {old_flat[key]!r} -> {new_flat[key]!r}")

    return added, removed, changed


def main() -> int:
    current_path = Path = os.path.join(os.getcwd(), CONFIG_FILE)
    if not os.path.exists(current_path):
        print(f"ERROR: {CONFIG_FILE} not found in {os.getcwd()}")
        return 1

    with open(current_path, "r", encoding="utf-8") as file:
        current_data = load_json_from_text(file.read())

    previous_data = load_previous_json()

    if previous_data is None:
        print(f"No previous {CONFIG_FILE} found to compare against.")
        print("This is likely the first commit or the previous file does not exist in the current checkout.")
        return 0

    added, removed, changed = compare_json(previous_data, current_data)

    print(f"Comparing {CONFIG_FILE} against previous revision...")
    print_section("Added keys", added)
    print_section("Removed keys", removed)
    print_section("Changed values", changed)

    if added or removed or changed:
        print("\nCONFIG CHANGED: values or keys differ from the previous release.")
        return 1

    print("\nNo differences detected between current config and previous release.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
