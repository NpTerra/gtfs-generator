// act.txt methods: their parameters (drive the Act form in the sidebar) and
// their visual aids on the map.
//
// HOW TO ADD A NEW METHOD (teachers invent new ones every year):
// add one entry to METHODS below. The key is the method name, i.e. the first
// line of act.txt (matched in UPPERCASE).
//
//   params   the fields of the second line of act.txt, in order (';'-separated):
//              { label, kind: "station" | "line" | "number" | "text", repeat? }
//            kind picks the suggestions and checks; repeat (last param only)
//            takes all remaining values, e.g. a list of stations
//   draw     optional; receives one object:
//              params   the second line of act.txt, split on ';' (trimmed strings)
//              rest     any further lines of act.txt (array of trimmed strings)
//              model    the model currently shown on the map ({stations, lines, ...})
//              overlay  drawing helpers that resolve names in that model:
//                  overlay.circleAround(stationName, radiusMeters)
//                      dashed circle with a light fill around every station with that name
//                  overlay.markStation(stationName)
//                      dashed ring around every station with that name
//                  overlay.highlightLine(lineName)
//                      draws that line thicker with a glow (matches short or long name)
//
// Unknown methods, unresolvable names and thrown errors are all ignored, so a
// half-typed act.txt can never break the map. Example of a future method:
//
//   RENAME_STATION: {
//       params: [{ label: "station", kind: "station" }, { label: "new name", kind: "text" }],
//       draw({ params, overlay }) { overlay.markStation(params[0]); }
//   },
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});

    const METHODS = {
        CLOSE_AREA: {
            params: [
                { label: "station", kind: "station" },
                { label: "radius (m)", kind: "number" }
            ],
            draw({ params, rest, overlay }) {
                overlay.circleAround(params[0], parseFloat(params[1]));
                for (const name of rest.flatMap(line => line.split(";")))
                    overlay.highlightLine(name);
            }
        },

        DIVERT_LINE: {
            params: [
                { label: "line", kind: "line" },
                { label: "new route (stations)", kind: "station", repeat: true }
            ],
            draw({ params, overlay }) {
                overlay.highlightLine(params[0]);
                for (const name of params.slice(1))
                    overlay.markStation(name);
            }
        }
    };

    // positional split, so an empty field keeps its place: "CLOSE_AREA\n;10";
    // blank lines are skipped
    function split(act) {
        const lines = String(act ?? "").split("\n").map(s => s.trim()).filter(s => s !== "");
        return {
            method: lines[0] ?? "",
            params: lines.length > 1 ? lines[1].split(";").map(s => s.trim()) : [],
            rest: lines.slice(2)
        };
    }

    function join({ method, params, rest }) {
        const p = [...params];
        while (p.length > 0 && p[p.length - 1] === "") p.pop();
        // all-empty params before more lines: ";" keeps the line from being blank (and skipped)
        return [method, ...(p.length > 0 || rest.length > 0 ? [p.join(";") || ";"] : []), ...rest].join("\n");
    }

    // the act's parameter values grouped per declared param: [{ param, values }]
    function fields(act) {
        const spec = METHODS[act.method.toUpperCase()];
        return (spec?.params ?? []).map((param, i) => ({
            param,
            values: param.repeat ? act.params.slice(i) : [act.params[i] ?? ""]
        }));
    }

    // Act parameters that don't resolve in the model: [{ key, params }] for i18n.
    // Callers report these as warnings, since invalid-argument tests use them on purpose.
    function check(actText, model) {
        const out = [];
        const stations = new Set(model.stations.map(s => s.name));
        const lines = new Set(model.lines.flatMap(l => [l.shortName, l.name]).map(n => String(n).toLowerCase()));
        for (const { param, values } of fields(split(actText))) {
            for (const v of values) {
                if (v === "")
                    out.push({ key: "v.actEmpty", params: { label: param.label } });
                else if (param.kind === "station" && !stations.has(v))
                    out.push({ key: "v.actNoStation", params: { name: v } });
                else if (param.kind === "line" && !lines.has(v.toLowerCase()))
                    out.push({ key: "v.actNoLine", params: { name: v } });
                else if (param.kind === "number" && !Number.isFinite(Number(v)))
                    out.push({ key: "v.actNotNumber", params: { label: param.label, value: v } });
            }
        }
        return out;
    }

    // Returns what the map renderer consumes:
    // { circles: [{x, y, r}], ringStationIds: Set<number>, lineNames: Set<string lowercased> }
    function compute(model, actText) {
        const info = { circles: [], ringStationIds: new Set(), lineNames: new Set() };
        const act = split(actText);
        const spec = METHODS[act.method.toUpperCase()];
        if (!spec?.draw) return info;

        const overlay = {
            circleAround(stationName, radiusMeters) {
                if (!stationName || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return;
                for (const s of model.stations)
                    if (s.name === stationName)
                        info.circles.push({ x: s.x, y: s.y, r: radiusMeters });
            },
            markStation(stationName) {
                if (!stationName) return;
                for (const s of model.stations)
                    if (s.name === stationName)
                        info.ringStationIds.add(s.id);
            },
            highlightLine(lineName) {
                const name = String(lineName ?? "").trim().toLowerCase();
                if (name) info.lineNames.add(name);
            }
        };

        try {
            spec.draw({ params: act.params, rest: act.rest, model, overlay });
        } catch { /* a visual aid must never break rendering */ }
        return info;
    }

    G.actVisuals = { METHODS, split, join, fields, check, compute };
})();
