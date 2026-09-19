# Knowra

AI-powered document exploration platform.

> **Knowra — Ask. Explore. Understand.**

## Stack

- React + TypeScript + Vite + Tailwind CSS
- Backend: sibling repo `Knowra-api`

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Set `VITE_API_URL` to your API (default `http://localhost:4000/api`).

## Scripts

- `pnpm dev` — local dev server
- `pnpm build` — production build
- `pnpm preview` — preview build

## Deploy on Render (free)

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (or Static Site) → connect **Knowra**.
3. Set build-time env:
   - `VITE_API_URL` = `https://<your-api-service>.onrender.com/api`
4. After the API is live, redeploy this site so Vite picks up the API URL.
5. SPA routing is handled via `public/_redirects` and `render.yaml`.
