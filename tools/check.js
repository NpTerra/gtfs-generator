// Test suite for the web editor (run with: node tools/check.js):
//
// 0) Every web/js file must parse, and the model/act helpers the editor
//    relies on get a few unit checks.
//
// 1) Validates every "Load example" entry in web/examples/*.json: it must
//    parse, pass validation without errors, generate cleanly, and survive a
//    JSON round trip. If an optional examples/index.json manifest exists, it
//    must list exactly the example files that are present.
//
// 2) If submitted-tests/ exists locally, uses it as a regression corpus:
//    every real submission is imported, serialized to JSON, regenerated, and
//    compared semantically with the original zips (a full round-trip).
//    The folder is optional and its content is never published.
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const WEB = path.join(REPO, "web");

for (const f of ["i18n.js", "geo.js", "csv.js", "zip.js", "model.js", "gtfs.js", "act-visuals.js"])
    eval(fs.readFileSync(path.join(WEB, "js", f), "utf8"));

const { csv, zip, model: M, gtfs, actVisuals: A } = globalThis.GTG;
const decoder = new TextDecoder();
let failures = 0;

function parseTable(filesMap, name) {
    return filesMap[name] ? csv.parse(decoder.decode(filesMap[name])) : [];
}

const normService = (v) => String(v ?? "").replace(/^C/, "");

function compareTables(label, name, origRows, genRows, problems) {
    const keyFns = {
        "agency.txt": r => JSON.stringify(r),
        "stops.txt": r => `${r.stop_id}|${r.stop_name}|${(+r.stop_lat).toFixed(9)}|${(+r.stop_lon).toFixed(9)}`,
        "routes.txt": r => `${r.route_id}|${r.route_short_name}|${r.route_long_name}|${+r.route_type}|${(r.route_color || "").toUpperCase()}`,
        "trips.txt": r => `${r.route_id}|${normService(r.service_id)}|${r.trip_id}`,
        "calendar.txt": r => `${normService(r.service_id)}|${r.monday}${r.tuesday}${r.wednesday}${r.thursday}${r.friday}${r.saturday}${r.sunday}|${r.start_date}|${r.end_date}`,
        "stop_times.txt": r => `${r.trip_id}|${r.arrival_time}|${r.departure_time}|${r.stop_id}|${+r.stop_sequence}`
    };
    const keyFn = keyFns[name];
    const orig = origRows.map(keyFn).sort();
    const gen = genRows.map(keyFn).sort();
    if (JSON.stringify(orig) !== JSON.stringify(gen)) {
        problems.push(`${label}/${name} mismatch:\n  orig: ${JSON.stringify(orig)}\n  gen : ${JSON.stringify(gen)}`);
    }
}

// ---- 1) validate the self-registering example files -----------------------

function checkExamples() {
    const dir = path.join(WEB, "examples");
    const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "index.json").sort()
        : [];
    if (files.length === 0) {
        console.log("FAIL: no web/examples/*.json found");
        failures++;
        return;
    }

    for (const file of files) {
        const problems = [];
        try {
            // same normalization the editor applies when loading the example
            const tc = M.fromJSON(fs.readFileSync(path.join(dir, file), "utf8"));

            for (const p of M.validate(tc).filter(p => p.level === "error"))
                problems.push("validation error: " + p.text);

            const generated = gtfs.buildTestFiles(tc);
            if (!generated.some(f => f.name === "arrange.zip"))
                problems.push("no arrange.zip generated");

            if (M.toJSON(M.fromJSON(M.toJSON(tc))) !== M.toJSON(tc))
                problems.push("JSON round trip not stable");

        } catch (err) {
            problems.push("exception: " + err.message);
        }

        if (problems.length > 0) {
            failures++;
            console.log(`FAIL example ${file}`);
            for (const p of problems) console.log("  - " + p);
        } else {
            console.log(`ok   example ${file}`);
        }
    }

    // the manifest is optional, but when present it must be in sync
    const manifestPath = path.join(dir, "index.json");
    if (fs.existsSync(manifestPath)) {
        try {
            const listed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            for (const f of files)
                if (!listed.includes(f)) { failures++; console.log(`FAIL index.json is missing ${f}`); }
            for (const l of listed)
                if (!files.includes(l)) { failures++; console.log(`FAIL index.json lists missing file ${l}`); }
        } catch (err) {
            failures++;
            console.log("FAIL index.json is not valid JSON: " + err.message);
        }
    }

    console.log("");
}

// ---- 2) round-trip regression against real submissions (local only) -------

async function roundTripSubmittedTests() {
    const testsDir = path.join(REPO, "submitted-tests");
    if (!fs.existsSync(testsDir)) {
        console.log("submitted-tests/ not present, skipping the round-trip regression suite");
        return;
    }
    const dirs = fs.readdirSync(testsDir).filter(d =>
        fs.statSync(path.join(testsDir, d)).isDirectory());
    if (dirs.length === 0) {
        console.log("submitted-tests/ is empty, skipping the round-trip regression suite");
        return;
    }
    dirs.sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999) || a.localeCompare(b));

    for (const dir of dirs) {
        const base = path.join(testsDir, dir);
        const problems = [];

        const readTxt = (f) => fs.existsSync(path.join(base, f))
            ? fs.readFileSync(path.join(base, f), "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "")
            : null;

        const arrangeBytes = new Uint8Array(fs.readFileSync(path.join(base, "arrange.zip")));
        const arrangeFiles = await zip.read(arrangeBytes);
        const { model: arrangeModel, agency } = gtfs.importGTFS(arrangeFiles);

        const tc = {
            version: 1,
            name: dir,
            description: readTxt("comment.txt") ?? "",
            act: readTxt("act.txt") ?? "",
            agency: agency ?? { name: "", url: "", timezone: "", language: "", phone: "" },
            arrange: arrangeModel,
            expected: { type: "model", exception: "INVALID_ARGUMENT", model: M.emptyModel() }
        };

        let assertFiles = null;
        if (fs.existsSync(path.join(base, "assert.txt"))) {
            tc.expected.type = "exception";
            tc.expected.exception = readTxt("assert.txt");
        } else {
            const assertBytes = new Uint8Array(fs.readFileSync(path.join(base, "assert.zip")));
            assertFiles = await zip.read(assertBytes);
            tc.expected.model = gtfs.importGTFS(assertFiles).model;
        }

        // JSON round-trip (exercise the serializer too)
        const tc2 = M.fromJSON(M.toJSON(tc));

        // regenerate and compare
        const generated = gtfs.buildTestFiles(tc2);
        const genMap = Object.fromEntries(generated.map(f => [f.name, f.data]));

        if (genMap["comment.txt"] !== tc.description + "\n") problems.push("comment.txt mismatch");
        if (genMap["act.txt"] !== tc.act + "\n") problems.push("act.txt mismatch");

        const genArrange = await zip.read(genMap["arrange.zip"]);
        for (const name of ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "calendar.txt", "stop_times.txt"])
            compareTables("arrange", name, parseTable(arrangeFiles, name), parseTable(genArrange, name), problems);

        if (tc.expected.type === "exception") {
            if (genMap["assert.txt"] !== tc.expected.exception + "\n") problems.push("assert.txt mismatch");
        } else {
            const genAssert = await zip.read(genMap["assert.zip"]);
            for (const name of ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "calendar.txt", "stop_times.txt"])
                compareTables("assert", name, parseTable(assertFiles, name), parseTable(genAssert, name), problems);
        }

        // validation should not report errors on real, accepted tests
        for (const e of M.validate(tc2).filter(p => p.level === "error"))
            problems.push("validation error: " + e.text);

        if (problems.length > 0) {
            failures++;
            console.log(`FAIL ${dir}`);
            for (const p of problems) console.log("  - " + p);
        } else {
            console.log(`ok   ${dir}`);
        }
    }
}

// ---- every script parses (the UI files are not run here) ------------------

function checkSyntax() {
    const dir = path.join(WEB, "js");
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
        try { new Function(fs.readFileSync(path.join(dir, f), "utf8")); }
        catch (err) { failures++; console.log(`FAIL ${f} does not parse: ${err.message}`); }
    }
}

// ---- model helpers used by the editor ----------------------------------------

function checkModelHelpers() {
    const problems = [];
    const expect = (cond, msg) => { if (!cond) problems.push(msg); };
    const named = (...names) => names.map((name, i) => M.makeStation(i + 1, name, 0, 0));

    expect(M.nextStationName([]) === "A", "first auto name is A");
    expect(M.nextStationName(named("A", "C")) === "B", "auto name fills the gap");
    expect(M.nextStationName(named(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ")) === "AA", "auto name after Z is AA");

    const line = { stops: [] };
    M.appendStop(line, 1);
    line.stops[0].arrival = line.stops[0].departure = "09:15:00";
    M.appendStop(line, 2);
    expect(line.stops[1].stationId === 2 && line.stops[1].arrival === "09:15:00", "appendStop copies the previous times");

    const tc = M.defaultTestCase();
    tc.arrange.stations[1].name = "A";
    tc.arrange.calendars[0].end = "2024-01-01";
    const warnings = M.validate(tc).filter(p => p.level === "warning").map(p => p.text);
    expect(warnings.some(w => w.includes("v.dupStationName") || w.includes('named "A"')), "duplicate station names warn");
    expect(warnings.some(w => w.includes("v.calendarOrder") || w.includes("ends before")), "reversed calendar warns");

    // the inactive expected result survives a JSON round trip (undo restores from JSON)
    const both = M.defaultTestCase();
    both.expected.type = "exception";
    both.expected.exception = "RADIUS_TOO_SMALL";
    both.expected.model = M.fromJSON(M.toJSON(both)).arrange;
    const back = M.fromJSON(M.toJSON(both));
    expect(back.expected.model.stations.length === both.arrange.stations.length && back.expected.exception === "RADIUS_TOO_SMALL",
        "toJSON keeps both the expected model and the exception");

    // a position that can't be converted leaves the station untouched
    const st = M.makeStation(1, "A", 10, 20);
    const before = JSON.stringify(st);
    try { M.setStationGPS(st, 90, 0); } catch { /* expected */ }
    expect(JSON.stringify(st) === before, "setStationGPS at a pole changes nothing");

    const files = {
        "calendar.txt": new TextEncoder().encode("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC1,1,1,1,1,1,1,1,20250101,20251231\n"),
        "trips.txt": new TextEncoder().encode("route_id,service_id,trip_id\nR1,weekday,T1\n")
    };
    expect(gtfs.importGTFS(files).model.trips[0].service === 1, "unparsable service_id falls back to 1");

    // act.txt split/join keeps positions, so the Act form can edit one field
    const act = A.split("DIVERT_LINE\nZ2;Walk;Tower;Campus");
    expect(A.fields(act)[1].values.join(";") === "Walk;Tower;Campus", "repeat param takes the rest");
    expect(A.join({ ...act, params: ["", "10"] }) === "DIVERT_LINE\n;10", "empty field keeps its place");
    expect(A.join({ method: "CLOSE_AREA", params: ["A", ""], rest: [] }) === "CLOSE_AREA\nA", "trailing empties dropped");
    expect(A.join(A.split("CLOSE_AREA\nA;10\nL1;L2")) === "CLOSE_AREA\nA;10\nL1;L2", "extra lines survive");
    expect(A.join(A.split("\nCLOSE_AREA\n\nA;10\n")) === "CLOSE_AREA\nA;10", "blank lines are skipped");
    const noParams = A.join({ method: "CLOSE_AREA", params: ["", ""], rest: ["L1"] });
    expect(A.join(A.split(noParams)) === noParams && A.split(noParams).rest[0] === "L1", "empty params before more lines keep their line");
    const actKeys = (act) => A.check(act, M.defaultTestCase().arrange).map(p => p.key).join(",");
    expect(actKeys("CLOSE_AREA\nA;10") === "", "valid act has no warnings");
    expect(actKeys("CLOSE_AREA\nX;ten") === "v.actNoStation,v.actNotNumber", "bad station + radius warn");
    expect(actKeys("DIVERT_LINE\nl1;A;Nope") === "v.actNoStation", "line names match case-insensitively");

    if (problems.length > 0) {
        failures++;
        console.log("FAIL model helpers");
        for (const p of problems) console.log("  - " + p);
    } else {
        console.log("ok   model helpers");
    }
}

async function run() {
    checkModelHelpers();
    checkSyntax();
    checkExamples();
    await roundTripSubmittedTests();

    if (failures > 0) { console.log(`\n${failures} FAILURES`); process.exit(1); }
    console.log("\nall checks passed");
}

run().catch(e => { console.error(e); process.exit(1); });
