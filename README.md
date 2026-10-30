# MATCHDAY - Mobile-first Next.js league manager

A mobile-first match and standings application for weekly football games. Works with 2 to 5 teams and up to 50 fixtures. The default is 5 teams, 5 complete round-robin rounds, and 50 matches.

## Run locally

Requires Node.js 20.9 or newer. The Node.js LTS release is recommended.

```bash
npm install
npm run dev
```

Open http://localhost:3000 on your computer or phone (using your computer's local network IP and `npm run dev -- --hostname 0.0.0.0` when your firewall permits it).

Test a production build before deploying:

```bash
npm run build
npm run start
```

## Deploy on Vercel

Push this folder to a GitHub repository, import the repository at https://vercel.com/new, use the Next.js framework preset, and deploy. No environment variables are required.

## What it includes

- Match tab is the opening screen, with compact filters and large touch-friendly score fields.
- A pinned bottom navigation bar on small screens (Match / Table).
- A next-match shortcut, completed checkboxes, custom team names, score entry, and CSV export.
- A mobile league table with automatic 3/1/0 points and full desktop standings.
- A confirmation step before Reset All clears scores, checkboxes, and names.
- Browser localStorage saves changes without an account. Existing MATCHDAY v1 localStorage data is retained because the storage key is unchanged (`matchday-league-v1`).
- Fixtures use the same verified round-robin schedule as the previous release.

**Important:** Data is saved per browser/device only. Vercel hosting does not automatically share match results between phones. Clearing browser site data can delete the local results; export CSV for backups.

## Tests

```bash
npm run test:smoke
```

The smoke command checks fairness, fixtures, score counting, team renaming, and Reset. It is not a substitute for a real browser or production Next.js build.

Project is a regular Next.js App Router + TypeScript + Tailwind CSS 4 app and is suitable for Vercel deployment.
