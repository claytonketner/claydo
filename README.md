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

Your data lives in that browser's storage, so set up a backup (the ⚙ icon
shows a dot until you do):

- **Chrome / Edge:** ⚙ → *Quick setup* creates a `claydo_backups` folder in
  Documents (or *Choose a folder…* to use one that syncs to the cloud). The
  app then writes `claydo-latest.json` plus one dated file per day, silently,
  once an hour. Install it as an app and tick "allow on every visit" so the
  permission sticks across restarts.
- **Safari / Firefox:** no folder API, so the app downloads a JSON backup once
  a day to your Downloads folder instead. You can also export by hand or
  import a backup from ⚙.

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
| `~` | it's an idea (goes to the Ideas tray) |
| `// text` | everything after goes into notes |

**Cards.** Click to select, double-click to open. Enter edits the title in
place. Cards truncate after a few lines; the popup shows everything. Cards
slowly yellow and then crack as they age from their creation date.

**The popup.** Double-click any card for the full view: title, scrollable
notes, effort, value, timeframe, tags, people (with a jump to that person's
popup), and its sub-todos in mini-trays. Open a sub-todo from inside and the
parent's popup stacks up behind it like a thrown-down card; close the top one
and the next straightens up. Click the backdrop to close them all.
Drag the card itself or a sub-todo out of the popup and hold for a moment:
the popup steps aside so you can drop it anywhere on the board (a sub-todo
gets un-nested).

**Drag.** Cards land exactly where you let go, with a little bounce. Drop one
on a tray to move it; the tray opens up extra room below while you hover.
After a drop, neighbours nudge aside so nothing overlaps. Bring a card close
to another while holding **⇧** and they group: a **GROUP** label and a hull
appear (without ⇧ you get a faded hint). Overlap most of a card and it turns
into **NEST**. Drop a todo on a person and it joins their agenda. Grouped
cards share a dashed hull with an ✕ to ungroup, and dragging any member moves
the whole group. To pull one card out on its own, hold ⇧ before you grab it.

**Sub-todos.** A card with sub-todos shows little tabs along its bottom edge,
one per child. Press `F` or double-click to open its popup.
A sub-todo inherits its parent's timeframe unless you drop it on a tray of its
own (or Ideas), in which case it also shows on the main board with an
`↰ parent` chip. Finishing or deleting a card that has sub-todos asks whether
to take them along or release them back onto the board.

**People.** Person cards live in the People tray and never finish. Double-click
one for its agenda: tick the checkbox to close an item, click its text to open
it. Cards elsewhere that mention `@person` appear in that agenda too.

**Trash.** Deleting sends a card to 🗑 in the top bar, where it can be restored
for 30 days.

**Done.** The Done tray is a timeline: finish a card (press `D`, click ✓, or
drop it on the tray) and it lands at the top at a random spot, pushing older
ones down. Slide them sideways to tidy up, or drag one back up to reopen it.

**Views.** Timeframe is the default. The other buttons regroup the same cards by
effort, value, a value × effort matrix, person, tag, or age. Dragging a card
into a column sets that attribute.

**Capacity.** Each timeframe has a budget in effort points (set in ⚙ Settings).
Unsized cards count for 2. It goes amber at 70 % and red past 100 %. Cracked
old cards have a "Like new" button in their popup.

**Reflect ✦** in the Done strip shows what you finished this week / month /
quarter / year, as a brick wall, a heatmap, and a copyable Markdown list.

### Keyboard

| key | action |
|---|---|
| `N` | new todo |
| `⏎` | edit title in place |
| `D` | mark done |
| `F` | open popup |
| `1`–`5` | effort |
| `⇧1`–`⇧3` | value |
| `←` `→` | move to previous / next timeframe |
| `⌘D` | duplicate |
| `⌫` | delete to trash (asks about sub-todos) |
| `⌘Z` / `⇧⌘Z` | undo / redo |
| `/` | filter |
| `esc` | back / deselect |
| double-click | open popup |

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
src/lib/ui        Board, Section, Card, CardPopup, DragOverlay, GroupView, Meter, Reflect, Settings
```
