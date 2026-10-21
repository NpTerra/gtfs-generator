// Application state and wiring: toolbar, tabs, import/export/generate, autosave.
(function () {
    const G = globalThis.GTG;
    const M = G.model;
    const t = (key, params) => G.i18n.t(key, params);

    const AUTOSAVE_KEY = "gtfs-test-editor-autosave";

    const app = {
        state: {
            tc: null,
            tab: "arrange",       // which model the map + sidebar edit
            selection: null,      // selected station id (of the active model)
            pickLine: null        // line that map clicks append stops to
        },

        canEdit() {
            return !(this.state.tab === "expected" && this.state.tc.expected.type === "exception");
        },

        editableModel() {
            return this.state.tab === "expected" ? this.state.tc.expected.model : this.state.tc.arrange;
        },

        // light update: something changed that doesn't affect sidebar structure
        touch() {
            G.mapview.render();
            this.renderValidation();
            autosave();
        },

        // heavy update: rebuild the whole sidebar too
        structure() {
            if (!this.editableModel().lines.includes(this.state.pickLine)) this.state.pickLine = null;
            G.sidebar.render(this);
            G.mapview.render();
            this.renderValidation();
            renderBanner();
            document.getElementById("btn-add-station").disabled = !this.canEdit();
            commit(); // discrete action: undoable right away, unlike debounced typing
        },

        addStation(x, y) {
            const model = this.editableModel();
            const id = M.nextId(model.stations);
            model.stations.push(M.makeStation(id, M.nextStationName(model.stations), x, y));
            this.state.selection = id;
            this.structure();
        },

        // line: start appending map-clicked stations to it; null: stop
        setPickLine(line) {
            this.state.pickLine = line;
            this.structure();
        },

        refreshSelection() {
            document.querySelectorAll("#model-body .card.selected")
                .forEach(c => c.classList.remove("selected"));
            if (this.state.selection !== null)
                document.getElementById("station-card-" + this.state.selection)
                    ?.classList.add("selected");
            G.mapview.render();
        },

        setTab(tab) {
            const changed = this.state.tab !== tab;
            this.state.tab = tab;
            if (changed) { this.state.selection = null; this.state.pickLine = null; }
            document.querySelectorAll("#model-tabs .tab").forEach(b =>
                b.classList.toggle("active", b.dataset.tab === tab));
            this.structure();
            // keep the viewport stable (comparing Arrange/Expected at the same
            // zoom is useful); only fit if the shown model is fully off-screen
            if (changed) G.mapview.ensureVisible();
        },

        // ---- referential integrity helpers (used by the sidebar) ----------

        changeStationId(model, station, newId) {
            if (newId === station.id) return true;
            if (model.stations.some(s => s !== station && s.id === newId)) {
                toast(t("toast.idTakenStation", { id: newId }), true);
                return false;
            }
            const oldId = station.id;
            station.id = newId;
            for (const line of model.lines)
                for (const stop of line.stops)
                    if (stop.stationId === oldId) stop.stationId = newId;
            if (this.state.selection === oldId) this.state.selection = newId;
            this.structure();
            return true;
        },

        changeLineId(model, line, newId) {
            if (newId === line.id) return true;
            if (model.lines.some(l => l !== line && l.id === newId)) {
                toast(t("toast.idTakenLine", { id: newId }), true);
                return false;
            }
            const oldId = line.id;
            line.id = newId;
            for (const trip of model.trips)
                if (trip.line === oldId) trip.line = newId;
            this.structure();
            return true;
        },

        changeCalendarId(model, calendar, newId) {
            if (newId === calendar.id) return true;
            if (model.calendars.some(c => c !== calendar && c.id === newId)) {
                toast(t("toast.idTakenCalendar", { id: newId }), true);
                return false;
            }
            const oldId = calendar.id;
            calendar.id = newId;
            for (const trip of model.trips)
                if (trip.service === oldId) trip.service = newId;
            this.structure();
            return true;
        },

        deleteStation(model, station) {
            const uses = model.lines.reduce(
                (n, l) => n + l.stops.filter(s => s.stationId === station.id).length, 0);
            if (uses > 0 && !confirm(t("dlg.deleteStation", { name: station.name, id: station.id, n: uses })))
                return;
            for (const line of model.lines)
                line.stops = line.stops.filter(s => s.stationId !== station.id);
            model.stations.splice(model.stations.indexOf(station), 1);
            if (this.state.selection === station.id) this.state.selection = null;
            this.structure();
        },

        deleteLine(model, line) {
            const uses = model.trips.filter(trip => trip.line === line.id).length;
            if (uses > 0 && !confirm(t("dlg.deleteLine", { name: line.name, id: line.id, n: uses })))
                return;
            model.trips = model.trips.filter(trip => trip.line !== line.id);
            model.lines.splice(model.lines.indexOf(line), 1);
            this.structure();
        },

        renderValidation() {
            const problems = M.validate(this.state.tc);
            const errors = problems.filter(p => p.level === "error").length;
            const warnings = problems.length - errors;

            const chip = document.getElementById("status-chip");
            chip.setAttribute("aria-label", `${errors} errors, ${warnings} warnings`);
            const icon = G.sidebar.icon;
            if (errors > 0) {
                chip.className = "chip error";
                chip.replaceChildren(icon("error"), String(errors));
            } else if (warnings > 0) {
                chip.className = "chip warn";
                chip.replaceChildren(icon("warning"), String(warnings));
            } else {
                chip.className = "chip ok";
                chip.replaceChildren(icon("check"));
            }

            document.getElementById("problems-count").textContent = `(${problems.length})`;
            const body = document.getElementById("problems-body");
            if (body) {
                body.replaceChildren();
                if (problems.length === 0) {
                    const ok = document.createElement("div");
                    ok.className = "problem-none";
                    ok.append(icon("check"), t("problems.none"));
                    body.append(ok);
                } else {
                    for (const p of problems) {
                        const div = document.createElement("div");
                        div.className = "problem " + p.level;
                        div.append(icon(p.level === "error" ? "error" : "warning"), p.text);
                        body.append(div);
                    }
                }
            }
            return problems;
        }
    };

    // ---- autosave --------------------------------------------------------------

    // Every change funnels through commit(), directly or via the debounced
    // autosave(), so undo history is recorded there: a burst of typing
    // becomes a single undo step.

    const history = { undo: [], redo: [], current: null };
    let autosaveTimer = null;

    function autosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(commit, 300);
    }

    function commit() {
        clearTimeout(autosaveTimer);
        const json = M.toJSON(app.state.tc);
        if (json === history.current) return;
        if (history.current !== null) {
            history.undo.push(history.current);
            if (history.undo.length > 100) history.undo.shift();
            history.redo = [];
        }
        history.current = json;
        updateHistoryButtons();
        try { localStorage.setItem(AUTOSAVE_KEY, json); }
        catch { /* storage full / disabled */ }
    }

    function stepHistory(from, to) {
        commit(); // a pending edit becomes undoable first
        if (from.length === 0) return;
        to.push(history.current);
        history.current = from.pop();
        app.state.tc = M.fromJSON(history.current);
        app.state.selection = null;
        app.structure();
        updateHistoryButtons();
        try { localStorage.setItem(AUTOSAVE_KEY, history.current); } catch { }
    }

    const undo = () => stepHistory(history.undo, history.redo);
    const redo = () => stepHistory(history.redo, history.undo);

    function updateHistoryButtons() {
        document.getElementById("btn-undo").disabled = history.undo.length === 0;
        document.getElementById("btn-redo").disabled = history.redo.length === 0;
    }

    function renderBanner() {
        const banner = document.getElementById("map-banner");
        const line = app.state.pickLine;
        banner.hidden = !line;
        if (line) banner.querySelector("span").textContent = t("map.picking", { name: line.name });
    }

    // ---- helpers ------------------------------------------------------------------

    function toast(message, isError) {
        const div = document.createElement("div");
        div.className = "toast" + (isError ? " error" : "");
        div.textContent = message;
        document.getElementById("toasts").append(div);
        setTimeout(() => div.remove(), isError ? 7000 : 4500);
    }

    function download(filename, data, mime) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mime ?? "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function loadTestCase(tc) {
        app.state.tc = tc;
        app.state.selection = null;
        app.state.pickLine = null;
        app.setTab("arrange");
        G.mapview.fit();
    }

    // ---- import ---------------------------------------------------------------------

    async function importFile(file) {
        try {
            if (file.name.toLowerCase().endsWith(".json")) {
                const tc = M.fromJSON(await file.text());
                if (!confirm(t("dlg.importConfirm", { name: tc.name }))) return;
                loadTestCase(tc);
                toast(t("toast.importedJson", { name: app.state.tc.name }));
                return;
            }

            const bytes = new Uint8Array(await file.arrayBuffer());
            const files = await G.zip.read(bytes);

            if (files["act.txt"] || files["arrange.zip"]) {
                // a full submission zip (act.txt + comment.txt + arrange.zip + assert.*)
                if (!confirm(t("dlg.importConfirm", { name: file.name }))) return;
                const dec = new TextDecoder();
                const text = (name) => files[name] ? dec.decode(files[name]).replace(/\r\n/g, "\n").replace(/\n+$/, "") : "";

                const tc = M.defaultTestCase();
                tc.name = file.name.replace(/\.zip$/i, "");
                tc.description = text("comment.txt");
                tc.act = text("act.txt");
                tc.arrange = M.emptyModel();
                tc.expected = { type: "model", exception: "INVALID_ARGUMENT", model: M.emptyModel() };

                if (files["arrange.zip"]) {
                    const inner = await G.zip.read(files["arrange.zip"]);
                    const { model, agency } = G.gtfs.importGTFS(inner);
                    tc.arrange = model;
                    if (agency) tc.agency = agency;
                }
                if (files["assert.txt"]) {
                    tc.expected.type = "exception";
                    tc.expected.exception = text("assert.txt");
                } else if (files["assert.zip"]) {
                    tc.expected.model = G.gtfs.importGTFS(await G.zip.read(files["assert.zip"])).model;
                }
                loadTestCase(tc);
                toast(t("toast.importedSubmission", { name: tc.name }));
                return;
            }

            if (files["stops.txt"]) {
                // a bare GTFS zip -> replace the model of the active tab
                const target = app.state.tab;
                if (!confirm(t("dlg.gtfsReplace", { target: target.toUpperCase() })))
                    return;
                const { model, agency } = G.gtfs.importGTFS(files);
                if (target === "expected") {
                    app.state.tc.expected.type = "model";
                    app.state.tc.expected.model = model;
                } else {
                    app.state.tc.arrange = model;
                    if (agency) app.state.tc.agency = agency;
                }
                app.state.selection = null;
                app.structure();
                G.mapview.fit();
                toast(t("toast.importedGtfs", { target }));
                return;
            }

            toast(t("toast.zipUnknown"), true);
        } catch (err) {
            console.error(err);
            toast(t("toast.importFailed", { msg: err.message }), true);
        }
    }

    // ---- example discovery ----------------------------------------------------------------
    // examples/*.json is enumerated at startup, so dropping a new file there
    // is enough; it appears on the next refresh. A browser cannot list a
    // directory on its own, so we ask the server:
    //   1) a directory listing of examples/ (nginx autoindex, python
    //      -m http.server, Caddy browse, ...), JSON or HTML
    //   2) an optional examples/index.json manifest, for servers that
    //      cannot list directories
    // Over file:// neither is possible; the File menu shows a hint instead.

    function cleanExampleNames(names) {
        const files = (Array.isArray(names) ? names : [])
            .filter(n => typeof n === "string")
            .map(n => decodeURIComponent(n.split("/").pop()))
            .filter(n => n.endsWith(".json") && n !== "index.json");
        return [...new Set(files)].sort();
    }

    async function discoverExampleFiles() {
        try {
            const res = await fetch("examples/", { headers: { "Accept": "application/json" } });
            if (res.ok) {
                let names;
                if ((res.headers.get("content-type") ?? "").includes("json")) {
                    // nginx autoindex_format json: [{ name, type }, ...]
                    names = (await res.json()).map(e => e?.name ?? e);
                } else {
                    names = [...(await res.text()).matchAll(/href="([^"?#]+\.json)"/gi)].map(m => m[1]);
                }
                const files = cleanExampleNames(names);
                if (files.length > 0) return files;
            }
        } catch { /* no directory listing */ }

        try {
            const res = await fetch("examples/index.json");
            if (res.ok) return cleanExampleNames(await res.json());
        } catch { /* no manifest either */ }

        return [];
    }

    async function populateExamples() {
        const list = document.getElementById("menu-examples");
        const hint = (key) => {
            const div = document.createElement("div");
            div.className = "menu-hint";
            div.dataset.i18n = key;
            div.textContent = t(key);
            list.append(div);
        };

        if (location.protocol === "file:") {
            hint("examples.serverNeeded");
            return;
        }

        const files = await discoverExampleFiles();
        const loaded = await Promise.all(files.map(async (file) => {
            try {
                const res = await fetch("examples/" + encodeURIComponent(file));
                if (!res.ok) throw new Error("HTTP " + res.status);
                return { file, data: JSON.parse(await res.text()) };
            } catch (err) {
                console.warn(`Skipping example ${file}:`, err);
                return null;
            }
        }));

        const examples = loaded.filter(Boolean);
        if (examples.length === 0) {
            hint("examples.none");
            return;
        }
        for (const e of examples) {
            const btn = document.createElement("button");
            btn.textContent = e.data?.name ?? e.file;
            btn.addEventListener("click", () => {
                closeMenu();
                if (!confirm(t("dlg.exampleConfirm"))) return;
                loadTestCase(M.fromJSON(JSON.stringify(e.data)));
                toast(t("toast.exampleLoaded", { name: app.state.tc.name }));
            });
            list.append(btn);
        }
    }

    function closeMenu() {
        document.getElementById("file-menu").open = false;
    }

    // ---- generate -----------------------------------------------------------------------

    function generate() {
        const tc = app.state.tc;

        // hard gate: the assigned phone number must be filled in
        if (M.isPhoneMissing(tc.agency)) {
            alert(t("popup.phone"));
            G.layout.show("test");
            const section = document.querySelector('details.section[data-id="agency"]');
            if (section) {
                section.open = true;
                section.scrollIntoView({ block: "nearest" });
            }
            document.querySelector('input[data-field="agency-phone"]')?.focus();
            return;
        }

        const problems = app.renderValidation();
        const errors = problems.filter(p => p.level === "error");
        if (errors.length > 0) {
            G.layout.show("problems");
            toast(t("toast.fixErrors", { n: errors.length }), true);
            return;
        }

        try {
            const files = G.gtfs.buildTestFiles(tc);
            const outer = G.zip.create(files);
            download(tc.name + ".zip", outer, "application/zip");
            toast(t("toast.generated", { name: tc.name }));
        } catch (err) {
            console.error(err);
            toast(t("toast.generateFailed", { msg: err.message }), true);
        }
    }

    // ---- boot ------------------------------------------------------------------------------

    function init() {
        G.layout.init();

        // map callbacks
        G.mapview.init({
            getTestCase: () => app.state.tc,
            getSelection: () => app.state.selection,
            getModel: () => app.canEdit() ? app.editableModel() : null,
            getGhostModel: () => app.state.tab === "expected" ? app.state.tc.arrange : null,
            getMapMessage: () => {
                if (app.state.tab === "expected" && app.state.tc.expected.type === "exception")
                    return t("map.exceptionMsg", { name: app.state.tc.expected.exception });
                return "";
            },
            canEdit: () => app.canEdit(),
            onSelect: (id) => {
                if (app.state.pickLine) {
                    M.appendStop(app.state.pickLine, id);
                    app.structure();
                    return;
                }
                app.state.selection = id;
                app.refreshSelection();
                const section = document.querySelector('details.section[data-id="stations"]');
                if (section) section.open = true;
                document.getElementById("station-card-" + id)
                    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            },
            onStationMoved: (station, x, y, committed) => {
                try { M.setStationXY(station, x, y); } catch { return; }
                // live-update the coordinate inputs without rebuilding the sidebar
                for (const key of ["a", "b"]) {
                    const input = document.querySelector(
                        `input[data-coord="${key}"][data-station-id="${station.id}"]`);
                    if (!input) continue;
                    input.value = station.coordMode === "gps"
                        ? M.round6(key === "a" ? station.lat : station.lon)
                        : M.round6(key === "a" ? station.x : station.y);
                }
                if (committed) { app.renderValidation(); commit(); }
            },
            onAddStation: (x, y) => app.addStation(x, y)
        });

        // toolbar
        const menu = document.getElementById("file-menu");
        document.addEventListener("click", (ev) => { if (!menu.contains(ev.target)) closeMenu(); });
        menu.querySelector(".menu-list").addEventListener("click", (ev) => {
            if (ev.target.closest("button")) closeMenu();
        });

        document.getElementById("btn-new").addEventListener("click", () => {
            if (confirm(t("dlg.newConfirm")))
                loadTestCase(M.defaultTestCase());
        });

        // language toggle: translated hints/messages, structural labels stay English
        const applyStaticTexts = () => {
            document.getElementById("map-hint").textContent = t("map.hint");
            document.querySelectorAll("#menu-examples [data-i18n]").forEach(o =>
                o.textContent = t(o.dataset.i18n));
            document.querySelectorAll("#lang-toggle button").forEach(b =>
                b.classList.toggle("active", b.dataset.lang === G.i18n.get()));
        };
        document.querySelectorAll("#lang-toggle button").forEach(btn =>
            btn.addEventListener("click", () => {
                G.i18n.set(btn.dataset.lang);
                applyStaticTexts();
                app.structure();
            }));
        applyStaticTexts();

        populateExamples();

        const fileInput = document.getElementById("file-input");
        document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
            if (fileInput.files.length > 0) importFile(fileInput.files[0]);
            fileInput.value = "";
        });

        document.getElementById("btn-export").addEventListener("click", () => {
            download(app.state.tc.name + ".json", M.toJSON(app.state.tc), "application/json");
        });

        document.getElementById("btn-generate").addEventListener("click", generate);

        document.getElementById("status-chip").addEventListener("click", () => G.layout.show("problems"));

        document.querySelectorAll("#model-tabs .tab").forEach(btn =>
            btn.addEventListener("click", () => app.setTab(btn.dataset.tab)));

        document.getElementById("btn-fit").addEventListener("click", () => G.mapview.fit());
        document.getElementById("btn-add-station").addEventListener("click", () => {
            const p = G.mapview.freeSpot();
            app.addStation(p.x, p.y);
        });
        document.getElementById("btn-undo").addEventListener("click", undo);
        document.getElementById("btn-redo").addEventListener("click", redo);
        document.getElementById("btn-pick-done").addEventListener("click", () => app.setPickLine(null));

        // shortcuts; while typing, the browser's own text undo etc. win (selects,
        // checkboxes and radios have no undo of their own, so ours applies there)
        document.addEventListener("keydown", (ev) => {
            if (ev.target.closest?.("textarea, input:not([type=checkbox], [type=radio], [type=color], [type=range], [type=button], [type=submit], [type=reset])")) return;
            const key = ev.key.toLowerCase();
            if ((ev.ctrlKey || ev.metaKey) && (key === "z" || key === "y")) {
                ev.preventDefault();
                if (key === "z" && !ev.shiftKey) undo(); else redo();
            } else if (key === "escape") {
                if (menu.open) { closeMenu(); menu.querySelector("summary").focus(); return; }
                app.state.selection = null;
                app.setPickLine(null);
            } else if ((key === "delete" || key === "backspace") && app.state.selection !== null && app.canEdit()) {
                const model = app.editableModel();
                const station = model.stations.find(s => s.id === app.state.selection);
                if (station) { ev.preventDefault(); app.deleteStation(model, station); }
            }
        });

        // restore autosaved work, otherwise start with the default test case
        let tc = null;
        try {
            const saved = localStorage.getItem(AUTOSAVE_KEY);
            if (saved) tc = M.fromJSON(saved);
        } catch { /* corrupted autosave */ }
        loadTestCase(tc ?? M.defaultTestCase());
    }

    G.app = app;
    document.addEventListener("DOMContentLoaded", init);
})();
