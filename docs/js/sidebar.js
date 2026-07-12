// Sidebar: form editors for the test case and for the model of the active tab.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const M = G.model;
    const t = (key, params) => G.i18n.t(key, params);

    const ROUTE_TYPES = [
        [0, "0 - Tram / light rail"],
        [1, "1 - Subway / metro"],
        [2, "2 - Rail"],
        [3, "3 - Bus"],
        [4, "4 - Ferry"],
        [5, "5 - Cable tram"],
        [6, "6 - Aerial lift"],
        [7, "7 - Funicular"],
        [11, "11 - Trolleybus"],
        [12, "12 - Monorail"]
    ];

    const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

    // remembers which <details> sections are open across re-renders
    const openSections = new Set(["test", "stations", "lines", "expected", "problems"]);

    function h(tag, props, ...children) {
        const node = document.createElement(tag);
        if (props) {
            for (const [k, v] of Object.entries(props)) {
                if (v === undefined || v === null) continue;
                if (k === "class") node.className = v;
                else if (k === "dataset") Object.assign(node.dataset, v);
                else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
                else if (["checked", "value", "disabled", "selected", "hidden"].includes(k)) node[k] = v;
                else node.setAttribute(k, v);
            }
        }
        for (const c of children.flat(Infinity)) {
            if (c === null || c === undefined || c === false) continue;
            node.append(c instanceof Node ? c : document.createTextNode(c));
        }
        return node;
    }

    function section(id, title, count, ...body) {
        const details = h("details", { class: "section", dataset: { id } },
            h("summary", null,
                title,
                count !== null ? h("span", { class: "count" }, `(${count})`) : null,
                h("span", { class: "spacer" })
            ),
            h("div", { class: "section-body" }, ...body)
        );
        details.open = openSections.has(id);
        details.addEventListener("toggle", () => {
            if (details.open) openSections.add(id);
            else openSections.delete(id);
        });
        return details;
    }

    function field(labelText, control, hint, hintClass) {
        return h("div", { class: "field" },
            labelText ? h("label", null, labelText) : null,
            control,
            hint ? h("div", { class: "hint" + (hintClass ? " " + hintClass : "") }, hint) : null
        );
    }

    // ---- sections ------------------------------------------------------------

    function testSection(app) {
        const tc = app.state.tc;
        return section("test", "Test", null,
            field("Name", h("input", {
                type: "text", value: tc.name,
                oninput: (e) => { tc.name = e.target.value; app.touch(); }
            }), t("hint.testName")),
            field("Description (comment.txt)", h("textarea", {
                value: tc.description, rows: 3,
                oninput: (e) => { tc.description = e.target.value; app.touch(); }
            }), t("hint.description")),
            field("Act (act.txt)", h("textarea", {
                class: "mono", value: tc.act, rows: 3,
                oninput: (e) => { tc.act = e.target.value; app.touch(); }
            }), t("hint.act")),
            h("label", { class: "row", style: "cursor:pointer" },
                h("input", {
                    type: "checkbox", checked: tc.randomizeOffsets, style: "width:auto",
                    onchange: (e) => { tc.randomizeOffsets = e.target.checked; app.touch(); }
                }),
                h("span", null, "Randomize GPS offsets on generate"),
            ),
            h("div", { class: "hint" }, t("hint.randomize"))
        );
    }

    function agencySection(app) {
        const a = app.state.tc.agency;
        const bind = (key) => (e) => { a[key] = e.target.value; app.touch(); };
        return section("agency", "Agency", null,
            field("Name", h("input", { type: "text", value: a.name, oninput: bind("name") })),
            field("URL", h("input", { type: "text", value: a.url, oninput: bind("url") })),
            h("div", { class: "row" },
                field("Timezone", h("input", { type: "text", value: a.timezone, oninput: bind("timezone") })),
                field("Language", h("input", { type: "text", value: a.language, oninput: bind("language") }))
            ),
            field("Phone", h("input", {
                type: "text", value: a.phone, dataset: { field: "agency-phone" }, oninput: bind("phone")
            }), M.isPhoneMissing(a) ? t("hint.phone") : null, "warn")
        );
    }

    function stationsSection(app) {
        const model = app.editableModel();
        const cards = model.stations.map(s => stationCard(app, model, s));
        return section("stations", "Stations", model.stations.length,
            h("div", { class: "card-list" }, cards),
            h("button", {
                class: "small accent add-btn",
                onclick: () => {
                    const id = M.nextId(model.stations);
                    const station = M.makeStation(id, autoName(model.stations.length), 0, 0);
                    model.stations.push(station);
                    app.state.selection = id;
                    app.structure();
                }
            }, "+ Add station")
        );
    }

    function autoName(index) {
        let name = "";
        let n = index;
        do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
        return name;
    }

    function stationCard(app, model, s) {
        const isGPS = s.coordMode === "gps";

        const coordInput = (key) => h("input", {
            type: "number", step: "any",
            value: isGPS ? M.round6(key === "a" ? s.lat : s.lon) : M.round6(key === "a" ? s.x : s.y),
            dataset: { coord: key, stationId: s.id },
            oninput: (e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                try {
                    if (isGPS)
                        M.setStationGPS(s, key === "a" ? v : s.lat, key === "b" ? v : s.lon);
                    else
                        M.setStationXY(s, key === "a" ? v : s.x, key === "b" ? v : s.y);
                } catch { return; /* pole latitude etc. */ }
                app.touch();
            }
        });

        const modeBtn = (mode, label) => h("button", {
            class: mode === s.coordMode ? "active" : "",
            title: mode === "xy" ? "Edit as map coordinates (meters)" : "Edit as GPS coordinates (degrees)",
            onclick: () => { s.coordMode = mode; app.structure(); }
        }, label);

        return h("div", {
            class: "card" + (app.state.selection === s.id ? " selected" : ""),
            id: "station-card-" + s.id,
            onclick: () => {
                if (app.state.selection !== s.id) {
                    app.state.selection = s.id;
                    app.refreshSelection();
                }
            }
        },
            h("div", { class: "row" },
                h("input", {
                    class: "grow", type: "text", value: s.name, placeholder: "name",
                    oninput: (e) => { s.name = e.target.value; app.touch(); }
                }),
                h("span", { class: "badge", title: "stop_id in the generated files" }, "S" + s.id),
                h("input", {
                    type: "number", value: s.id, min: 0, style: "width:62px", title: "Station ID",
                    onchange: (e) => {
                        const newId = parseInt(e.target.value, 10);
                        if (!Number.isFinite(newId)) { e.target.value = s.id; return; }
                        if (!app.changeStationId(model, s, newId)) e.target.value = s.id;
                    }
                }),
                h("button", {
                    class: "icon danger", title: "Delete station",
                    onclick: (e) => {
                        e.stopPropagation();
                        app.deleteStation(model, s);
                    }
                }, "✕")
            ),
            h("div", { class: "row" },
                h("div", { class: "mode-toggle" }, modeBtn("xy", "XY"), modeBtn("gps", "GPS")),
                field(isGPS ? "lat (°)" : "x (m)", coordInput("a")),
                field(isGPS ? "lon (°)" : "y (m)", coordInput("b"))
            )
        );
    }

    function linesSection(app) {
        const model = app.editableModel();
        return section("lines", "Lines", model.lines.length,
            h("div", { class: "card-list" }, model.lines.map(l => lineCard(app, model, l))),
            h("button", {
                class: "small accent add-btn",
                onclick: () => {
                    const id = M.nextId(model.lines);
                    const palette = ["#AABBCC", "#FF00FF", "#00AA55", "#FF7700", "#3355FF", "#BB2222"];
                    model.lines.push({
                        id, name: "L" + id, shortName: "L" + id,
                        color: palette[(id - 1) % palette.length], type: 1, stops: []
                    });
                    app.structure();
                }
            }, "+ Add line")
        );
    }

    function lineCard(app, model, l) {
        const stationOptions = (selected) => model.stations.map(s =>
            h("option", { value: s.id, selected: s.id === selected }, `${s.name} (S${s.id})`));

        const stopRow = (stop, i) => h("div", { class: "stop-row" },
            h("select", {
                onchange: (e) => { stop.stationId = parseInt(e.target.value, 10); app.touch(); }
            }, stationOptions(stop.stationId)),
            h("input", {
                type: "text", class: "mono", value: stop.arrival, placeholder: "arr",
                title: "Arrival time (HH:MM:SS, empty = 00:00:00)",
                oninput: (e) => { stop.arrival = e.target.value; app.touch(); }
            }),
            h("input", {
                type: "text", class: "mono", value: stop.departure, placeholder: "dep",
                title: "Departure time (HH:MM:SS, empty = 00:00:00)",
                oninput: (e) => { stop.departure = e.target.value; app.touch(); }
            }),
            h("div", { class: "stop-actions" },
                h("button", {
                    class: "icon", title: "Move up", disabled: i === 0,
                    onclick: () => {
                        [l.stops[i - 1], l.stops[i]] = [l.stops[i], l.stops[i - 1]];
                        app.structure();
                    }
                }, "↑"),
                h("button", {
                    class: "icon", title: "Move down", disabled: i === l.stops.length - 1,
                    onclick: () => {
                        [l.stops[i + 1], l.stops[i]] = [l.stops[i], l.stops[i + 1]];
                        app.structure();
                    }
                }, "↓"),
                h("button", {
                    class: "icon danger", title: "Remove stop",
                    onclick: () => { l.stops.splice(i, 1); app.structure(); }
                }, "✕")
            )
        );

        return h("div", { class: "card" },
            h("div", { class: "row" },
                h("input", {
                    type: "color", class: "color-swatch", value: toColorValue(l.color),
                    title: "Line color",
                    oninput: (e) => { l.color = e.target.value.toUpperCase(); app.touch(); }
                }),
                h("input", {
                    type: "text", value: l.shortName, style: "width:74px", placeholder: "short",
                    title: "Short name (route_short_name)",
                    oninput: (e) => { l.shortName = e.target.value; app.touch(); }
                }),
                h("input", {
                    class: "grow", type: "text", value: l.name, placeholder: "long name",
                    title: "Long name (route_long_name)",
                    oninput: (e) => { l.name = e.target.value; app.touch(); }
                }),
                h("button", {
                    class: "icon danger", title: "Delete line",
                    onclick: () => app.deleteLine(model, l)
                }, "✕")
            ),
            h("div", { class: "row" },
                h("span", { class: "badge", title: "route_id in the generated files" }, "R" + l.id),
                h("input", {
                    type: "number", value: l.id, min: 0, style: "width:62px", title: "Line ID",
                    onchange: (e) => {
                        const newId = parseInt(e.target.value, 10);
                        if (!Number.isFinite(newId)) { e.target.value = l.id; return; }
                        if (!app.changeLineId(model, l, newId)) e.target.value = l.id;
                    }
                }),
                h("select", {
                    class: "grow", title: "Route type",
                    onchange: (e) => { l.type = parseInt(e.target.value, 10); app.touch(); }
                }, ROUTE_TYPES.map(([v, label]) =>
                    h("option", { value: v, selected: v === l.type }, label)))
            ),
            l.stops.length > 0
                ? h("div", { class: "stops-header" },
                    h("span", null, "Stops (in order)"), h("span", null, "arrival"), h("span", null, "departure"), h("span"))
                : h("div", { class: "hint" }, t("hint.noStops")),
            h("div", { class: "stops-list" }, l.stops.map((s, i) => stopRow(s, i))),
            h("button", {
                class: "small add-btn",
                disabled: model.stations.length === 0,
                onclick: () => {
                    const last = l.stops[l.stops.length - 1];
                    const usedIds = new Set(l.stops.map(st => st.stationId));
                    const next = model.stations.find(s => !usedIds.has(s.id)) ?? model.stations[0];
                    l.stops.push({
                        stationId: next.id,
                        arrival: last ? last.arrival : "08:00:00",
                        departure: last ? last.departure : "08:00:00"
                    });
                    app.structure();
                }
            }, "+ Add stop")
        );
    }

    function toColorValue(color) {
        return /^#[0-9a-fA-F]{6}$/.test(color ?? "") ? color : "#555555";
    }

    function calendarsSection(app) {
        const model = app.editableModel();
        const isExpected = app.state.tab === "expected";
        return section("calendars", "Calendars", model.calendars.length,
            isExpected && model.calendars.length === 0
                ? h("div", { class: "hint" }, t("hint.calendarsInherit"))
                : null,
            h("div", { class: "card-list" }, model.calendars.map(c => calendarCard(app, model, c))),
            h("button", {
                class: "small accent add-btn",
                onclick: () => {
                    model.calendars.push({
                        id: M.nextId(model.calendars),
                        start: "2025-01-01", end: "2025-12-31",
                        availability: [1, 1, 1, 1, 1, 1, 1]
                    });
                    app.structure();
                }
            }, "+ Add calendar")
        );
    }

    function calendarCard(app, model, c) {
        return h("div", { class: "card" },
            h("div", { class: "row" },
                h("span", { class: "badge", title: "service_id in the generated files" }, "C" + c.id),
                h("input", {
                    type: "number", value: c.id, min: 0, style: "width:62px", title: "Calendar ID",
                    onchange: (e) => {
                        const newId = parseInt(e.target.value, 10);
                        if (!Number.isFinite(newId)) { e.target.value = c.id; return; }
                        if (!app.changeCalendarId(model, c, newId)) e.target.value = c.id;
                    }
                }),
                h("input", {
                    type: "date", value: c.start, title: "Start date",
                    onchange: (e) => { c.start = e.target.value; app.touch(); }
                }),
                h("input", {
                    type: "date", value: c.end, title: "End date",
                    onchange: (e) => { c.end = e.target.value; app.touch(); }
                }),
                h("button", {
                    class: "icon danger", title: "Delete calendar",
                    onclick: () => { model.calendars.splice(model.calendars.indexOf(c), 1); app.structure(); }
                }, "✕")
            ),
            h("div", { class: "days" }, DAY_LABELS.map((label, i) =>
                h("label", null,
                    h("input", {
                        type: "checkbox", checked: !!c.availability[i],
                        onchange: (e) => { c.availability[i] = e.target.checked ? 1 : 0; app.touch(); }
                    }),
                    label)
            ))
        );
    }

    function tripsSection(app) {
        const model = app.editableModel();
        const tc = app.state.tc;
        // expected model may borrow arrange calendars
        const calendarSource = model.calendars.length > 0 ? model.calendars : tc.arrange.calendars;
        return section("trips", "Trips", model.trips.length,
            h("div", { class: "hint" }, t("hint.trips")),
            h("div", { class: "card-list" }, model.trips.map(t =>
                h("div", { class: "card" },
                    h("div", { class: "row" },
                        h("span", { class: "badge" }, "T" + t.id),
                        h("input", {
                            type: "number", value: t.id, min: 0, style: "width:56px", title: "Trip ID",
                            onchange: (e) => {
                                const v = parseInt(e.target.value, 10);
                                if (Number.isFinite(v)) { t.id = v; app.touch(); }
                            }
                        }),
                        h("select", {
                            class: "grow", title: "Line",
                            onchange: (e) => { t.line = parseInt(e.target.value, 10); app.touch(); }
                        },
                            model.lines.map(l => h("option", { value: l.id, selected: l.id === t.line }, `${l.name} (R${l.id})`)),
                            model.lines.some(l => l.id === t.line) ? null : h("option", { value: t.line, selected: true }, `missing R${t.line}`)
                        ),
                        h("select", {
                            class: "grow", title: "Calendar (service)",
                            onchange: (e) => { t.service = parseInt(e.target.value, 10); app.touch(); }
                        },
                            calendarSource.map(c => h("option", { value: c.id, selected: c.id === t.service }, `C${c.id} (${c.start})`)),
                            calendarSource.some(c => c.id === t.service) ? null : h("option", { value: t.service, selected: true }, `missing C${t.service}`)
                        ),
                        h("button", {
                            class: "icon danger", title: "Delete trip",
                            onclick: () => { model.trips.splice(model.trips.indexOf(t), 1); app.structure(); }
                        }, "✕")
                    )
                ))),
            h("button", {
                class: "small accent add-btn",
                disabled: model.lines.length === 0,
                onclick: () => {
                    model.trips.push({
                        id: M.nextId(model.trips),
                        line: model.lines[0]?.id ?? 1,
                        service: calendarSource[0]?.id ?? 1
                    });
                    app.structure();
                }
            }, "+ Add trip")
        );
    }

    function expectedSection(app) {
        const tc = app.state.tc;
        const exp = tc.expected;
        const isException = exp.type === "exception";

        return section("expected", "Expected result", null,
            h("div", { class: "radio-row" },
                h("label", null,
                    h("input", {
                        type: "radio", name: "expected-type", checked: !isException,
                        onchange: () => { exp.type = "model"; app.structure(); }
                    }),
                    "resulting model (assert.zip)"),
                h("label", null,
                    h("input", {
                        type: "radio", name: "expected-type", checked: isException,
                        onchange: () => { exp.type = "exception"; app.structure(); }
                    }),
                    "exception (assert.txt)")
            ),
            isException
                ? field("Exception name",
                    h("input", {
                        type: "text", class: "mono", value: exp.exception, list: "known-exceptions",
                        oninput: (e) => { exp.exception = e.target.value; app.touch(); }
                    }),
                    t("hint.exception"))
                : h("div", { class: "row" },
                    h("button", {
                        class: "small", title: "Overwrite the Expected model with a copy of the Arrange model",
                        onclick: () => {
                            if (exp.model.stations.length === 0 ||
                                confirm(t("dlg.copyArrange"))) {
                                exp.model = M.cloneModel(tc.arrange);
                                app.structure();
                            }
                        }
                    }, "⧉ Copy Arrange → Expected"),
                    h("button", {
                        class: "small accent",
                        onclick: () => app.setTab("expected")
                    }, "Edit expected model ➜")
                ),
            h("datalist", { id: "known-exceptions" },
                M.KNOWN_EXCEPTIONS.map(x => h("option", { value: x })))
        );
    }

    function problemsSection() {
        // content filled by app.renderValidation()
        return section("problems", "Problems", null, h("div", { id: "problems-body" }));
    }

    // ---- top-level render ----------------------------------------------------

    function render(app) {
        const sidebar = document.getElementById("sidebar");
        const scrollTop = sidebar.scrollTop;
        const tc = app.state.tc;
        const showModelSections = !(app.state.tab === "expected" && tc.expected.type === "exception");

        const parts = [testSection(app), agencySection(app)];

        if (app.state.tab === "expected")
            parts.push(h("div", { class: "editing-pill" }, t("pill.expected")));

        if (showModelSections)
            parts.push(stationsSection(app), linesSection(app), calendarsSection(app), tripsSection(app));

        parts.push(expectedSection(app), problemsSection());

        sidebar.replaceChildren(...parts);
        sidebar.scrollTop = scrollTop;
    }

    G.sidebar = { render };
})();
