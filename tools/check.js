// Test suite for the web editor (run with: node tools/check.js):
//
// 1) Validates every "Load example" entry in docs/examples/*.json: it must
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
const DOCS = path.join(REPO, "docs");

for (const f of ["i18n.js", "geo.js", "csv.js", "zip.js", "model.js", "gtfs.js"])
    eval(fs.readFileSync(path.join(DOCS, "js", f), "utf8"));

const { csv, zip, model: M, gtfs } = globalThis.GTG;
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
    const dir = path.join(DOCS, "examples");
    const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "index.json").sort()
        : [];
    if (files.length === 0) {
        console.log("FAIL: no docs/examples/*.json found");
        failures++;
        return [];
    }

    const examples = [];
    for (const file of files) {
        const problems = [];
        try {
            // same normalization the editor applies when loading the example
            const tc = M.fromJSON(fs.readFileSync(path.join(dir, file), "utf8"));

            for (const p of M.validate(tc).filter(p => p.level === "error"))
                problems.push("validation error: " + p.text);

            const generated = gtfs.buildTestFiles(tc, { lat: 0, lon: 0 });
            if (!generated.some(f => f.name === "arrange.zip"))
                problems.push("no arrange.zip generated");

            if (M.toJSON(M.fromJSON(M.toJSON(tc))) !== M.toJSON(tc))
                problems.push("JSON round trip not stable");

            if (problems.length === 0) examples.push(JSON.parse(M.toJSON(tc)));
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
    return examples;
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
            randomizeOffsets: false,
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
        const generated = gtfs.buildTestFiles(tc2, { lat: 0, lon: 0 });
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

// ---- offset sanity check on the first example ------------------------------

async function checkOffsets(examples) {
    if (examples.length === 0) return;
    const tc = M.fromJSON(JSON.stringify(examples[0]));
    tc.randomizeOffsets = true;
    const off = gtfs.pickOffsets(tc, () => 0.99);
    const files = gtfs.buildTestFiles(tc, off);
    const arr = await zip.read(files.find(f => f.name === "arrange.zip").data);
    const stops = parseTable(arr, "stops.txt");
    const bad = stops.filter(s => Math.abs(+s.stop_lat) > 85 || Math.abs(+s.stop_lon) > 180);
    if (bad.length) { failures++; console.log("FAIL offsets: out-of-range coords", bad); }
    else console.log(`ok   offsets (lat ${off.lat}, lon ${off.lon})`);
}

async function run() {
    const examples = checkExamples();
    await roundTripSubmittedTests();
    await checkOffsets(examples);

    if (failures > 0) { console.log(`\n${failures} FAILURES`); process.exit(1); }
    console.log("\nall checks passed");
}

run().catch(e => { console.error(e); process.exit(1); });
