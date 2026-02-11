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

## License

Use this project for learning, portfolio, and interview preparation.
