# Claydo

A spatial, sticky-note style TODO board. Drag cards between timeframes, nest
sub-todos, keep a running agenda per person, and watch the capacity meter tell
you when Today is oversubscribed. Runs entirely in your browser, no server, no
account. Install it to the Dock and it behaves like a native app.

## Install (macOS)

1. Open the app URL in **Safari**.
2. **File → Add to Dock…** and click Add.
3. Launch Claydo from the Dock. It runs in its own window, offline too.

In Chrome: open the URL, click the install icon at the right of the address
bar (or ⋮ → **Cast, save, and share → Install page as app**).

Your data lives in that browser's storage. Export a JSON backup from ⚙ now
and then, or turn on the daily auto-backup there.

## Using it

**Add fast.** Press `N` (or just start typing) and hit Enter. Tokens are optional:

```
Call vendor about filters @helen #purchasing !s *3 >today // ask about lead time
```

| token | meaning |
|---|---|
| `@name` | link a person (creates them if new) |
| `#tag` | tag |
| `!xs` `!s` `!m` `!l` `!xl` or `!1`–`!5` | effort (1 / 2 / 4 / 8 / 16 points) |
| `*1`–`*3` or `*` `**` `***` | value |
| `>today` `>week` `>soon` `>later` | timeframe (matches your bucket names) |
| leading `+` | make it a sub-todo of the selected card |
| `// text` | everything after goes into notes |

**Cards.** Click to select, click the title again (or press Enter) to edit.
Tab jumps to notes. In notes, lines starting with `- ` render as bullets and
`⌘↵` turns the current line into a real sub-todo. URLs become links.

**Drag.** Drop a card on another card to nest it (hold ⌥ to just overlap).
Drop it on a tray to move it. Fling it and it coasts.

**Sub-todos.** Press `F` (or click the `n/m ▸` chip) to focus a card: the board
fades, its children lay out in mini-trays. A sub-todo inherits its parent's
timeframe unless you drop it on a tray of its own, in which case it also shows
on the main board with an `↑ parent` chip.

**People.** Person cards live in the People tray and never finish. Click one to
expand its agenda, type to add items, tick them off as you talk. Cards
elsewhere that mention `@person` appear in that agenda too.

**Views.** Timeframe is the default. The other buttons regroup the same cards by
effort, value, a value × effort matrix, person, tag, or age. Dragging a card
into a column sets that attribute.

**Capacity.** Each timeframe has a budget in effort points (click the meter to
change it). Unsized cards count for 2. It goes amber at 70 %, red and wobbly
past 100 %.

**Old cards** slowly yellow, then crack. Touching them (edit or drag) resets it.

**Reflect ✦** in the Done strip shows what you finished this week / month /
quarter / year, as a brick wall, a heatmap, and a copyable Markdown list.

### Keyboard

| key | action |
|---|---|
| `N` | new todo |
| `⏎` | edit selected |
| `D` | mark done |
| `F` | focus sub-todos |
| `1`–`5` | effort |
| `⇧1`–`⇧3` | value |
| `←` `→` | move to previous / next timeframe |
| `⌘D` | duplicate |
| `⌫` | delete (undoable) |
| `⌘Z` / `⇧⌘Z` | undo / redo |
| `/` | filter |
| `esc` | back / deselect |

## Development

```bash
npm install
npm run dev      # http://localhost:5173/claydo/
npm test         # vitest: parser, capacity, staleness, history, backup
npm run check    # svelte-check
npm run build    # production build to dist/ (base path /claydo/)
```

Built with Svelte 5, Vite, and `idb-keyval`. Deploys to GitHub Pages on every
push to `main` via `.github/workflows/deploy.yml`. Set `VITE_BASE=/` to build
for a root domain.

### Layout

```
src/lib/model     types, store (runes), quick-add parser, capacity, staleness, undo
src/lib/persist   IndexedDB doc + daily snapshots, JSON export/import/merge
src/lib/physics   pointer drag with velocity, coast and bounce
src/lib/ui        Board, Section, Card, FocusOverlay, GroupView, Meter, Reflect, Settings
```
