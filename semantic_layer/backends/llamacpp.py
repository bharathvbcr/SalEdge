"""llama.cpp server inference backend adapter."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from semantic_layer.backends.base import BaseInferenceBackend

logger = logging.getLogger(__name__)


class LlamaCppBackend(BaseInferenceBackend):
    """Adapter for llama.cpp HTTP server (native /completion or OpenAI-compatible API)."""

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        timeout: float = 120.0,
        use_openai_compat: bool = False,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.use_openai_compat = use_openai_compat
        self._client = httpx.Client(timeout=timeout)

    def generate(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.5,
        stream: bool = False,
    ) -> str:
        del stream
        if self.use_openai_compat:
            return self._generate_openai(model, prompt, max_tokens, temperature)
        return self._generate_native(prompt, max_tokens, temperature)

    def _generate_native(self, prompt: str, max_tokens: int, temperature: float) -> str:
        payload: dict[str, Any] = {
            "prompt": prompt,
            "n_predict": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        resp = self._client.post(f"{self.base_url}/completion", json=payload)
        resp.raise_for_status()
        data = resp.json()
        if "content" in data:
            return data["content"]
        return data.get("choices", [{}])[0].get("text", "")

    def _generate_openai(
        self,
        model: str,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        resp = self._client.post(f"{self.base_url}/v1/completions", json=payload)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("text", "")

    def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1024,
        temperature: float = 0.5,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        resp = self._client.post(f"{self.base_url}/v1/chat/completions", json=payload)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            return ""
        message = choices[0].get("message", {})
        return message.get("content", "")

    def health_check(self) -> bool:
        try:
            resp = self._client.get(f"{self.base_url}/health")
            if resp.status_code == 200:
                return True
            resp = self._client.get(f"{self.base_url}/")
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    def close(self) -> None:
        self._client.close()
