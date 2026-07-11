"""Discover installed Ollama models and pick tier defaults."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from typing import Any


def _parse_size_billions(name: str) -> float:
    lower = name.lower()
    match = re.search(r"(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*b(?:\b|$|:)", lower)
    if match:
        return float(match.group(1))
    if re.search(r"\bmini\b|\btiny\b|\bsmall\b|\b1b\b|\b2b\b", lower):
        return 2.0
    if re.search(r"\bmedium\b|\bmid\b|\b7b\b|\b8b\b", lower):
        return 7.0
    if re.search(r"\blarge\b|\bxl\b|\b70b\b|\b35b\b|\b34b\b", lower):
        return 35.0
    return 7.0


def _is_completion_capable(name: str, capabilities: list[str] | None = None) -> bool:
    if capabilities:
        return "completion" in capabilities or "vision" in capabilities
    lower = name.lower()
    return not re.search(r"\bembed(?:ding)?\b|minilm|nomic-embed|bge-|e5-|mxbai-embed", lower)


def fetch_ollama_model_names(base_url: str, timeout: float = 8.0) -> list[str]:
    url = f"{base_url.rstrip('/')}/api/tags"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload: dict[str, Any] = __import__("json").load(resp)
    models = payload.get("models") or []
    names: list[str] = []
    for m in models:
        name = str(m.get("name", "")).strip()
        if not name:
            continue
        caps = m.get("capabilities")
        cap_list = [str(c) for c in caps] if isinstance(caps, list) else None
        if _is_completion_capable(name, cap_list):
            names.append(name)
    return names


def select_tier_models(available: list[str]) -> tuple[str, str, str]:
    if not available:
        raise ValueError("No Ollama models installed.")

    sorted_models = sorted(available, key=_parse_size_billions)
    if len(sorted_models) == 1:
        only = sorted_models[0]
        return only, only, only
    if len(sorted_models) == 2:
        return sorted_models[0], sorted_models[1], sorted_models[1]
    mid = len(sorted_models) // 2
    return sorted_models[0], sorted_models[mid], sorted_models[-1]


def discover_tier_models(base_url: str) -> tuple[str, str, str]:
    try:
        names = fetch_ollama_model_names(base_url)
        return select_tier_models(names)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"Ollama model discovery failed at {base_url}: {exc}") from exc
