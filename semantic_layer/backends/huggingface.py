"""Hugging Face Transformers inference backend adapter."""

from __future__ import annotations

import logging
import threading
from typing import Any

from semantic_layer.backends.base import BaseInferenceBackend

logger = logging.getLogger(__name__)


class HuggingFaceBackend(BaseInferenceBackend):
    """Local inference via Hugging Face transformers pipeline."""

    def __init__(
        self,
        model_id: str = "meta-llama/Llama-3.2-3B-Instruct",
        device: str = "auto",
        max_new_tokens: int = 1024,
        default_model: str | None = None,
    ) -> None:
        self.model_id = model_id
        self.device = device
        self.max_new_tokens = max_new_tokens
        self.default_model = default_model or model_id
        self._lock = threading.Lock()
        self._pipeline: Any = None

    def _ensure_loaded(self) -> None:
        if self._pipeline is not None:
            return
        with self._lock:
            if self._pipeline is not None:
                return
            from transformers import pipeline

            logger.info("Loading HuggingFace model %s on %s", self.model_id, self.device)
            self._pipeline = pipeline(
                "text-generation",
                model=self.model_id,
                device_map=self.device if self.device != "auto" else None,
                torch_dtype="auto",
            )

    def generate(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.5,
        stream: bool = False,
    ) -> str:
        del model, stream
        self._ensure_loaded()
        assert self._pipeline is not None

        outputs = self._pipeline(
            prompt,
            max_new_tokens=min(max_tokens, self.max_new_tokens),
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-5),
            return_full_text=False,
        )
        if not outputs:
            return ""
        generated = outputs[0].get("generated_text", "")
        return generated.strip()

    def health_check(self) -> bool:
        try:
            self._ensure_loaded()
            return self._pipeline is not None
        except Exception as exc:
            logger.warning("HuggingFace health check failed: %s", exc)
            return False

    def close(self) -> None:
        with self._lock:
            self._pipeline = None
