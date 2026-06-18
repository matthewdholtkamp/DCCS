# AI Editing Guide (CLAUDE.md)

Welcome to the DCCS/MSCoE Operational Framework repo. This document contains guidelines for AI coding assistants.

## General Constraints
1. **Never edit `js/ask-dr-holtkamp.js` or `js/sync.js`** without explicit user permission. These are highly sensitive files handling AI interactions and Firebase database syncing.
2. **Never edit `js/chart.umd.min.js`** (vendor library).
3. **Data Safety**: Never change Firestore document paths, field names, or save trigger functions inside `sync.js` or the app modules calling them.

## Codebase Architecture
This is a Vanilla JS Single Page Application (SPA).
- **Global Objects**: The app is built on a few global singletons:
  - `window.App`: The main application object, extended across multiple `js/app-*.js` files using `Object.assign(window.App, { ... })`.
  - `window.Sync`: The Firestore data layer (`js/sync.js`).
  - `window.FRAMEWORK`: The static declarative data model (`js/data.js`).
  - `window.AskDrHoltkamp`: The AI Assistant (`js/ask-dr-holtkamp.js`).
- **CSS**: Split by feature in `css/`. Base styles in `styles.css`.
- **HTML**: `index.html` is the only HTML file. It's a shell where `main#app` is populated by JS.

## Where to find features
If the user asks you to edit X, look in Y:

- **Metrics logic/forms**: `js/app-metrics.js` and `css/metrics.css`
- **Tasks logic/forms**: `js/app-tasks.js` and `css/pages-workflow.css`
- **Meeting Mode**: `js/app-meeting.js` and `css/meeting-mode.css`
- **Presentation Mode**: `js/app-presentation.js` and `css/presentation-mode.css`
- **Landing Page**: `js/app-landing-framework.js` (DOM) and `js/landing-scroll.js` (Animations) and `css/landing-cinematic.css`
- **Framework Walkthrough**: `js/app-landing-framework.js` (DOM) and `js/framework-scroll.js` (Animations) and `css/framework-cinematic.css`
- **ER/ED Data**: `js/app-er-charts.js` and `css/emergency-department.css`
- **Routing**: `js/app-routing.js`
- **Data Sync/Firestore**: `js/sync.js` and `js/app-sync-patches.js`
- **Static Configuration**: `js/data.js`

## Cache Busters
When adding new CSS or JS files to `index.html`, or doing broad structural updates, ensure the `?v=` cache busters in `index.html` are unified to a single timestamp format (e.g., `?v=20260617-bugfixes`).
