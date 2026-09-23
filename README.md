# Knowra

**Ask. Explore. Understand.**

Knowra is a personal document workspace. You sign in, add your own AI keys, upload PDFs, and ask questions. Answers come from your files, with the page they were taken from.

This repository is the web app. The API lives in the sibling repo [`Knowra-api`](../Knowra-api).

## What it does

1. You log in with an email one-time code. There is no password.
2. You add an OpenAI API key in Settings. That key is required to index PDFs.
3. You upload a PDF. The file is stored, split into passages, and turned into searchable vectors.
4. You ask a question in the workspace. Knowra finds the closest passages and asks a language model to answer from those passages only.
5. The reply includes sources. Selecting a source opens that page in the PDF viewer.

Chat can use OpenAI, Claude, Gemini, Grok, or any OpenAI-compatible endpoint. Indexing and OCR always use your OpenAI key.

You pay the model providers directly. Knowra stores your keys encrypted and shows only the last four characters.

## How RAG works

RAG means **retrieval-augmented generation**. The model does not memorize your PDFs. At question time it receives a few matching passages and writes an answer from that text.

### Indexing (when you upload)

```
PDF → Cloudinary → extract text → chunk → embed → MongoDB
```

1. The browser asks the API for a Cloudinary upload signature, then uploads the PDF straight to Cloudinary.
2. The API records the document and queues a background job.
3. The job downloads the PDF and extracts selectable text.
4. Scanned pages with no text are rendered as images and read with OpenAI vision (`gpt-4o-mini`), up to 40 pages.
5. Text is split into chunks of about 1,000 characters with 200 characters of overlap. Each chunk keeps its page number.
6. Each chunk becomes a 1,536-number vector with OpenAI `text-embedding-3-small`.
7. Chunks are saved in MongoDB. The document status becomes `ready`.

A document moves through `uploading` → `processing` → `ready`. A failed file can be retried from Files.

### Answering (when you ask)

```
question → embed → vector search → top passages → chat model → answer + pages
```

1. The question is embedded with the same OpenAI model used at index time.
2. MongoDB Atlas Vector Search returns the closest chunks (cosine similarity, top 8).
3. Search is always limited to your user id. A selected document limits it further to that file. With no document selected, search covers your whole library.
4. Those passages, labeled with document name and page, are sent to your chosen chat model.
5. The model is instructed to answer only from that context.
6. The API returns the answer and sources (`document`, `chunk`, `page`). The workspace can open that page.

Short greetings skip retrieval. Follow-up questions include the last few messages in the same conversation.

## Screens

| Route | Purpose |
| --- | --- |
| `/auth` | Request and verify an email code |
| `/` | Workspace: chat, conversation list, and PDF viewer |
| `/files` | Library: upload, search, rename, delete, retry |
| `/profile` | Name and avatar |
| `/settings` | AI keys, chat model, usage, delete files, delete account |

Everything except `/auth` requires a signed-in session.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS
- React Router for screens
- `react-pdf` for the in-app PDF viewer
- `react-markdown` for assistant replies

The API is Express + TypeScript, MongoDB Atlas (including vector search), and Cloudinary. See [`Knowra-api`](../Knowra-api) for routes, jobs, and data models.

## Project structure

```
src/
  App.tsx                 routes and providers
  main.tsx                app entry
  pages/
    AuthPage.tsx          email OTP login
    FilesPage.tsx         document library
    ProfilePage.tsx       name and avatar
    SettingsPage.tsx      keys, models, usage, deletion
  components/
    WorkspacePage.tsx     chat + PDF workspace
    PdfViewer.tsx         page viewer, including source jumps
    ChatMarkdown.tsx      rendered assistant messages
    ProtectedRoute.tsx    sends signed-out users to /auth
  hooks/
    useAuth.tsx           session: token, current user, logout
    usePreferences.tsx    local display preferences
  services/
    api.ts                all HTTP calls to Knowra-api
  types/index.ts          shared response types
```

`src/services/api.ts` is the contract with the API. The workspace calls `api.chat()`. Uploads call `api.uploadDocument()`, which signs the upload, sends the file to Cloudinary, then registers it with the API.

## Setup

Requirements: Node.js 20+ and pnpm. The API must be running (see the API repo).

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Environment

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL, including `/api`. Default `http://localhost:4000/api`. |

`VITE_` variables are baked in at build time. Set `VITE_API_URL` in the host’s environment before `pnpm build`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Typecheck and production build |
| `pnpm preview` | Serve the production build locally |
| `pnpm lint` | Run oxlint |

## Deploy

The production frontend is a static Vite build (Vercel or any static host).

1. Set `VITE_API_URL` to `https://<your-api>/api`.
2. Set the API’s `CLIENT_ORIGIN` to this site’s URL.
3. SPA routes are rewritten to `index.html` via `vercel.json`.

## Typical first session

1. Start the API, then this app.
2. Sign in with the emailed code.
3. In Settings → AI, save an OpenAI key.
4. Upload a text-based PDF and wait until its status is `ready`.
5. Ask a question on the workspace. Open a source to land on the cited page.
