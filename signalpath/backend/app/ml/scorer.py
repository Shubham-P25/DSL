"""Lazy calibrated trust scorer with an explicit heuristic fallback."""
import json
import logging
from pathlib import Path
import numpy as np
from app.core.config import settings
from app.ml.features import FEATURE_COLS

class TrustScorer:
    def __init__(self) -> None:
        self._model = None
        self._schema: dict = {}
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        schema_path = Path(settings.model_dir) / "feature_schema.json"
        model_path = Path(settings.model_dir) / "trust_model.joblib"
        try:
            self._schema = json.loads(schema_path.read_text(encoding="utf-8"))
            if self._schema.get("feature_cols") != FEATURE_COLS:
                raise ValueError("feature schema does not match serving features")
            import joblib
            self._model = joblib.load(model_path)
        except Exception as exc:
            logging.getLogger(__name__).warning("Trust model unavailable; using heuristic scorer: %s", exc)
            self._model = None

    def score(self, features: dict[str, float]) -> tuple[float, str, str]:
        self._load()
        if self._model is not None:
            values = np.array([[features.get(name, np.nan) for name in FEATURE_COLS]], dtype=np.float32)
            error_probability = float(self._model.predict_proba(values)[0][1])
            trust = float(np.clip(1.0 - error_probability, 0.0, 1.0))
            scorer = "calibrated_model"
            thresholds = self._schema.get("thresholds", {"green": 0.75, "yellow": 0.5})
        else:
            values = [features.get(name, np.nan) for name in ("avg_word_prob", "min_word_prob")]
            finite_values = [value for value in values if np.isfinite(value)]
            confidence = float(np.mean(finite_values)) if finite_values else 0.5
            logprob = float(features.get("avg_logprob", np.nan))
            if not np.isfinite(logprob):
                logprob = np.nan
            no_speech = float(features.get("no_speech_prob", np.nan))
            speech = 1.0 - (no_speech if np.isfinite(no_speech) else 0.5)
            compression = float(features.get("compression_ratio", np.nan))
            if not np.isfinite(compression):
                compression = 1.0
            trust = float(np.clip(0.55 * confidence + 0.25 * speech + 0.2 * np.clip(1.0 - max(0.0, compression - 2.4) / 3.0, 0, 1), 0.05, 0.99))
            if not np.isnan(logprob):
                trust = float(np.clip(trust + np.clip((logprob + 1.5) * 0.05, -0.1, 0.1), 0.05, 0.99))
            scorer, thresholds = "heuristic", {"green": 0.75, "yellow": 0.5}
        bucket = "green" if trust >= thresholds.get("green", 0.75) else "yellow" if trust >= thresholds.get("yellow", 0.5) else "red"
        return round(trust, 4), bucket, scorer
