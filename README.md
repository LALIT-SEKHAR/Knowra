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

## Deploy on Vercel

1. Push this repo to GitHub (or deploy from the CLI).
2. Set build-time env: `VITE_API_URL` = `https://<your-api>.vercel.app/api`
3. SPA routing is handled via `vercel.json` rewrites.
