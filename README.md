# GTFS Test Generator

A visual tool for creating GTFS test cases (arrange / act / assert) for the Szoftech university assignment, so you don't have to hand-write `stops.txt`, `stop_times.txt` and friends.

## 🌐 Web editor (nothing to install)

Open the editor in your browser at the hosted instance your instructor/maintainer provides. Everything runs locally in your browser; nothing is uploaded anywhere. Running your own instance needs Node, see *Development* and *Hosting* below.

![The editor with the DIVERT_LINE example open from the Example Models project: the project switcher and the Project panel with its three test cases top left, the Test case panel below them, a map with two colored lines and the affected stations highlighted, and the Arrange model panel on the right](docs/screenshot.png)

### What it does

- **IDE-style layout**, modeled on IntelliJ IDEA: the Project and Test case panels on the left, the Arrange/Expected model on the right, Problems under the map. Drag the gaps to resize, hide a panel with its − button and bring it back from the stripe on the screen edge (Project, Test case, Model) or from the bar under the map or the problems counter in the status bar (Problems); your layout is remembered. Light, dark or system theme. On phones the map stays pinned on top and the panels scroll below it.
- **Visual map** of your test network: lines are drawn in their colors, click a station to select it and drag it to move it (dragging anything else pans); Shift/Ctrl/Cmd + click adds or removes one, Shift + drag from an empty spot (or the toolbar's rectangle and lasso tools) selects every station inside, Ctrl/Cmd+A selects them all, dragging any selected station moves them together (or the arrow keys: 1 m, Shift 10 m, Alt 0.01 m), and Delete removes them, double-click adds a station, scroll zooms. On a crowded map (e.g. an imported city network) station dots shrink (zoomed far out they become plain markers you can't click, and farther still only the lines are drawn, plus selected stations and act targets; zoom in to edit) and only the names that fit are shown; hovering a station shows its name, and the tag button in the map toolbar switches between *Auto*, *All* and *None*. The route button next to it turns on line names on hover: the line under the pointer is named and highlighted over the faded rest.
- **Measure tool** (the ruler in the map toolbar): click two stations or any points to see their distance, Δx/Δy and both ends' XY and GPS coordinates; handy for building edge cases, especially with GPS coordinates. Esc clears the points, a second Esc leaves the tool.
- **Act preview**: a `CLOSE_AREA` radius is drawn as a dashed circle on the map, and the stations/line of a `DIVERT_LINE` call are highlighted, so you can *see* what your test affects. The method and exception pickers have a search box, and *Custom…* takes any name; a method the editor doesn't know gets no checks or map drawing.
- **Projects**, as in IntelliJ: the project widget (top left) switches between projects and creates, renames or deletes them. The Project panel lists the open project's test cases as `<name>.json` files: click one to open it (its icon is green, orange or red as it gets bigger: up to 10 k characters of JSON, 100 k, more), right-click (or ⋯) to rename, duplicate, copy it to another project, export or delete it (F2 / Shift+F6 renames, Delete or Backspace deletes). Undo history starts fresh each time you open a test case. A deleted test case or project can be brought back with the toast's *Undo*, or later from ⋮ → *Recently deleted* (until the page is reloaded). Everything is saved in your browser (IndexedDB, room for gigabytes) as you type, so a refresh loses nothing, and other open tabs follow your changes. The status bar shows how much is stored, per project too; click it to ask the browser to keep the data even when the disk runs low. Clearing the site data or switching browsers still loses everything, so keep a copy with *Export all as JSON*. Projects saved by an older version (in localStorage, about 5 MB per site) move over on the first start; where IndexedDB is unavailable the editor keeps using localStorage.
- **Panel editors**: the Test case panel holds the name, description, act, expected result and agency; the model panel holds stations, lines (with ordered stops), calendars and trips. Every picker in it is searchable; long lists get a search field and show 50 at a time, page by page (a line is also found by its stops' station names), and a line with more than 10 stops starts with them folded.
- **GPS ⇄ XY toggle per station**: place stations in meters on a grid (easy) or in real GPS coordinates; conversion matches the Java generator exactly.
- **Arrange / Expected tabs**: edit the before-model and the after-model separately, or pick an expected **exception** instead. "Copy Arrange → Expected" saves you from re-entering everything.
- **Undo / redo** (↶ ↷ in the map toolbar, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y while not typing in a text field) for every edit to the open test case, GTFS route imports included. Select stations and press Delete or Backspace to remove them; Esc deselects them, leaves the selection tool and ends stop picking. Ctrl/Cmd+S downloads the open test case's `.json` (instead of the browser saving the page).
- **Pick stops on map**: on a line card, press *Pick stops on map* and click stations to append them as stops in order.
- **Faded Arrange under Expected**: on the Expected tab the Arrange model is drawn faded underneath, so you see exactly what your act changes (the layers button in the map toolbar turns it off).
- **Side by side**: the columns button in the map toolbar opens Arrange and Expected next to each other; each map pans and zooms on its own, or both together with *Sync views*.
- **Live validation**: duplicate IDs, missing references, bad times/dates etc. are listed in the Problems panel before you generate anything. Sizes far beyond any hand-made test are warnings: more than 10 000 stations, 1000 lines, 1000 stops on a line or 25 000 on all lines together, 5000 trips, 1000 calendars (a whole city fits). A browser without IndexedDB keeps everything in its 5 MB localStorage, so there the counts are lower (1000 stations, 200 lines, 500 stops on a line, 2000 in all, 1000 trips, 100 calendars). Station and line names or agency fields over 200 characters and descriptions or act.txt over 5000 are warnings too, and text fields stop accepting characters at those lengths (text an import brought in longer has no such stop, so it stays editable); a test name over 100 is an error, since it names the zip and folder, and an imported one is cut to fit. All in `LIMITS` in `src/lib/model.ts`. Imports (JSON, submission zips, GTFS feeds) beyond the counts are refused: that much would make the editor crawl. Only errors block Generate; warnings (like a station exactly on a `CLOSE_AREA` radius, which the grader's GPS round trip can put on either side) are hints.
- **One-file export**: a test case is a single `.json` you can share or keep in your repo; *Export all as JSON* (⋮ on the Project panel) zips the whole project into `<project>-json.zip`.
- **Generate**: downloads `<name>.zip` containing exactly what the grader wants:
  `comment.txt`, `act.txt`, `arrange.zip`, and `assert.zip` *or* `assert.txt`. Unzip it into your submission directory and you're done. *Generate all* (⋮ on the Project panel) zips one such folder per test case of the project into `<project>-submissions.zip`; it needs every test case free of errors, with the phone number set and a unique name.
- **Examples built in**: the *Example Models* project holds synthetic test cases modeled on real, accepted submissions (same transformations, different layouts). Use them to learn the format, then build your own (*Copy to project* takes one over). *Reset Example Models* in the project widget (while that project is open) restores them.
- **Import from a real GTFS feed**: the import button on the Model panel's header reads a full GTFS zip (a city's whole network works, hundreds of MB included; it's read in the background, so the page stays responsive) and lets you pick routes. They replace the Arrange or Expected model, whichever tab is open; platforms are merged into their stations, and each line uses its route's longest trip. Feeds that list a hub's platforms as separate same-named stops (without a parent station) can have those merged too: *Merge stops with the same name within … m*, off by default since it changes the feed's data. Your agency settings stay as they are. A feed imported through the Project panel becomes a new test case instead (its routes as the Arrange model, a copy as the Expected one).
- **Import** (⤒ on the Project panel, or drop files on it) adds test cases to the open project: `.json` files, a generated submission zip (`act.txt` + `arrange.zip` + …), or a zip of several (*Generate all*, *Export all as JSON*, or a zipped folder of submissions). A name already in the project (ignoring case) gets the next free `_2`, `_3`, … suffix.

### Quick start

1. Open the editor and switch to the *Example Models* project (top left) to see how finished tests look, then back to *My tests* and press **+** on the Project panel for a new test case.
2. Build the **Arrange** model: add stations on the map, create lines and add their stops in order, check the calendar dates.
3. Fill in the **agency phone number and calendar dates you were assigned**. The phone starts empty, and Generate is blocked until you fill it in.
4. Write the **Act** (first line: method name, second line: parameters separated by `;`).
5. Set the **Expected result**: either an exception name, or copy the arrange model and edit it to the state after the act.
6. Press **Generate**, unzip the download into your test directory, commit, submit, 💯 *profit*.

> [!TIP]
> Prefer XY coordinates (meters) while designing: they're what the map grid shows, and radii in `CLOSE_AREA` are meters too. The generated `stops.txt` always contains the equivalent GPS coordinates.

### Browser support

Any current Chrome, Edge or Firefox, and Safari 16.4+.

## 🛠️ Development

The editor is **Vue 3 + TypeScript**, built with **Vite**, styled with **Tailwind CSS** and **shadcn-vue** components. It needs Node 22.12 or newer (22, 24 or 26 LTS):

```
npm install
npm run dev        # http://localhost:5173, reloads on save
npm test           # the test suite (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

The built `dist/` must be served over http (ES modules don't load from `file://`).

**Tests** (`tests/`): every example must validate, survive a JSON round trip and generate; `feed.test.ts` covers importing from a real-world-style GTFS feed, `storage.test.ts` the browser storage (on an in-memory IndexedDB). If you keep real, accepted submissions in a local `submitted-tests/` folder (one directory per test with `act.txt`, `arrange.zip`, …), each one is also imported, regenerated and compared with the original. That folder is gitignored and never enters the Docker image.

**Examples** (`examples/`): the *Example Models* project, as plain test-case `.json` files (exactly what Export JSON produces). They are bundled at build time, so adding one means committing the file and redeploying; browsers that already have the project see it after *Reset Example Models*.

### Hosting

**Recommended: the included `Dockerfile`** (built for Coolify, works anywhere Docker does). It builds the editor and serves `dist/` with nginx (`deploy/nginx.conf`). In Coolify: add the repo as an application, choose *Dockerfile* as the build pack, set the port to 80.

Any static file server works too: run `npm run build` and serve `dist/`. The build uses relative paths, so it can live under any URL path. Serve it over https (or localhost): the storage widget's quota and *keep my data* need a secure context.

### The look: IntelliJ "Islands"

The editor is styled after JetBrains IDEs (IntelliJ IDEA 2025.3+): rounded tool-window islands on the window background, tool-window stripes on the edges, editor-style tabs, a status bar, Inter + JetBrains Mono. All colors come from JetBrains' theme files in intellij-community (`platform/platform-resources/src/themes/islands/ManyIslands{Light,Dark}.theme.json`); see `src/style.css`.

### Where to look for what

| Vue concept | Where |
|---|---|
| Single-file components (`<script setup>`, `<template>`, scoped `<style>`) | `src/components/*.vue`, start with `ProblemsPanel.vue` (one of the smallest) |
| Props, `v-for`, `v-if`, `v-model` | `StationCard.vue`, `TestPanel.vue` |
| `computed` with a getter **and** setter | `CalendarCard.vue` (days), `ActEditor.vue` (method) |
| Shared state without a library ("store") | `src/composables/useEditor.ts` (module-level `ref`s), `useProject.ts` (projects and files on top of it) |
| Watchers, debouncing, undo history | `useEditor.ts`: a deep `watch` and `useDebounceFn` (VueUse); steps share unchanged pieces in `lib/history.ts` |
| Template refs and `defineExpose` | `MapPane.vue` calls `map.fit()` exposed by `MapView.vue` |
| Drawing on a canvas from reactive state | `MapView.vue`: what to draw is `computed` from the store; `draw()` runs in a `watchEffect` |
| Promise-based dialog | `useConfirm.ts` + `ConfirmDialog.vue`: `if (await confirmDialog('…'))` |
| Owning shadcn code | `src/components/ui/` is generated code you can edit; `resizable/ResizablePanel.vue` has a local fix |

The non-UI logic lives in `src/lib/` as plain typed modules (no Vue in them except the language `ref` in `i18n.ts`): the model and validation, GTFS import/export, submissions (reading zips, Generate all), browser storage, zip, CSV and the act.txt methods.

## Repo layout

- `src/`: the editor (`components/`, `composables/` for state, `lib/` for the logic without UI)
- `examples/`: the built-in examples
- `tests/`: the test suite
- `Dockerfile` + `deploy/nginx.conf`: the container that builds and serves the editor
- `docs/`: images for this README

## Extra resources

- [GTFS reference](https://gtfs.org/documentation/schedule/reference/)
