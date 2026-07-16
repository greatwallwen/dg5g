from __future__ import annotations

import base64
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field


MODEL_ID = os.environ.get("DGBOOK_VOXCPM_MODEL", "openbmb/VoxCPM2")
DEVICE = os.environ.get("DGBOOK_VOXCPM_DEVICE", "auto")
PORT = int(os.environ.get("DGBOOK_VOXCPM_PORT", "8000"))
MAX_CHARS = int(os.environ.get("DGBOOK_VOXCPM_MAX_CHARS", "150"))
LOAD_DENOISER = os.environ.get("DGBOOK_VOXCPM_DENOISER", "0") == "1"
OPTIMIZE = os.environ.get("DGBOOK_VOXCPM_OPTIMIZE", "0") == "1"

app = FastAPI(title="DGBook VoxCPM2 Sidecar", version="0.1.0")
_model: Any | None = None


class SpeechRequest(BaseModel):
    model: str | None = None
    input: str = Field(default="")
    voice: str | None = None
    response_format: str | None = "wav"
    speed: float | None = 1.0
    cfg_value: float | None = 2.0
    inference_timesteps: int | None = 10
    normalize: bool | None = True
    denoise: bool | None = False
    voice_prompt: str | None = None
    reference_wav_base64: str | None = None
    reference_audio_base64: str | None = None
    reference_audio_url: str | None = None
    reference_audio_path: str | None = None
    ref_audio_wav_base64: str | None = None
    ref_audio: str | None = None
    prompt_wav_base64: str | None = None
    prompt_audio: str | None = None
    prompt_text: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": MODEL_ID, "loaded": _model is not None, "device": DEVICE}


@app.get("/v1/models")
def models() -> dict[str, Any]:
    return {"object": "list", "data": [{"id": "voxcpm2", "object": "model", "owned_by": "dgbook"}]}


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest) -> Response:
    text = req.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is required")
    try:
        wav, sample_rate = synthesize(req, text)
    except Exception as exc:  # pragma: no cover - returned to local CLI.
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    audio = io.BytesIO()
    sf.write(audio, wav, sample_rate, format="WAV")
    return Response(audio.getvalue(), media_type="audio/wav")


def get_model() -> Any:
    global _model
    if _model is None:
        from voxcpm import VoxCPM

        _model = VoxCPM.from_pretrained(
            MODEL_ID,
            load_denoiser=LOAD_DENOISER,
            device=DEVICE,
            optimize=OPTIMIZE,
        )
    return _model


def synthesize(req: SpeechRequest, text: str) -> tuple[np.ndarray, int]:
    model = get_model()
    ref_path = write_reference_audio(req)
    segments = split_text(text, MAX_CHARS)
    wavs: list[np.ndarray] = []
    try:
        for segment in segments:
            source = with_voice_prompt(segment, req.voice_prompt, req.voice)
            kwargs: dict[str, Any] = {
                "text": source,
                "cfg_value": req.cfg_value or 2.0,
                "inference_timesteps": req.inference_timesteps or 10,
                "normalize": bool(req.normalize),
                "denoise": bool(req.denoise),
            }
            if ref_path:
                kwargs["reference_wav_path"] = str(ref_path)
            if ref_path and req.prompt_text and (req.prompt_wav_base64 or req.prompt_audio):
                kwargs["prompt_wav_path"] = str(ref_path)
                kwargs["prompt_text"] = req.prompt_text
            wavs.append(np.asarray(model.generate(**kwargs), dtype=np.float32))
    finally:
        if ref_path:
            ref_path.unlink(missing_ok=True)
    sample_rate = int(getattr(model.tts_model, "sample_rate", 48000))
    if not wavs:
        return np.zeros(sample_rate // 2, dtype=np.float32), sample_rate
    if len(wavs) == 1:
        return wavs[0], sample_rate
    pause = np.zeros(int(sample_rate * 0.18), dtype=np.float32)
    stitched = []
    for index, wav in enumerate(wavs):
        if index:
            stitched.append(pause)
        stitched.append(wav)
    return np.concatenate(stitched), sample_rate


def write_reference_audio(req: SpeechRequest) -> Path | None:
    if req.reference_audio_path:
        path = Path(req.reference_audio_path)
        if path.exists():
            return write_temp_audio(path.read_bytes())
    data = (
        req.reference_wav_base64
        or req.reference_audio_base64
        or req.ref_audio_wav_base64
        or req.ref_audio
        or req.prompt_wav_base64
        or req.prompt_audio
    )
    if not data:
        return None
    if data.startswith("data:"):
        data = data.split(",", 1)[-1]
    raw = base64.b64decode(data)
    return write_temp_audio(raw)


def write_temp_audio(raw: bytes) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="dgbook-voice-", suffix=".wav", delete=False)
    handle.write(raw)
    handle.close()
    return Path(handle.name)


def with_voice_prompt(text: str, voice_prompt: str | None, voice: str | None) -> str:
    prompt = (voice_prompt or "").strip()
    if not prompt and voice and voice.startswith("prompt:"):
        prompt = voice.split(":", 1)[1].strip()
    if not prompt:
        return text
    if text.startswith("(") or text.startswith("（"):
        return text
    return f"({prompt}){text}"


def split_text(text: str, limit: int) -> list[str]:
    if len(text) <= limit:
        return [text]
    pieces = [item.strip() for item in re.split(r"(?<=[。！？!?；;])", text) if item.strip()]
    segments: list[str] = []
    current = ""
    for piece in pieces or [text]:
        if current and len(current) + len(piece) > limit:
            segments.append(current)
            current = piece
        else:
            current += piece
    if current:
        segments.append(current)
    return segments


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
