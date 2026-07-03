# Jigtable Client

Vite React client for the editor and jigsaw room UI.

## Vercel

Set Vercel Root Directory to `client`.

Required env:

```bash
VITE_API_URL=https://api.example.com
VITE_TELEGRAM_BOT_USERNAME=jigtable_bot
```

Optional env:

```bash
VITE_JIGSAW_WS_ENABLED=true
VITE_JIGSAW_WS_URL=wss://api.example.com/api/jigsaw/ws
```

`vercel.json` handles SPA rewrites, static asset caching, and basic security headers.
