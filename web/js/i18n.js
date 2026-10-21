// EN/HU translations for explanatory text (hints, dialogs, toasts, validation).
// Structural labels (STATIONS, LINES, field names, buttons) deliberately stay
// English, since they mirror GTFS terminology.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const STORAGE_KEY = "gtfs-editor-lang";

    const STRINGS = {
        en: {
            "hint.testName": "Also the name of the generated .zip file.",
            "hint.description": "Explain what the test verifies. This is what the graders read.",
            "hint.act": "Pick the method and fill in its fields, or edit act.txt directly (line 1: method, " +
                "line 2: parameters separated by ';'). The affected area is drawn on the map.",
            "hint.phone": "Set this to the phone number YOU were assigned for the course!",
            "hint.calendarsInherit": "Empty: the Arrange calendars will be reused in assert.zip.",
            "hint.trips": "Each line needs at least one trip, otherwise it gets no stop times.",
            "hint.noStops": "No stops yet, add at least two.",
            "hint.exception": "The single line written to assert.txt.",
            "pill.expected": "The faded drawing on the map is the Arrange model, for comparison.",

            "map.hint": "Drag stations to move them · double-click to add a station · scroll to zoom",
            "map.picking": "Click stations to add them as stops to \"{name}\"",
            "map.exceptionMsg": "The expected result is the exception \"{name}\", so there is no expected model to draw. Switch back to the Arrange tab.",

            "popup.phone": "The agency phone number is not set!\n\nEnter the phone number you were assigned for the course in the Agency section. Generating is blocked until then.",

            "dlg.newConfirm": "Discard the current test case and start fresh?",
            "dlg.exampleConfirm": "Discard the current test case and load this example?",
            "dlg.importConfirm": "Discard the current test case and load \"{name}\"?",
            "dlg.copyArrange": "Overwrite the current Expected model with a copy of Arrange?",
            "dlg.deleteStation": "\"{name}\" (S{id}) is used by {n} stop(s). Delete it and those stops?",
            "dlg.deleteLine": "\"{name}\" (R{id}) has {n} trip(s). Delete the line and its trips?",
            "dlg.gtfsReplace": "This is a plain GTFS zip. Replace the current {target} model with its contents?",

            "toast.idTakenStation": "Station ID {id} is already taken.",
            "toast.idTakenLine": "Line ID {id} is already taken.",
            "toast.idTakenCalendar": "Calendar ID {id} is already taken.",
            "toast.importedJson": "Imported test case \"{name}\".",
            "toast.importedSubmission": "Imported submission \"{name}\".\nNote: earlier versions of this tool shifted coordinates by a random GPS offset; an older submission keeps it.",
            "toast.importedGtfs": "Imported GTFS files into the {target} model.",
            "toast.zipUnknown": "This zip contains neither a submission (act.txt/arrange.zip) nor GTFS files (stops.txt).",
            "toast.importFailed": "Import failed: {msg}",
            "toast.fixErrors": "Cannot generate: fix {n} error(s) first (see the Problems panel).",
            "toast.generated": "Generated {name}.zip. Unzip it into your test directory.",
            "toast.generateFailed": "Generation failed: {msg}",
            "toast.exampleLoaded": "Loaded example \"{name}\". Rebuild it into your own test before submitting!",

            "problems.none": "No problems found.",

            "examples.serverNeeded": "(examples need a web server, see README)",
            "examples.none": "(no examples found: enable directory listing or add examples/index.json)",

            "v.dupStation": "{label}: duplicate station ID {id}.",
            "v.stationNoName": "{label}: station {id} has no name.",
            "v.dupStationName": "{label}: {n} stations are named \"{name}\"; act.txt refers to stations by name.",
            "v.dupLine": "{label}: duplicate line ID {id}.",
            "v.fewStops": "{label}: line \"{name}\" has fewer than 2 stops.",
            "v.stopMissingStation": "{label}: line \"{name}\" stop #{n} references missing station ID {id}.",
            "v.badArrival": "{label}: line \"{name}\" stop #{n} has invalid arrival time \"{time}\".",
            "v.badDeparture": "{label}: line \"{name}\" stop #{n} has invalid departure time \"{time}\".",
            "v.dupCalendar": "{label}: duplicate calendar ID {id}.",
            "v.badDates": "{label}: calendar {id} has invalid dates (use YYYY-MM-DD).",
            "v.calendarOrder": "{label}: calendar {id} ends before it starts.",
            "v.dupTrip": "{label}: duplicate trip ID {id}.",
            "v.tripMissingLine": "{label}: trip {id} references missing line ID {line}.",
            "v.lineNoTrips": "{label}: line \"{name}\" has no trips, so its stop times will not be generated.",
            "v.badName": "Test name is empty or contains characters unsafe for a directory name.",
            "v.noDescription": "Description (comment.txt) is empty.",
            "v.noAct": "Act (act.txt) is empty.",
            "v.actEmpty": "act.txt: \"{label}\" is empty.",
            "v.actNoStation": "act.txt: Arrange has no station named \"{name}\" (fine if you test an invalid argument).",
            "v.actNoLine": "act.txt: Arrange has no line named \"{name}\" (fine if you test an invalid argument).",
            "v.actNotNumber": "act.txt: {label} \"{value}\" is not a number.",
            "v.phone": "Agency phone is empty or the placeholder. Set the one you were assigned!",
            "v.noException": "Expected exception name is empty.",
            "v.tripMissingCalendar": "{label}: trip {id} references missing calendar ID {service}."
        },

        hu: {
            "hint.testName": "Egyben a generált .zip fájl neve is.",
            "hint.description": "Írd le, mit ellenőriz a teszt. Ezt olvassák a javítók.",
            "hint.act": "Válaszd ki a metódust és töltsd ki a mezőit, vagy szerkeszd közvetlenül az act.txt-t " +
                "(1. sor: metódus, 2. sor: paraméterek ';'-vel elválasztva). Az érintett terület kirajzolódik a térképen.",
            "hint.phone": "Írd át arra a telefonszámra, amit a tárgyból kaptál!",
            "hint.calendarsInherit": "Üres: az Arrange naptárai lesznek felhasználva az assert.zip-ben.",
            "hint.trips": "Minden vonalhoz kell legalább egy menet (trip), különben nem generálódnak hozzá megállási idők.",
            "hint.noStops": "Még nincs megálló, vegyél fel legalább kettőt.",
            "hint.exception": "Ez az egyetlen sor kerül az assert.txt-be.",
            "pill.expected": "A térképen halványan az Arrange modell látszik, összehasonlításként.",

            "map.hint": "Az állomások húzással mozgathatók · dupla kattintás: új állomás · görgetés: nagyítás",
            "map.picking": "Kattints az állomásokra, hogy megállóként a(z) „{name}” vonalhoz add őket",
            "map.exceptionMsg": "Az elvárt eredmény a(z) „{name}” kivétel, így nincs kirajzolható elvárt modell. Válts vissza az Arrange fülre.",

            "popup.phone": "Nincs beállítva az agency telefonszám!\n\nÍrd be az Agency szekcióban a tárgyból kapott telefonszámot. Amíg nincs kitöltve, a generálás nem fut le.",

            "dlg.newConfirm": "Eldobod a jelenlegi tesztesetet és újat kezdesz?",
            "dlg.exampleConfirm": "Eldobod a jelenlegi tesztesetet és betöltöd ezt a példát?",
            "dlg.importConfirm": "Eldobod a jelenlegi tesztesetet és betöltöd ezt: „{name}”?",
            "dlg.copyArrange": "Felülírod a jelenlegi Expected modellt az Arrange másolatával?",
            "dlg.deleteStation": "A(z) „{name}” (S{id}) állomást {n} megálló használja. Törlöd az állomást a megállókkal együtt?",
            "dlg.deleteLine": "A(z) „{name}” (R{id}) vonalhoz {n} menet tartozik. Törlöd a vonalat a meneteivel együtt?",
            "dlg.gtfsReplace": "Ez egy sima GTFS zip. Lecseréled a jelenlegi {target} modellt a tartalmára?",

            "toast.idTakenStation": "A(z) {id} állomás-azonosító már foglalt.",
            "toast.idTakenLine": "A(z) {id} vonal-azonosító már foglalt.",
            "toast.idTakenCalendar": "A(z) {id} naptár-azonosító már foglalt.",
            "toast.importedJson": "„{name}” teszteset importálva.",
            "toast.importedSubmission": "„{name}” beadás importálva.\nMegjegyzés: az eszköz korábbi verziói véletlen GPS-eltolással tolták el a koordinátákat; egy régebbi beadásban ez benne marad.",
            "toast.importedGtfs": "GTFS fájlok importálva a(z) {target} modellbe.",
            "toast.zipUnknown": "Ez a zip se beadást (act.txt/arrange.zip), se GTFS fájlokat (stops.txt) nem tartalmaz.",
            "toast.importFailed": "Az importálás nem sikerült: {msg}",
            "toast.fixErrors": "Nem lehet generálni: előbb javíts ki {n} hibát (lásd a Problems panelt).",
            "toast.generated": "{name}.zip legenerálva. Csomagold ki a teszt könyvtáradba.",
            "toast.generateFailed": "A generálás nem sikerült: {msg}",
            "toast.exampleLoaded": "„{name}” példa betöltve. Beadás előtt építsd át sajátra!",

            "problems.none": "Nincs talált probléma.",

            "examples.serverNeeded": "(a példákhoz webszerver kell, lásd a README-t)",
            "examples.none": "(nem található példa: engedélyezd a könyvtárlistázást, vagy adj hozzá examples/index.json fájlt)",

            "v.dupStation": "{label}: ismétlődő állomás-azonosító: {id}.",
            "v.stationNoName": "{label}: a(z) {id} állomásnak nincs neve.",
            "v.dupStationName": "{label}: {n} állomás neve „{name}”; az act.txt név alapján hivatkozik az állomásokra.",
            "v.dupLine": "{label}: ismétlődő vonal-azonosító: {id}.",
            "v.fewStops": "{label}: a(z) „{name}” vonalnak kevesebb mint 2 megállója van.",
            "v.stopMissingStation": "{label}: a(z) „{name}” vonal {n}. megállója nem létező állomásra hivatkozik (ID: {id}).",
            "v.badArrival": "{label}: a(z) „{name}” vonal {n}. megállójának érkezési ideje érvénytelen: „{time}”.",
            "v.badDeparture": "{label}: a(z) „{name}” vonal {n}. megállójának indulási ideje érvénytelen: „{time}”.",
            "v.dupCalendar": "{label}: ismétlődő naptár-azonosító: {id}.",
            "v.badDates": "{label}: a(z) {id} naptár dátumai érvénytelenek (formátum: ÉÉÉÉ-HH-NN).",
            "v.calendarOrder": "{label}: a(z) {id} naptár vége korábbi, mint a kezdete.",
            "v.dupTrip": "{label}: ismétlődő menet-azonosító: {id}.",
            "v.tripMissingLine": "{label}: a(z) {id} menet nem létező vonalra hivatkozik (ID: {line}).",
            "v.lineNoTrips": "{label}: a(z) „{name}” vonalhoz nincs menet, így nem generálódnak hozzá megállási idők.",
            "v.badName": "A teszt neve üres, vagy könyvtárnévben nem biztonságos karaktert tartalmaz.",
            "v.noDescription": "A leírás (comment.txt) üres.",
            "v.noAct": "Az act (act.txt) üres.",
            "v.actEmpty": "act.txt: a(z) „{label}” mező üres.",
            "v.actNoStation": "act.txt: az Arrange-ben nincs „{name}” nevű állomás (rendben, ha érvénytelen argumentumot tesztelsz).",
            "v.actNoLine": "act.txt: az Arrange-ben nincs „{name}” nevű vonal (rendben, ha érvénytelen argumentumot tesztelsz).",
            "v.actNotNumber": "act.txt: a(z) {label} értéke („{value}”) nem szám.",
            "v.phone": "Az agency telefonszáma üres vagy a helykitöltő. Írd át a kapott számra!",
            "v.noException": "Az elvárt kivétel neve üres.",
            "v.tripMissingCalendar": "{label}: a(z) {id} menet nem létező naptárra hivatkozik (ID: {service})."
        }
    };

    let lang = "en";
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "hu" || saved === "en") lang = saved;
    } catch { /* no localStorage (node, file:// restrictions) */ }

    function t(key, params) {
        const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
        return params
            ? s.replace(/\{(\w+)\}/g, (m, k) => params[k] !== undefined ? String(params[k]) : m)
            : s;
    }

    function set(l) {
        lang = l === "hu" ? "hu" : "en";
        try { localStorage.setItem(STORAGE_KEY, lang); } catch { }
    }

    G.i18n = { t, set, get: () => lang };
})();
