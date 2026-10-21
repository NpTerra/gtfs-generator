# GTFS Test Generator

A visual tool for creating GTFS test cases (arrange / act / assert) for the Szoftech university assignment, so you don't have to hand-write `stops.txt`, `stop_times.txt` and friends.

## 🌐 Web editor (nothing to install)

Open the editor in your browser: use the hosted instance your instructor/maintainer provides, or serve the `web/` directory with any web server (see Hosting below). For a quick local run:

```
python -m http.server 8000 -d web
# then open http://localhost:8000/
```

Opening `web/index.html` directly from disk (`file://`) also works; the only thing missing there is the example list, which needs a server to enumerate the example files.

Everything runs locally in your browser; nothing is uploaded anywhere.

![The editor showing a real test case: a map with three colored lines and highlighted stations, next to a sidebar of editable settings](docs/screenshot.png)

### What it does

- **IDE-style layout**: Test case panel on the left, the Arrange/Expected model on the right, Problems under the map. Drag the dividers to resize (double-click resets), hide panels with the toolbar toggles; your layout is remembered. On phones the map stays pinned on top and the panels scroll below it.
- **Visual map** of your test network: lines are drawn in their colors, stations are draggable, double-click adds a station, scroll zooms.
- **Act preview**: a `CLOSE_AREA` radius is drawn as a dashed circle on the map, and the stations/line of a `DIVERT_LINE` call are highlighted, so you can *see* what your test affects.
- **Sidebar editors** for stations, lines (with ordered stops), calendars, trips, the agency and the act/description texts.
- **GPS ⇄ XY toggle per station**: place stations in meters on a grid (easy) or in real GPS coordinates; conversion matches the Java generator exactly.
- **Arrange / Expected tabs**: edit the before-model and the after-model separately, or pick an expected **exception** instead. "Copy Arrange → Expected" saves you from re-entering everything.
- **Undo / redo** (↶ ↷ in the map toolbar, or Ctrl+Z / Ctrl+Shift+Z outside text fields) for every change, imports included. Select a station and press Delete to remove it, Esc to deselect.
- **Pick stops on map**: on a line card, press *Pick stops on map* and click stations to append them as stops in order.
- **Faded Arrange under Expected**: on the Expected tab the Arrange model is drawn faded underneath, so you see exactly what your act changes.
- **Live validation**: duplicate IDs, missing references, bad times/dates etc. are listed in the Problems section before you generate anything.
- **One-file import/export**: the whole test case is saved as a single `.json` you can share or keep in your repo.
- **Generate**: downloads `<name>.zip` containing exactly what the grader wants:
  `comment.txt`, `act.txt`, `arrange.zip`, and `assert.zip` *or* `assert.txt`. Unzip it into your submission directory and you're done.
- **Random GPS offsets** (optional, on by default) shift all coordinates by a whole number of degrees on every generate, so identical station layouts still produce unique submissions. Relative distances are unaffected.
- **Examples built in**: *File → Load example* contains synthetic test cases modeled on real, accepted submissions (same transformations, different layouts). Use them to learn the format, then build your own.
- **Import old work**: besides `.json`, *File → Import…* also accepts a previously generated submission zip (`act.txt` + `arrange.zip` + …) or a bare GTFS zip, and reconstructs an editable test case from it.
- Your work is **autosaved** in the browser (localStorage), so an accidental refresh loses nothing.

### Quick start

1. Open the editor and pick an example under *File → Load example* to see how a finished test looks, or *File → New test case*.
2. Build the **Arrange** model: add stations on the map, create lines and add their stops in order, check the calendar dates.
3. Fill in the **agency phone number and calendar dates you were assigned**. The editor warns you until the phone placeholder is replaced.
4. Write the **Act** (first line: method name, second line: parameters separated by `;`).
5. Set the **Expected result**: either an exception name, or copy the arrange model and edit it to the state after the act.
6. Press **Generate**, unzip the download into your test directory, commit, submit, 💯 *profit*.

> [!TIP]
> Prefer XY coordinates (meters) while designing: they're what the map grid shows, and radii in `CLOSE_AREA` are meters too. The generated `stops.txt` always contains the equivalent GPS coordinates.

### Browser support

Any current Chrome, Edge or Firefox, and Safari 16.4+. (Importing zips made by other tools uses the browser's built-in `DecompressionStream`; generating works everywhere regardless.)

### Hosting

**Recommended: the included `Dockerfile`** (built for Coolify, works anywhere Docker does). It serves `web/` with nginx and already enables the directory listing that example auto-detection needs; `submitted-tests/` is never copied into the image. In Coolify: add the repo as an application, choose *Dockerfile* as the build pack, set the port to 80. Adding an example is then: commit a `.json` into `web/examples/`, redeploy, refresh.

If you serve `web/` some other way instead, two things to know:

- **Set the web root to `web/`, not the repo root.** Otherwise everything else in the repo becomes downloadable too (including `submitted-tests/` if you keep real submissions there).
- **Examples are auto-detected.** The editor discovers `examples/*.json` at startup, so dropping a new file into `web/examples/` shows up on the next refresh, if the server can list that directory. With nginx that means (see `deploy/nginx.conf`):

  ```nginx
  location /examples/ {
      autoindex on;
      autoindex_format json;
  }
  ```

  `python -m http.server` and Caddy's `file_server browse` list directories out of the box. If your server cannot list directories, add a `web/examples/index.json` manifest instead, a plain JSON array of file names: `["example1_closeAreaOneEnd.json", "..."]`. The editor tries the listing first and falls back to the manifest.


## Repo layout

- `web/`: the web editor (plain HTML/CSS/JS, no build step); serve this directory as the web root
- `web/examples/`: the *File → Load example* entries as plain test-case `.json` files (exactly what Export JSON produces). New files are picked up automatically on refresh; see Hosting.
- `Dockerfile` + `deploy/nginx.conf`: container serving `web/` with nginx, example auto-detection preconfigured (see Hosting)
- `tools/check.js`: the test suite. Validates every example and, if a local `submitted-tests/` folder exists, round-trips the generator against real submissions.
- `docs/`: images for this README (not served)

## Extra resources

- [GTFS reference](https://gtfs.org/documentation/schedule/reference/)
