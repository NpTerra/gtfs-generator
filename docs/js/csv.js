// Minimal CSV writer/parser for the GTFS txt files.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});

    function needsQuoting(value) {
        return /[",\n\r]/.test(value) || /^\s|\s$/.test(value);
    }

    function encodeField(value) {
        if (value === null || value === undefined) return "";
        const s = String(value);
        return needsQuoting(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
    }

    // rows: array of objects, columns: [{key, header}]
    function write(columns, rows) {
        const lines = [columns.map(c => encodeField(c.header)).join(",")];
        for (const row of rows)
            lines.push(columns.map(c => encodeField(row[c.key])).join(","));
        return lines.join("\n") + "\n";
    }

    // Parses CSV text into an array of objects keyed by the header row.
    function parse(text) {
        const records = [];
        let field = "", record = [], inQuotes = false;

        const pushField = () => { record.push(field); field = ""; };
        const pushRecord = () => {
            pushField();
            if (record.length > 1 || record[0] !== "") records.push(record);
            record = [];
        };

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += ch;
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                pushField();
            } else if (ch === "\n") {
                pushRecord();
            } else if (ch !== "\r") {
                field += ch;
            }
        }
        if (field !== "" || record.length > 0) pushRecord();

        if (records.length === 0) return [];
        const header = records[0].map(h => h.trim());
        return records.slice(1).map(rec => {
            const obj = {};
            header.forEach((h, i) => obj[h] = rec[i] !== undefined ? rec[i] : "");
            return obj;
        });
    }

    G.csv = { write, parse };
})();
