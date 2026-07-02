"""Application settings — JSON file with .env fallback for self-hosted installs."""
from __future__ import annotations

import json
import os
import platform
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "data" / "app-settings.json"

_lock = threading.Lock()


@dataclass
class Settings:
    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_base_url: str = ""
    transcribe_engine: str = "openai"
    openai_model: str = "whisper-1"
    clips_model: str = "gpt-4o"
    keywords_model: str = "gpt-4o-mini"
    enrich_model: str = "gpt-4o-mini"
    allowed_origins: list[str] = field(default_factory=list)
    public_domain: str = ""

    def merge_update(self, patch: dict[str, Any]) -> None:
        for key, value in patch.items():
            if not hasattr(self, key):
                continue
            if key == "allowed_origins" and value is not None:
                self.allowed_origins = _normalize_origins(value)
            elif value is not None:
                setattr(self, key, value)

    def openai_configured(self) -> bool:
        return bool((self.openai_api_key or "").strip())

    def transcribe_ready(self) -> bool:
        engine = (self.transcribe_engine or "openai").strip().lower()
        if engine == "mlx":
            return platform.system() == "Darwin"
        return self.openai_configured()

    def warnings(self) -> list[str]:
        out: list[str] = []
        if not self.openai_configured():
            out.append("Chave OpenAI não configurada — configure em Configurações.")
        engine = (self.transcribe_engine or "openai").strip().lower()
        if engine == "mlx" and platform.system() != "Darwin":
            out.append("Transcrição MLX só funciona no macOS (Apple Silicon). Use OpenAI Whisper na VPS.")
        elif engine == "openai" and not self.openai_configured():
            out.append("Transcrição OpenAI requer API key.")
        return out


_settings: Optional[Settings] = None


def _normalize_origins(value: Any) -> list[str]:
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(",") if p.strip()]
    elif isinstance(value, list):
        parts = [str(p).strip() for p in value if str(p).strip()]
    else:
        return []
    return parts


def _origins_from_domain(domain: str) -> list[str]:
    d = (domain or "").strip().rstrip("/")
    if not d:
        return []
    if "://" not in d:
        d = f"https://{d}"
    parsed = urlparse(d)
    host = parsed.netloc or parsed.path.split("/")[0]
    if not host:
        return []
    return _normalize_origins(f"https://{host},http://{host}")


def _load_env_into(settings: Settings) -> None:
    if os.environ.get("OPENAI_API_KEY"):
        settings.openai_api_key = os.environ["OPENAI_API_KEY"].strip()
    if os.environ.get("OPENAI_BASE_URL"):
        settings.openai_base_url = os.environ["OPENAI_BASE_URL"].strip()
    if os.environ.get("TRANSCRIBE_ENGINE"):
        settings.transcribe_engine = os.environ["TRANSCRIBE_ENGINE"].strip().lower()
    if os.environ.get("OPENAI_MODEL"):
        settings.openai_model = os.environ["OPENAI_MODEL"].strip()
    if os.environ.get("CLIPS_MODEL"):
        settings.clips_model = os.environ["CLIPS_MODEL"].strip()
    if os.environ.get("KEYWORDS_MODEL"):
        settings.keywords_model = os.environ["KEYWORDS_MODEL"].strip()
    if os.environ.get("ENRICH_MODEL"):
        settings.enrich_model = os.environ["ENRICH_MODEL"].strip()
    if os.environ.get("ALLOWED_ORIGINS"):
        settings.allowed_origins = _normalize_origins(os.environ["ALLOWED_ORIGINS"])
    if os.environ.get("LLM_PROVIDER"):
        settings.llm_provider = os.environ["LLM_PROVIDER"].strip().lower()


def _load_json_into(settings: Settings) -> bool:
    if not SETTINGS_PATH.exists():
        return False
    try:
        raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    if not isinstance(raw, dict):
        return False
    settings.merge_update(raw)
    return True


def _default_engine() -> str:
    if os.environ.get("TRANSCRIBE_ENGINE"):
        return os.environ["TRANSCRIBE_ENGINE"].strip().lower()
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "openai"


def _build_settings() -> Settings:
    s = Settings(transcribe_engine=_default_engine())
    _load_env_into(s)
    has_file = _load_json_into(s)
    if not s.transcribe_engine:
        s.transcribe_engine = "openai" if s.openai_configured() else "openai"
    return s


def reload() -> Settings:
    global _settings
    with _lock:
        _settings = _build_settings()
        return _settings


def get() -> Settings:
    global _settings
    if _settings is None:
        with _lock:
            if _settings is None:
                _settings = _build_settings()
    return _settings


def mask_api_key(key: str) -> str:
    k = (key or "").strip()
    if not k:
        return ""
    if len(k) <= 8:
        return "••••••••"
    return f"{k[:3]}...{k[-4:]}"


def settings_source() -> str:
    has_env_key = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    has_file = SETTINGS_PATH.exists()
    if has_file and has_env_key:
        return "both"
    if has_file:
        return "file"
    if has_env_key:
        return "env"
    return "none"


def to_public(settings: Optional[Settings] = None) -> dict[str, Any]:
    s = settings or get()
    return {
        "llm_provider": s.llm_provider,
        "openai_api_key_masked": mask_api_key(s.openai_api_key),
        "openai_api_key_set": s.openai_configured(),
        "openai_base_url": s.openai_base_url or "",
        "transcribe_engine": s.transcribe_engine,
        "openai_model": s.openai_model,
        "clips_model": s.clips_model,
        "keywords_model": s.keywords_model,
        "enrich_model": s.enrich_model,
        "allowed_origins": list(s.allowed_origins),
        "public_domain": s.public_domain,
        "configured": s.openai_configured(),
        "transcribe_ready": s.transcribe_ready(),
        "warnings": s.warnings(),
        "source": settings_source(),
        "platform": platform.system(),
        "mlx_available": platform.system() == "Darwin",
    }


def save(patch: dict[str, Any]) -> Settings:
    current = get()
    merged = Settings(**asdict(current))

    if "openai_api_key" in patch:
        key = (patch.get("openai_api_key") or "").strip()
        if key and not key.startswith("•••"):
            merged.openai_api_key = key
    for field_name in (
        "llm_provider",
        "openai_base_url",
        "transcribe_engine",
        "openai_model",
        "clips_model",
        "keywords_model",
        "enrich_model",
        "public_domain",
    ):
        if field_name in patch and patch[field_name] is not None:
            setattr(merged, field_name, str(patch[field_name]).strip())

    if "allowed_origins" in patch and patch["allowed_origins"] is not None:
        merged.allowed_origins = _normalize_origins(patch["allowed_origins"])
    elif patch.get("public_domain"):
        merged.allowed_origins = _origins_from_domain(str(patch["public_domain"]))

    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(merged)
    SETTINGS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    try:
        SETTINGS_PATH.chmod(0o600)
    except OSError:
        pass
    return reload()


def get_openai_api_key() -> str:
    key = (get().openai_api_key or "").strip()
    if not key:
        raise RuntimeError(
            "OpenAI não configurada. Abra Configurações e adicione sua API key."
        )
    return key


def get_openai_chat_url() -> str:
    base = (get().openai_base_url or "").strip().rstrip("/")
    if base:
        return f"{base}/chat/completions"
    return "https://api.openai.com/v1/chat/completions"


def get_openai_transcribe_url() -> str:
    base = (get().openai_base_url or "").strip().rstrip("/")
    if base:
        return f"{base}/audio/transcriptions"
    return "https://api.openai.com/v1/audio/transcriptions"


def get_transcribe_engine() -> str:
    return (get().transcribe_engine or "openai").strip().lower()


def get_openai_model() -> str:
    return get().openai_model or "whisper-1"


def get_clips_model() -> str:
    return get().clips_model or "gpt-4o"


def get_keywords_model() -> str:
    return get().keywords_model or "gpt-4o-mini"


def get_enrich_model() -> str:
    return get().enrich_model or "gpt-4o-mini"


def get_allowed_origins() -> list[str]:
    return list(get().allowed_origins)


def cors_allow_all() -> bool:
    origins = get_allowed_origins()
    return not origins or "*" in origins
