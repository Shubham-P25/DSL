# SignalPath

SignalPath is a local-first caption pipeline for URL metadata probing, streamed audio ingestion, speech recognition, trust scoring, and evidence-constrained correction.

## Run the backend

From the repository :




```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

python -m uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000/api/v1`. `GET /health` does not load speech or embedding models. Use `GET /preflight` before processing media.

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE` when the backend is not at `http://localhost:8000/api/v1`.

The backend settings are documented in [backend/.env.example](./backend/.env.example). Models are lazy and optional where the architecture permits; missing models are reported as typed errors instead of crashing imports.

