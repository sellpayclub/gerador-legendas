"""OpenAI Chat Completions — payload helpers for legacy and GPT-5/o-series models."""
from __future__ import annotations

import json
from typing import Any, Optional

from app_settings import get_openai_api_key, get_openai_chat_url


def _model_name(model: str) -> str:
    return (model or "").lower().strip()


def uses_max_completion_tokens(model: str) -> bool:
    """GPT-5+ and o-series use max_completion_tokens instead of max_tokens."""
    name = _model_name(model)
    return name.startswith(("gpt-5", "o1", "o3", "o4"))


def supports_custom_temperature(model: str) -> bool:
    """Reasoning / GPT-5 models only accept the default temperature (omit param)."""
    return not uses_max_completion_tokens(model)


def completion_limit_kwargs(model: str, limit: int) -> dict[str, int]:
    if uses_max_completion_tokens(model):
        return {"max_completion_tokens": limit}
    return {"max_tokens": limit}


def temperature_kwargs(model: str, temperature: Optional[float]) -> dict[str, float]:
    if temperature is None or not supports_custom_temperature(model):
        return {}
    return {"temperature": temperature}


def build_chat_payload(
    model: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int,
    temperature: Optional[float] = None,
    response_format: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        **completion_limit_kwargs(model, max_tokens),
        **temperature_kwargs(model, temperature),
    }
    if response_format:
        payload["response_format"] = response_format
    return payload


def post_chat_completion(
    model: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int,
    temperature: Optional[float] = None,
    response_format: Optional[dict[str, str]] = None,
    timeout: int = 120,
) -> dict[str, Any]:
    import requests

    resp = requests.post(
        get_openai_chat_url(),
        headers={"Authorization": f"Bearer {get_openai_api_key()}", "Content-Type": "application/json"},
        json=build_chat_payload(
            model,
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format=response_format,
        ),
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI chat error {resp.status_code}: {resp.text[:400]}")
    return resp.json()


def chat_message_content(data: dict[str, Any]) -> str:
    return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()


def chat_json(
    model: str,
    system: str,
    user: str,
    *,
    max_tokens: int = 2500,
    temperature: Optional[float] = None,
    timeout: int = 120,
) -> dict[str, Any]:
    data = post_chat_completion(
        model,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=temperature,
        response_format={"type": "json_object"},
        timeout=timeout,
    )
    raw = chat_message_content(data) or ""
    if not raw.strip():
        choice = data.get("choices", [{}])[0]
        usage = data.get("usage", {})
        reasoning = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
        raise RuntimeError(
            f"OpenAI retornou JSON vazio (modelo={model}, "
            f"finish={choice.get('finish_reason')}, reasoning_tokens={reasoning})"
        )
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"OpenAI retornou JSON inválido: {raw[:200]}") from exc
    if not parsed:
        raise RuntimeError("OpenAI retornou objeto JSON vazio")
    return parsed


def completion_token_budget(model: str, requested: int) -> int:
    """GPT-5/o-series spend many tokens on reasoning — budget extra headroom."""
    if uses_max_completion_tokens(model):
        return min(max(requested * 4, 16000), 32000)
    return requested


def chat_text(
    model: str,
    system: str,
    user: str,
    *,
    max_tokens: int = 500,
    temperature: Optional[float] = None,
    timeout: int = 60,
) -> str:
    data = post_chat_completion(
        model,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
    )
    return chat_message_content(data)
