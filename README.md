# CodeZ Development

A dark-themed web platform for sharing free and paid Discord server codes,
with a full owner panel and staff management system.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Set your database URL (PostgreSQL)
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# 3. Push the DB schema (first time only)
pnpm --filter @workspace/db run push

# 4. Start the dev server
pnpm --filter @workspace/codez run dev
```

## Configuration

Edit `frontend/src/config.js` to set:
- `DISCORD_URL` — your Discord invite link
- `OWNER_PASSWORD` — password to access the owner panel

## Vercel Deployment

1. Push this folder to a GitHub repo
2. Import it in Vercel — Vercel will auto-detect pnpm
3. Set the `DATABASE_URL` environment variable in Vercel's project settings
4. Build command: `pnpm install && pnpm --filter @workspace/codez run build`
5. Output directory: `frontend/dist/public`

## Stack

- **Frontend**: React 19 + Vite + Tailwind v4
- **Backend**: Express (Vercel Serverless)
- **Database**: PostgreSQL + Drizzle ORM
- **Monorepo**: pnpm workspaces
