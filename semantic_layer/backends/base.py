"""Abstract inference backend interface."""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseInferenceBackend(ABC):
    """Common interface for local LLM inference backends."""

    @abstractmethod
    def generate(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.5,
        stream: bool = False,
    ) -> str:
        """Run completion-style inference and return generated text."""

    @abstractmethod
    def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1024,
        temperature: float = 0.5,
    ) -> str:
        """Run chat-style inference and return assistant message content."""

    @abstractmethod
    def health_check(self) -> bool:
        """Return True when the backend is reachable and ready."""

    def close(self) -> None:
        """Release backend resources."""
