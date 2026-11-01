# Platform support

The generic yt-dlp probe and streaming layer is implemented for public URLs. A platform is considered tested only after a real probe is run with a publicly accessible URL.

| Platform | Probe status | Notes |
|---|---|---|
| YouTube | Not run in this environment | Public videos should work when yt-dlp and ffmpeg are installed. |
| Vimeo | Not run in this environment | Uses generic yt-dlp extraction. |
| Direct audio/video URL | Not run in this environment | Requires a directly decodable media response. |
| Facebook/Instagram | Not run in this environment | May require `YTDLP_COOKIES_FILE`. |
| Live streams | Unsupported by design | Returns `LIVE_UNSUPPORTED`. |

