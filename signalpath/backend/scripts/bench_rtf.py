"""Measure real-time factor and first-caption latency from completed jobs."""
from __future__ import annotations
import argparse, json, statistics, time
from urllib.request import urlopen

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--base", default="http://127.0.0.1:8000/api/v1"); parser.add_argument("--job", action="append", default=[]); args = parser.parse_args()
    measurements = []
    for job_id in args.job:
        started = time.perf_counter()
        with urlopen(f"{args.base}/jobs/{job_id}") as response: payload = json.loads(response.read())
        elapsed = (time.perf_counter() - started) * 1000
        job, segments = payload["job"], payload["segments"]
        duration = job.get("duration_s") or (segments[-1]["end"] if segments else 0)
        timings = job.get("timings") or {}
        wall_s = timings.get("total_s") or timings.get("wall_s")
        measurements.append({"job_id": job_id, "duration_s": duration, "query_ms": elapsed, "wall_s": wall_s, "real_time_factor": (wall_s / duration) if wall_s and duration else None, "time_to_first_caption_s": timings.get("first_caption_s")})
    query_values = [m["query_ms"] for m in measurements]
    rtf_values = [m["real_time_factor"] for m in measurements if m["real_time_factor"] is not None]
    result = {"method": "runtime_measurement", "measurements": measurements, "query_p50_ms": statistics.median(query_values) if query_values else None, "query_p95_ms": sorted(query_values)[max(0, int(len(query_values) * .95) - 1)] if query_values else None, "rtf_p50": statistics.median(rtf_values) if rtf_values else None, "rtf_p95": sorted(rtf_values)[max(0, int(len(rtf_values) * .95) - 1)] if rtf_values else None, "note": "RTF is pending for jobs without persisted total_s timing."}
    print(json.dumps(result, indent=2)); return 0
if __name__ == "__main__": raise SystemExit(main())
