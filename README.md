# Workshop Organiser

Turn a business's floor plan into an interactive, top-down **digital twin** of
their space — then drag the things that move (boats, vehicles, jobs, pallets)
around it to plan and track work.

Built first for workshops like **Redbay Boats**, where boats are constantly
coming in and out and you need an at-a-glance map of what's where.

## The vision (build order)

1. **The organiser (this MVP).** Upload a floor plan + photos + info. Get a
   draggable top-down map of the space. Move items around, set their status,
   save the layout. ✅ _in progress_
2. **AI workflow assistant.** Analyse layouts and movement to suggest better
   arrangements — less shuffling, faster turnaround, smarter use of space.
3. **Live tracking.** Connect existing cameras to track real movement, measure
   efficiency, and surface where the workflow could be smoother.

## What works today (v0.2 — interactive 3D demo)

- **3D workshop** you can orbit, zoom and pan around (Three.js).
- **Onboarding wizard**: upload a floor plan + photos, answer a few questions,
  and it **builds your 3D view**. Uploaded floor plans become the textured 3D
  floor.
- Realistic **pre-built demos**: Boatyard (Redbay-style), Car Garage, Warehouse.
- **Drag** boat-hull / vehicle items around the floor; **click** to edit name,
  status, size, rotation, notes.
- Named **zones** (dry dock, paint bay, slipway, aisles…).
- **Live "AI" efficiency panel**: a score + ranked, clickable insights
  (overlaps, blocked aisles, ready-to-launch) that update as you rearrange.
- Colour-coded status: incoming / in progress / ready / blocked.
- **Auto-saves** to your browser. Export / import a layout as JSON.

## Run it

```bash
npm install
npm run dev      # start the dev server (Vite)
npm run build    # type-check + production build
npm run preview  # preview the production build
```

Then open the printed local URL (usually http://localhost:5173).

## Tech

- **React + TypeScript + Vite** — fast, simple front end.
- **SVG** floor canvas with viewBox-based pan/zoom, so dragging stays accurate
  at any zoom level. No heavy graphics dependencies — easy to upgrade the
  view to 3D (e.g. Three.js) later without changing the data model.
- State persists to `localStorage`; layouts export to portable JSON.

## Code map

| File | Purpose |
| --- | --- |
| `src/types.ts` | Data model (`WorkshopState`, `FloorItem`, statuses). |
| `src/storage.ts` | Load / save / import / export of layouts. |
| `src/App.tsx` | App state and wiring. |
| `src/components/FloorCanvas.tsx` | The interactive top-down map. |
| `src/components/Sidebar.tsx` | Edit panel for the selected item. |
| `src/components/Toolbar.tsx` | Workshop name + main actions. |

## Next steps

- Per-business accounts + cloud storage (a backend such as Supabase is
  available to wire in) so layouts aren't tied to one browser.
- Resize/rotate handles directly on the canvas.
- Zones/areas (paint shop, dry dock, bays) and capacity rules.
- Move history + timeline (foundation for the AI + camera layers).
