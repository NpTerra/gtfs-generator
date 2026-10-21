// Mapping between the editor's test-case model and GTFS txt/zip files.
// The output format mirrors the Java generator (RootMapper + GTFSModelWriter):
//   station 3  -> stop_id  "S3"
//   line 2     -> route_id "R2"
//   calendar 1 -> service_id "C1"
//   trip 4     -> trip_id  "T4"
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const { csv, zip, model: M } = G;

    // ---- model -> GTFS -----------------------------------------------------

    const COLS = {
        agency: [
            { key: "name", header: "agency_name" },
            { key: "url", header: "agency_url" },
            { key: "timezone", header: "agency_timezone" },
            { key: "language", header: "agency_lang" },
            { key: "phone", header: "agency_phone" }
        ],
        stops: [
            { key: "id", header: "stop_id" },
            { key: "name", header: "stop_name" },
            { key: "lat", header: "stop_lat" },
            { key: "lon", header: "stop_lon" }
        ],
        routes: [
            { key: "id", header: "route_id" },
            { key: "shortName", header: "route_short_name" },
            { key: "longName", header: "route_long_name" },
            { key: "type", header: "route_type" },
            { key: "color", header: "route_color" }
        ],
        trips: [
            { key: "routeId", header: "route_id" },
            { key: "serviceId", header: "service_id" },
            { key: "tripId", header: "trip_id" }
        ],
        calendar: [
            { key: "service", header: "service_id" },
            { key: "monday", header: "monday" },
            { key: "tuesday", header: "tuesday" },
            { key: "wednesday", header: "wednesday" },
            { key: "thursday", header: "thursday" },
            { key: "friday", header: "friday" },
            { key: "saturday", header: "saturday" },
            { key: "sunday", header: "sunday" },
            { key: "startDate", header: "start_date" },
            { key: "endDate", header: "end_date" }
        ],
        stopTimes: [
            { key: "trip", header: "trip_id" },
            { key: "arrival", header: "arrival_time" },
            { key: "departure", header: "departure_time" },
            { key: "stop", header: "stop_id" },
            { key: "sequence", header: "stop_sequence" }
        ]
    };

    const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

    function modelToGTFSFiles(model, agency, fallbackCalendars) {
        const stops = model.stations.map(s => ({
            id: "S" + s.id,
            name: s.name,
            lat: s.lat,
            lon: s.lon
        }));

        const routes = model.lines.map(l => ({
            id: "R" + l.id,
            shortName: l.shortName,
            longName: l.name,
            type: l.type,
            color: String(l.color ?? "").replace(/^#/, "").toUpperCase()
        }));

        const trips = model.trips.map(t => ({
            routeId: "R" + t.line,
            serviceId: "C" + t.service,
            tripId: "T" + t.id
        }));

        const calendarSource = model.calendars.length > 0 ? model.calendars : (fallbackCalendars ?? []);
        const calendars = calendarSource.map(c => {
            const row = { service: "C" + c.id };
            DAYS.forEach((day, i) => row[day] = c.availability[i] ? 1 : 0);
            row.startDate = String(c.start).replaceAll("-", "");
            row.endDate = String(c.end).replaceAll("-", "");
            return row;
        });

        // same expansion as the Java generator: per line, per stop, per trip of that line
        const stopTimes = [];
        for (const line of model.lines) {
            line.stops.forEach((stop, i) => {
                for (const trip of model.trips) {
                    if (trip.line !== line.id) continue;
                    stopTimes.push({
                        trip: "T" + trip.id,
                        arrival: M.normalizeTime(stop.arrival) ?? "00:00:00",
                        departure: M.normalizeTime(stop.departure) ?? "00:00:00",
                        stop: "S" + stop.stationId,
                        sequence: i + 1
                    });
                }
            });
        }

        return [
            { name: "agency.txt", data: csv.write(COLS.agency, [agency]) },
            { name: "stops.txt", data: csv.write(COLS.stops, stops) },
            { name: "routes.txt", data: csv.write(COLS.routes, routes) },
            { name: "trips.txt", data: csv.write(COLS.trips, trips) },
            { name: "calendar.txt", data: csv.write(COLS.calendar, calendars) },
            { name: "stop_times.txt", data: csv.write(COLS.stopTimes, stopTimes) }
        ];
    }

    // Builds the four submission files. Returns [{name, data: string|Uint8Array}].
    function buildTestFiles(tc) {
        const files = [
            { name: "comment.txt", data: tc.description + "\n" },
            { name: "act.txt", data: tc.act + "\n" },
            {
                name: "arrange.zip",
                data: zip.create(modelToGTFSFiles(tc.arrange, tc.agency))
            }
        ];

        if (tc.expected.type === "exception") {
            files.push({ name: "assert.txt", data: tc.expected.exception + "\n" });
        } else {
            files.push({
                name: "assert.zip",
                data: zip.create(modelToGTFSFiles(tc.expected.model, tc.agency, tc.arrange.calendars))
            });
        }
        return files;
    }

    // ---- GTFS -> model (import) ---------------------------------------------

    function numericId(text, used) {
        const m = String(text ?? "").match(/^[A-Za-z]*0*(\d+)$/);
        let id = m ? parseInt(m[1], 10) : null;
        if (id === null || used.has(id)) {
            id = 1;
            while (used.has(id)) id++;
        }
        used.add(id);
        return id;
    }

    // filesMap: { "stops.txt": Uint8Array, ... }  ->  { model, agency }
    function importGTFS(filesMap) {
        const decoder = new TextDecoder();
        const table = (name) => {
            const data = filesMap[name];
            return data ? csv.parse(decoder.decode(data)) : [];
        };

        const model = M.emptyModel();
        let agency = null;

        const agencyRows = table("agency.txt");
        if (agencyRows.length > 0) {
            const a = agencyRows[0];
            agency = {
                name: a.agency_name ?? "",
                url: a.agency_url ?? "",
                timezone: a.agency_timezone ?? "",
                language: a.agency_lang ?? "",
                phone: a.agency_phone ?? ""
            };
        }

        const stationIds = new Map();     // "S1" -> 1
        const usedStationIds = new Set();
        for (const row of table("stops.txt")) {
            const id = numericId(row.stop_id, usedStationIds);
            stationIds.set(row.stop_id, id);
            const station = {
                id, name: row.stop_name ?? "", coordMode: "xy",
                x: 0, y: 0,
                lat: parseFloat(row.stop_lat) || 0,
                lon: parseFloat(row.stop_lon) || 0
            };
            M.syncFromGPS(station);
            station.x = M.round6(station.x);
            station.y = M.round6(station.y);
            M.syncFromXY(station);
            model.stations.push(station);
        }

        const lineIds = new Map();
        const usedLineIds = new Set();
        for (const row of table("routes.txt")) {
            const id = numericId(row.route_id, usedLineIds);
            lineIds.set(row.route_id, id);
            model.lines.push({
                id,
                name: row.route_long_name || row.route_short_name || ("Line " + id),
                shortName: row.route_short_name ?? "",
                color: "#" + (row.route_color || "000000").replace(/^#/, "").toUpperCase(),
                type: parseInt(row.route_type, 10) || 0,
                stops: []
            });
        }

        const calendarIds = new Map();
        const usedCalendarIds = new Set();
        const isoDate = (v) => /^\d{8}$/.test(v ?? "")
            ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
            : (v ?? "");
        for (const row of table("calendar.txt")) {
            const id = numericId(row.service_id, usedCalendarIds);
            calendarIds.set(row.service_id, id);
            model.calendars.push({
                id,
                start: isoDate(row.start_date),
                end: isoDate(row.end_date),
                availability: DAYS.map(d => row[d] === "1" ? 1 : 0)
            });
        }

        const tripIds = new Map();
        const usedTripIds = new Set();
        for (const row of table("trips.txt")) {
            const id = numericId(row.trip_id, usedTripIds);
            tripIds.set(row.trip_id, id);
            // barebones generators sometimes wrote "1" instead of "C1"; match leniently
            const parsed = parseInt(String(row.service_id).replace(/^\D*/, ""), 10);
            const service = calendarIds.get(row.service_id)
                ?? calendarIds.get("C" + row.service_id)
                ?? (Number.isNaN(parsed) ? 1 : parsed);
            model.trips.push({
                id,
                line: lineIds.get(row.route_id) ?? 0,
                service
            });
        }

        // stop_times: reconstruct each line's stop list from its first trip
        const byTrip = new Map();
        for (const row of table("stop_times.txt")) {
            if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, []);
            byTrip.get(row.trip_id).push(row);
        }
        for (const rows of byTrip.values())
            rows.sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10));

        for (const line of model.lines) {
            const trip = model.trips.find(t => t.line === line.id);
            if (!trip) continue;
            const originalTripId = [...tripIds.entries()].find(([, v]) => v === trip.id)?.[0];
            const rows = byTrip.get(originalTripId) ?? [];
            line.stops = rows.map(r => ({
                stationId: stationIds.get(r.stop_id) ?? 0,
                arrival: r.arrival_time ?? "",
                departure: r.departure_time ?? ""
            }));
        }

        return { model, agency };
    }

    G.gtfs = { modelToGTFSFiles, buildTestFiles, importGTFS, DAYS };
})();
