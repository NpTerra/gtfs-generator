// Test-case data model: defaults, coordinate sync, JSON (de)serialization, validation.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const { xyToGPS, gpsToXY } = G.geo;

    const KNOWN_EXCEPTIONS = [
        "INVALID_ARGUMENT",
        "AMBIGUOUS_STATION_NAMES",
        "RADIUS_TOO_SMALL",
        "TOO_MANY_LINE_FRAGMENTS",
        "TOO_MANY_SHORT_LINES",
        "LOOP_ON_LINE",
        "NOT_NEIGHBOR_STATIONS_IN_SELECTION"
    ];

    function round6(v) {
        return Math.round(v * 1e6) / 1e6;
    }

    // ---- station coordinate helpers -------------------------------------

    // A station always carries both coordinate systems; coordMode says which
    // one the user is editing (and which one is authoritative).
    function syncFromXY(station) {
        const gps = xyToGPS(station.x, station.y);
        station.lat = gps.lat;
        station.lon = gps.lon;
    }

    function syncFromGPS(station) {
        const xy = gpsToXY(station.lat, station.lon);
        station.x = xy.x;
        station.y = xy.y;
    }

    function makeStation(id, name, x, y) {
        const s = { id, name, coordMode: "xy", x, y, lat: 0, lon: 0 };
        syncFromXY(s);
        return s;
    }

    function setStationXY(station, x, y) {
        station.x = x;
        station.y = y;
        syncFromXY(station);
    }

    function setStationGPS(station, lat, lon) {
        station.lat = lat;
        station.lon = lon;
        syncFromGPS(station);
    }

    // ---- factories -------------------------------------------------------

    function emptyModel() {
        return { stations: [], lines: [], calendars: [], trips: [] };
    }

    function nextId(list) {
        return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    }

    function defaultTestCase() {
        const tc = {
            version: 1,
            name: "my_test",
            description: "Describe what this test verifies.",
            act: "CLOSE_AREA\nA;10",
            randomizeOffsets: true,
            agency: {
                name: "Your Transit Agency",
                url: "http://www.yourtransitagency.com",
                timezone: "America/New_York",
                language: "en",
                phone: ""
            },
            arrange: emptyModel(),
            expected: { type: "model", exception: "INVALID_ARGUMENT", model: emptyModel() }
        };

        tc.arrange.stations = [
            makeStation(1, "A", 0, 0),
            makeStation(2, "B", 10, 0),
            makeStation(3, "C", 20, 0)
        ];
        tc.arrange.lines = [{
            id: 1, name: "L1", shortName: "L1", color: "#AABBCC", type: 1,
            stops: [
                { stationId: 1, arrival: "08:00:00", departure: "08:00:00" },
                { stationId: 2, arrival: "08:00:00", departure: "08:00:00" },
                { stationId: 3, arrival: "08:00:00", departure: "08:00:00" }
            ]
        }];
        tc.arrange.calendars = [{
            id: 1, start: "2025-01-01", end: "2025-12-31",
            availability: [1, 1, 1, 1, 1, 1, 1]
        }];
        tc.arrange.trips = [{ id: 1, line: 1, service: 1 }];

        tc.expected.model = cloneModel(tc.arrange);
        return tc;
    }

    function cloneModel(model) {
        return JSON.parse(JSON.stringify(model));
    }

    // ---- time helpers ------------------------------------------------------

    // Accepts "8:00", "08:00", "8:00:00", "26:05:00" (GTFS allows hours > 23).
    // Returns normalized "HH:MM:SS" or null if invalid.
    function normalizeTime(value) {
        if (value === null || value === undefined) return "00:00:00";
        const s = String(value).trim();
        if (s === "") return "00:00:00";
        const m = s.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
        if (!m) return null;
        const pad = (v) => String(v).padStart(2, "0");
        return `${pad(m[1])}:${pad(m[2])}:${pad(m[3] ?? 0)}`;
    }

    function isValidDate(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
    }

    // ---- JSON import/export ------------------------------------------------

    function toJSON(tc) {
        const mapStation = (s) => {
            const out = { id: s.id, name: s.name, coordMode: s.coordMode };
            if (s.coordMode === "gps") {
                out.lat = s.lat;
                out.lon = s.lon;
            } else {
                out.x = s.x;
                out.y = s.y;
            }
            return out;
        };
        const mapModel = (m) => ({
            stations: m.stations.map(mapStation),
            lines: m.lines.map(l => ({
                id: l.id, name: l.name, shortName: l.shortName,
                color: l.color, type: l.type,
                stops: l.stops.map(st => ({
                    stationId: st.stationId, arrival: st.arrival, departure: st.departure
                }))
            })),
            calendars: m.calendars.map(c => ({
                id: c.id, start: c.start, end: c.end, availability: [...c.availability]
            })),
            trips: m.trips.map(t => ({ id: t.id, line: t.line, service: t.service }))
        });

        const out = {
            version: 1,
            name: tc.name,
            description: tc.description,
            act: tc.act,
            randomizeOffsets: tc.randomizeOffsets,
            agency: { ...tc.agency },
            arrange: mapModel(tc.arrange),
            expected: tc.expected.type === "exception"
                ? { type: "exception", exception: tc.expected.exception }
                : { type: "model", model: mapModel(tc.expected.model) }
        };
        return JSON.stringify(out, null, 2);
    }

    function num(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    function fromJSON(text) {
        const raw = JSON.parse(text);
        if (typeof raw !== "object" || raw === null)
            throw new Error("Not a test-case file.");

        const readStation = (s) => {
            const station = {
                id: num(s.id, 0),
                name: String(s.name ?? ""),
                coordMode: s.coordMode === "gps" ? "gps" : "xy",
                x: 0, y: 0, lat: 0, lon: 0
            };
            if (station.coordMode === "gps") {
                station.lat = num(s.lat, 0);
                station.lon = num(s.lon, 0);
                syncFromGPS(station);
            } else {
                station.x = num(s.x, 0);
                station.y = num(s.y, 0);
                syncFromXY(station);
            }
            return station;
        };
        const readModel = (m) => {
            m = m ?? {};
            return {
                stations: (m.stations ?? []).map(readStation),
                lines: (m.lines ?? []).map(l => ({
                    id: num(l.id, 0),
                    name: String(l.name ?? ""),
                    shortName: String(l.shortName ?? ""),
                    color: String(l.color ?? "#000000"),
                    type: num(l.type, 1),
                    stops: (l.stops ?? []).map(st => ({
                        stationId: num(st.stationId, 0),
                        arrival: String(st.arrival ?? ""),
                        departure: String(st.departure ?? "")
                    }))
                })),
                calendars: (m.calendars ?? []).map(c => ({
                    id: num(c.id, 0),
                    start: String(c.start ?? ""),
                    end: String(c.end ?? ""),
                    availability: Array.from({ length: 7 }, (_, i) => (c.availability ?? [])[i] ? 1 : 0)
                })),
                trips: (m.trips ?? []).map(t => ({
                    id: num(t.id, 0), line: num(t.line, 0), service: num(t.service, 0)
                }))
            };
        };

        const expected = raw.expected ?? {};
        return {
            version: 1,
            name: String(raw.name ?? "unnamed_test"),
            description: String(raw.description ?? ""),
            act: String(raw.act ?? ""),
            randomizeOffsets: raw.randomizeOffsets !== false,
            agency: {
                name: String(raw.agency?.name ?? ""),
                url: String(raw.agency?.url ?? ""),
                timezone: String(raw.agency?.timezone ?? ""),
                language: String(raw.agency?.language ?? ""),
                phone: String(raw.agency?.phone ?? "")
            },
            arrange: readModel(raw.arrange),
            expected: {
                type: expected.type === "exception" ? "exception" : "model",
                exception: String(expected.exception ?? "INVALID_ARGUMENT"),
                model: readModel(expected.model)
            }
        };
    }

    // ---- validation ----------------------------------------------------------

    // translated text; falls back to the key if i18n isn't loaded
    const t = (key, params) => G.i18n ? G.i18n.t(key, params) : key;

    function isPhoneMissing(agency) {
        return !agency?.phone?.trim() || /123-456-7890/.test(agency.phone);
    }

    function validateModel(model, label, problems) {
        const stationIds = new Set();
        for (const s of model.stations) {
            if (stationIds.has(s.id))
                problems.push({ level: "error", text: t("v.dupStation", { label, id: s.id }) });
            stationIds.add(s.id);
            if (!s.name)
                problems.push({ level: "warning", text: t("v.stationNoName", { label, id: s.id }) });
        }

        const lineIds = new Set();
        for (const l of model.lines) {
            if (lineIds.has(l.id))
                problems.push({ level: "error", text: t("v.dupLine", { label, id: l.id }) });
            lineIds.add(l.id);
            if (l.stops.length < 2)
                problems.push({ level: "warning", text: t("v.fewStops", { label, name: l.name }) });
            l.stops.forEach((st, i) => {
                if (!stationIds.has(st.stationId))
                    problems.push({ level: "error", text: t("v.stopMissingStation", { label, name: l.name, n: i + 1, id: st.stationId }) });
                if (normalizeTime(st.arrival) === null)
                    problems.push({ level: "error", text: t("v.badArrival", { label, name: l.name, n: i + 1, time: st.arrival }) });
                if (normalizeTime(st.departure) === null)
                    problems.push({ level: "error", text: t("v.badDeparture", { label, name: l.name, n: i + 1, time: st.departure }) });
            });
        }

        const calendarIds = new Set();
        for (const c of model.calendars) {
            if (calendarIds.has(c.id))
                problems.push({ level: "error", text: t("v.dupCalendar", { label, id: c.id }) });
            calendarIds.add(c.id);
            if (!isValidDate(c.start) || !isValidDate(c.end))
                problems.push({ level: "error", text: t("v.badDates", { label, id: c.id }) });
        }

        const tripIds = new Set();
        for (const trip of model.trips) {
            if (tripIds.has(trip.id))
                problems.push({ level: "error", text: t("v.dupTrip", { label, id: trip.id }) });
            tripIds.add(trip.id);
            if (!lineIds.has(trip.line))
                problems.push({ level: "error", text: t("v.tripMissingLine", { label, id: trip.id, line: trip.line }) });
        }

        for (const l of model.lines) {
            if (l.stops.length > 0 && !model.trips.some(trip => trip.line === l.id))
                problems.push({ level: "warning", text: t("v.lineNoTrips", { label, name: l.name }) });
        }

        return { calendarIds, tripsNeedingCalendars: model.trips };
    }

    function validate(tc) {
        const problems = [];

        if (!tc.name || !/^[A-Za-z0-9_\-. ]+$/.test(tc.name))
            problems.push({ level: "error", text: t("v.badName") });
        if (!tc.description?.trim())
            problems.push({ level: "warning", text: t("v.noDescription") });
        if (!tc.act?.trim())
            problems.push({ level: "error", text: t("v.noAct") });
        if (isPhoneMissing(tc.agency))
            problems.push({ level: "warning", text: t("v.phone") });

        const arrangeInfo = validateModel(tc.arrange, "Arrange", problems);
        for (const trip of tc.arrange.trips) {
            if (!arrangeInfo.calendarIds.has(trip.service))
                problems.push({ level: "error", text: t("v.tripMissingCalendar", { label: "Arrange", id: trip.id, service: trip.service }) });
        }

        if (tc.expected.type === "exception") {
            if (!tc.expected.exception?.trim())
                problems.push({ level: "error", text: t("v.noException") });
        } else {
            const expectedInfo = validateModel(tc.expected.model, "Expected", problems);
            // expected model may borrow the arrange calendars when it has none
            const effectiveCalendars = tc.expected.model.calendars.length > 0
                ? expectedInfo.calendarIds
                : arrangeInfo.calendarIds;
            for (const trip of tc.expected.model.trips) {
                if (!effectiveCalendars.has(trip.service))
                    problems.push({ level: "error", text: t("v.tripMissingCalendar", { label: "Expected", id: trip.id, service: trip.service }) });
            }
        }

        return problems;
    }

    G.model = {
        KNOWN_EXCEPTIONS,
        round6,
        makeStation, setStationXY, setStationGPS, syncFromXY, syncFromGPS,
        emptyModel, nextId, defaultTestCase, cloneModel,
        normalizeTime, isValidDate, isPhoneMissing,
        toJSON, fromJSON,
        validate
    };
})();
