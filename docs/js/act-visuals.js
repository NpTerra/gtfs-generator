// Visual aids for act.txt methods, drawn on the map.
//
// HOW TO ADD A NEW METHOD (teachers invent new ones every year):
// add one entry to HANDLERS below. The key is the method name, i.e. the first
// line of act.txt (matched in UPPERCASE). The handler receives one object:
//
//   params   the second line of act.txt, split on ';' (trimmed strings)
//   rest     any further lines of act.txt (array of trimmed strings)
//   model    the model currently shown on the map ({stations, lines, ...})
//   overlay  drawing helpers that resolve names in that model:
//       overlay.circleAround(stationName, radiusMeters)
//           dashed circle with a light fill around every station with that name
//       overlay.markStation(stationName)
//           dashed ring around every station with that name
//       overlay.highlightLine(lineName)
//           draws that line thicker with a glow (matches short or long name)
//
// Unknown methods, unresolvable names and thrown errors are all ignored, so a
// half-typed act.txt can never break the map. Example of a future method:
//
//   RENAME_STATION({ params, overlay }) {
//       overlay.markStation(params[0]);   // act.txt: RENAME_STATION \n Old;New
//   },
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});

    const HANDLERS = {
        CLOSE_AREA({ params, rest, overlay }) {
            overlay.circleAround(params[0], parseFloat(params[1]));
            for (const name of rest.flatMap(line => line.split(";")))
                overlay.highlightLine(name);
        },

        DIVERT_LINE({ params, overlay }) {
            overlay.highlightLine(params[0]);
            for (const name of params.slice(1))
                overlay.markStation(name);
        }
    };

    function parseAct(act) {
        const lines = String(act ?? "").split("\n").map(s => s.trim()).filter(s => s !== "");
        if (lines.length === 0) return null;
        return {
            method: lines[0].toUpperCase(),
            params: (lines[1] ?? "").split(";").map(s => s.trim()).filter(s => s !== ""),
            rest: lines.slice(2)
        };
    }

    // Returns what the map renderer consumes:
    // { circles: [{x, y, r}], ringStationIds: Set<number>, lineNames: Set<string lowercased> }
    function compute(model, act) {
        const info = { circles: [], ringStationIds: new Set(), lineNames: new Set() };
        const parsed = parseAct(act);
        if (!parsed || !HANDLERS[parsed.method]) return info;

        const overlay = {
            circleAround(stationName, radiusMeters) {
                if (!stationName || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return;
                for (const s of model.stations)
                    if (s.name === stationName)
                        info.circles.push({ x: s.x, y: s.y, r: radiusMeters });
            },
            markStation(stationName) {
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
            HANDLERS[parsed.method]({ params: parsed.params, rest: parsed.rest, model, overlay });
        } catch { /* a visual aid must never break rendering */ }
        return info;
    }

    G.actVisuals = { compute, HANDLERS };
})();
