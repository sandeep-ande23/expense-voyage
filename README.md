# Expense Voyage

A polished travel-expense tracker built as a front-end portfolio project. Create trips, split shared costs, see balances, settle debts, and keep trip notes in one place.

## Live-demo experience

Click **Load portfolio demo** on the welcome screen (or **Load sample trip** on an empty dashboard) to explore a populated Goa trip immediately. All data is stored locally in the browser, so the demo is safe to experiment with.

## Features

- Trip creation and invite codes
- Equal, custom-amount, and percentage expense splits
- Expense search, filters, receipt uploads, and recurring costs
- Balance calculations and simplified settlement suggestions
- Category analytics, notes, itinerary, and dark mode
- Local browser persistence with `localStorage`

## Tech stack

React, Vite, Lucide React, and Recharts.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build a production bundle with:

```bash
npm run build
```

## Deploy

This is a static Vite application. After pushing it to GitHub, import the repository into Vercel or Netlify and use:

- Build command: `npm run build`
- Publish directory: `dist`

No environment variables or backend services are required.

## Portfolio note

Expense Voyage is a front-end prototype: trips live in the browser rather than a shared backend. A production version would add authentication, a database, and server-side sharing.
