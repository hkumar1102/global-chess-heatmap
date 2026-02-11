# Global Chess Heatmap

Global Chess Heatmap is a premium frontend-only chess analytics app built with React + TypeScript.
It combines:

- a fully interactive chess board
- live game streaming via a mock WebSocket server
- real-time square heatmaps using 2D prefix sums
- move suggestions from a depth-2 minimax analysis
- polished Framer Motion interactions
- subtle Three.js board tilt visuals
- complete match protocol for local play (clock, timeout, resign, draw offer/accept)

## Why This Project Is Strong

- Uses clean separation of concerns (`algorithms`, `components`, `sockets`, `hooks`)
- Implements real chess mechanics with legality filtering and terminal outcomes
- Includes serious frontend engineering patterns:
  - deterministic state transitions
  - strict typing
  - async state with TanStack Query
  - animation discipline with Framer Motion
  - test coverage for rules/outcomes/perft sanity

## Main Features

### Chess and Rules

- Legal move generation with check safety filtering
- Castling, en passant, promotion
- Check, checkmate, stalemate detection
- Draw outcomes:
  - 50-move
  - 75-move
  - repetition / fivefold repetition
  - insufficient material
  - draw agreement
- Resignation and timeout outcomes
- Timeout logic includes mating-material adjudication

### Match Protocol (Local Play)

- Time controls: `1+0`, `3+2`, `10+5`, `15+10`
- Live ticking clocks
- Increment after each move
- Draw offer / accept / decline flow
- Undo/redo/jump history navigation
- PGN export (copy to clipboard)

### Visualization

- Heatmap overlay with prefix-sum smoothing radius
- Heat pulses on updated squares
- Threat rays and check lines
- Minimax recommendation arrows
- Eval bar + material diff
- Capture tracking panel
- Theme-aware visuals (dark + light)

### UX / Product Polish

- Command palette (`Ctrl/Cmd + K`) with fuzzy search
- Keyboard shortcuts for core actions
- Responsive layout
- Fixed scroll behavior in command palette and move list
- Theme persistence + local timeline persistence

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Framer Motion
- TanStack React Query
- Mock WebSocket layer in frontend
- Three.js
- Vitest

## Project Structure

```text
src/
  algorithms/     # chess engine logic, prefix sums, minimax, fuzzy search
  components/     # board UI, controls, panels, overlays
  hooks/          # reusable hooks (size observer)
  sockets/        # mock server + socket protocol + query sync
  App.tsx         # orchestration layer
tests/            # chess rules/outcomes/perft tests
```

## Local Setup (Run on Your PC)

### 1) Install Node.js

- Download and install Node.js LTS (18+ recommended)
- During install, keep default options

### 2) Install dependencies

```bash
npm install
```

### 3) Run development server

```bash
npm run dev
```

Open the URL shown in terminal (usually `http://localhost:5173`).

## Useful Scripts

```bash
npm run dev        # start local development server
npm run typecheck  # TypeScript strict checks
npm test           # run Vitest test suite
npm run build      # production build
npm run preview    # preview built app
```

## Keyboard Shortcuts

- `Ctrl/Cmd + K`: Open command palette
- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y`: Redo
- `Left/Right`: Move backward/forward in timeline
- `Home/End`: Jump to start/end
- `R`: Reset local match
- `X`: Resign side to move
- `D`: Offer draw / accept draw (if pending)
- `G`: Copy PGN

## Testing and Quality

This project includes:

- rules tests (`en passant`, promotion, castling)
- outcomes tests (mate/draw/repetition/resign/timeout/agreement)
- perft sanity tests for movegen integrity

Run:

```bash
npm run typecheck
npm test
npm run build
```

## Push to GitHub (Beginner-Friendly)

If this is your first time, follow this exactly:

### Step 1: Create a new empty GitHub repository

1. Go to `https://github.com`
2. Click `+` (top-right) -> `New repository`
3. Name it: `global-chess-heatmap`
4. Keep it **Public** (or Private if you want)
5. Do **not** add README/.gitignore/license there (your project already has files)
6. Click `Create repository`

### Step 2: Open terminal inside your project folder

Use VS Code terminal in this project.

### Step 3: Initialize Git (only if not already initialized)

```bash
git init
```

### Step 4: Add files and commit

```bash
git add .
git commit -m "Initial commit: Global Chess Heatmap"
```

If Git asks for username/email:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Then run commit again.

### Step 5: Connect your local project to GitHub repo

Copy your repo URL from GitHub (looks like `https://github.com/yourname/global-chess-heatmap.git`)

```bash
git remote add origin https://github.com/yourname/global-chess-heatmap.git
```

### Step 6: Push code

```bash
git branch -M main
git push -u origin main
```

Done. Refresh GitHub page; your project should appear.

## Advanced Free Deployment (Recommended)

Use **Cloudflare Pages** for free production hosting + automatic deploys from GitHub.

### Why Cloudflare Pages

- Free global CDN
- Automatic SSL
- Fast static hosting
- Auto-deploy on each `git push`
- Preview URLs for pull requests

### Step-by-step deployment

1. Push your code to GitHub (steps above)
2. Go to `https://dash.cloudflare.com`
3. Create account (free)
4. Left menu -> `Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`
5. Authorize GitHub and pick `global-chess-heatmap`
6. Build settings:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
7. Click `Save and Deploy`
8. Wait for build to finish
9. You get a free URL like `https://global-chess-heatmap.pages.dev`
10. Optional: connect custom domain later

### Every update workflow

When you change code:

```bash
git add .
git commit -m "Update UI and features"
git push
```

Cloudflare auto-builds and updates your live site.

## Deployment Alternative (Also Free)

- Vercel: very simple Vite deployment
- Netlify: also easy for static apps

Cloudflare Pages is preferred here for strong free edge distribution.

## Docs for You

- `docs/GITHUB_PUSH_GUIDE.md` - detailed push flow with common errors
- `docs/DEPLOYMENT_GUIDE.md` - production-grade free deployment guide
- `INTERVIEW_PLAYBOOK.md` - full file-by-file explanation + interview Q&A

## License

Use this project for learning, portfolio, and interview preparation.
