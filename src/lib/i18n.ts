// EN/HU translations for explanatory text (hints, dialogs, toasts, validation).
// `lang` is a Vue ref, so any template or computed that calls t() re-renders
// when the language changes.
import { ref } from 'vue'

export type Lang = 'en' | 'hu'
const STORAGE_KEY = 'gtfs-editor-lang'

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    "hint.testName": "Also the name of the generated .zip file.",
    "hint.description": "Explain what the test verifies. This is what the graders read.",
    "hint.act": "Pick a method (type to search) and fill in its fields, or edit act.txt in the box below. " +
      "The map shows what the act refers to. Custom… takes any method name; " +
      "one the editor doesn't know isn't checked or shown on the map.",
    "hint.phone": "Set this to the phone number YOU were assigned for the course!",
    "hint.calendarsInherit": "Empty: the Arrange calendars will be reused in assert.zip.",
    "hint.trips": "Each line needs at least one trip, otherwise it gets no stop times.",
    "hint.noStops": "No stops yet, add at least two.",
    "hint.exception": "The single line written to assert.txt. Custom… takes any name.",
    "pill.expected": "The faded drawing on the map is the Arrange model, for comparison.",

    "map.hint": "Drag stations to move them · double-click to add a station · scroll to zoom",
    "map.measureStart": "Click a station or any point to measure from.",
    "map.measureNext": "Click the second station or point (Esc to stop).",
    "map.picking": "Click stations to add them as stops to \"{name}\"",
    "map.exceptionMsg": "The expected result is the exception \"{name}\", so there is no expected model to draw. Switch back to the Arrange tab.",

    "popup.phone": "The agency phone number is not set!\n\nEnter the phone number you were assigned for the course in the Agency section. Generating is blocked until then.",

    "dlg.copyArrange": "Overwrite the current Expected model with a copy of Arrange?",
    "dlg.deleteStation": "\"{name}\" (S{id}) is used by {n} stop(s). Delete it and those stops?",
    "dlg.deleteLine": "\"{name}\" (R{id}) has {n} trip(s). Delete the line and its trips?",
    "dlg.deleteFile": "Delete the test case \"{name}\"? This cannot be undone.",
    "dlg.renameFile": "New name for the test case (also the .zip and folder name):",
    "dlg.newProject": "Name of the new project:",
    "dlg.renameProject": "New name for the project:",
    "dlg.deleteProject": "Delete the project \"{name}\" with all its test cases? This cannot be undone.",
    "dlg.resetExamples": "Reset \"{name}\" to the built-in examples? Your changes to them are lost.",

    "toast.idTakenStation": "Station ID {id} is already taken.",
    "toast.idTakenLine": "Line ID {id} is already taken.",
    "toast.idTakenCalendar": "Calendar ID {id} is already taken.",
    "toast.importedRoutes": "Imported {n} route(s) with {stations} station(s) into the {target} model.",
    "gtfs.noRoutes": "This feed has no routes with at least two stops.",
    "gtfs.reading": "Reading the GTFS feed…",
    "toast.importFailed": "Import failed: {msg}",
    "toast.fixErrors": "Cannot generate: fix {n} error(s) first (see the Problems panel).",
    "toast.generated": "Generated {name}.zip. Unzip it into your test directory.",
    "toast.generateFailed": "Generation failed: {msg}",
    "toast.importedOne": "Imported \"{name}\" into the project.",
    "toast.importedMany": "Imported {n} test cases into the project.",
    "toast.importSkipped": "Skipped (nothing importable): {files}",
    "toast.oneFeed": "one GTFS feed per import",
    "toast.deletedElsewhere": "The open test case was deleted in another tab.",
    "toast.generateAllBlocked": "Cannot generate all: fix these test cases first (errors, missing phone or duplicate names): {names}",
    "toast.generatedAll": "Generated {n} test case folder(s). Unzip them into your test directory.",
    "toast.saveFailed": "Cannot save in this browser (storage full or disabled). Export your work to keep it!",
    "toast.unreadableFile": "This file cannot be read; delete it.",
    "toast.nameTaken": "\"{name}\" is already a test case in this project.",
    "toast.changedElsewhere": "\"{name}\" was changed in another tab; reloaded it (undo brings back yours).",
    "toast.copiedTo": "Copied \"{name}\" to {project}.",
    "toast.deletedFile": "Deleted \"{name}\". Restore it with Undo, or later under ⋮ → Recently deleted.",
    "toast.deletedProject": "Deleted the project \"{name}\". Restore it with Undo, or later under ⋮ → Recently deleted.",

    "problems.none": "No problems found.",

    "v.actOnBoundary": "act.txt: station \"{name}\" is exactly {r} m from \"{center}\", on the CLOSE_AREA radius. The grader's XY→GPS→XY conversion can put it on either side; move it clearly inside or outside unless the boundary is the point of the test.",
    "v.dupFileName": "Another test case in this project is also named \"{name}\"; Generate all needs unique names.",
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
    "v.badName": "Test name is empty, only dots, or contains characters unsafe for a directory name.",
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
    "hint.act": "Válassz metódust (gépeléssel kereshetsz) és töltsd ki a mezőit, vagy írd át az act.txt-t az alsó mezőben. " +
      "A térkép mutatja, amire az act hivatkozik. A Custom… bármilyen metódusnevet elfogad; " +
      "amit a szerkesztő nem ismer, azt nem ellenőrzi, és a térképen sem jelenik meg.",
    "hint.phone": "Írd át arra a telefonszámra, amit a tárgyból kaptál!",
    "hint.calendarsInherit": "Üres: az Arrange naptárai lesznek felhasználva az assert.zip-ben.",
    "hint.trips": "Minden vonalhoz kell legalább egy menet (trip), különben nem generálódnak hozzá megállási idők.",
    "hint.noStops": "Még nincs megálló, vegyél fel legalább kettőt.",
    "hint.exception": "Ez az egyetlen sor kerül az assert.txt-be. A Custom… bármilyen nevet elfogad.",
    "pill.expected": "A térképen halványan az Arrange modell látszik, összehasonlításként.",

    "map.hint": "Az állomások húzással mozgathatók · dupla kattintás: új állomás · görgetés: nagyítás",
    "map.measureStart": "Kattints egy állomásra vagy bármely pontra, ahonnan mérni akarsz.",
    "map.measureNext": "Kattints a második állomásra vagy pontra (Esc: kilépés).",
    "map.picking": "Kattints az állomásokra, hogy megállóként a(z) „{name}” vonalhoz add őket",
    "map.exceptionMsg": "Az elvárt eredmény a(z) „{name}” kivétel, így nincs kirajzolható elvárt modell. Válts vissza az Arrange fülre.",

    "popup.phone": "Nincs beállítva az agency telefonszám!\n\nÍrd be az Agency szekcióban a tárgyból kapott telefonszámot. Amíg nincs kitöltve, a generálás nem fut le.",

    "dlg.copyArrange": "Felülírod a jelenlegi Expected modellt az Arrange másolatával?",
    "dlg.deleteStation": "A(z) „{name}” (S{id}) állomást {n} megálló használja. Törlöd az állomást a megállókkal együtt?",
    "dlg.deleteLine": "A(z) „{name}” (R{id}) vonalhoz {n} menet tartozik. Törlöd a vonalat a meneteivel együtt?",
    "dlg.deleteFile": "Törlöd a(z) „{name}” tesztesetet? Ez nem vonható vissza.",
    "dlg.renameFile": "A teszteset új neve (egyben a .zip és a mappa neve):",
    "dlg.newProject": "Az új projekt neve:",
    "dlg.renameProject": "A projekt új neve:",
    "dlg.deleteProject": "Törlöd a(z) „{name}” projektet az összes tesztesetével? Ez nem vonható vissza.",
    "dlg.resetExamples": "Visszaállítod a(z) „{name}” projektet a beépített példákra? A módosításaid elvesznek.",

    "toast.idTakenStation": "A(z) {id} állomás-azonosító már foglalt.",
    "toast.idTakenLine": "A(z) {id} vonal-azonosító már foglalt.",
    "toast.idTakenCalendar": "A(z) {id} naptár-azonosító már foglalt.",
    "toast.importedRoutes": "{n} vonal és {stations} állomás importálva a(z) {target} modellbe.",
    "gtfs.noRoutes": "Ebben a feedben nincs legalább kétmegállós vonal.",
    "gtfs.reading": "A GTFS feed beolvasása…",
    "toast.importFailed": "Az importálás nem sikerült: {msg}",
    "toast.fixErrors": "Nem lehet generálni: előbb javíts ki {n} hibát (lásd a Problems panelt).",
    "toast.generated": "{name}.zip legenerálva. Csomagold ki a teszt könyvtáradba.",
    "toast.generateFailed": "A generálás nem sikerült: {msg}",
    "toast.importedOne": "„{name}” importálva a projektbe.",
    "toast.importedMany": "{n} teszteset importálva a projektbe.",
    "toast.importSkipped": "Kihagyva (nem importálható): {files}",
    "toast.oneFeed": "importálásonként egy GTFS feed",
    "toast.deletedElsewhere": "A megnyitott tesztesetet egy másik lapon törölték.",
    "toast.generateAllBlocked": "Nem lehet mindet generálni, előbb javítsd ezeket (hibák, hiányzó telefonszám vagy azonos nevek): {names}",
    "toast.generatedAll": "{n} teszteset mappája legenerálva. Csomagold ki a teszt könyvtáradba.",
    "toast.saveFailed": "Ebben a böngészőben nem lehet menteni (megtelt vagy le van tiltva a tárhely). Exportáld a munkádat!",
    "toast.unreadableFile": "Ez a fájl nem olvasható; töröld.",
    "toast.nameTaken": "Már van „{name}” nevű teszteset ebben a projektben.",
    "toast.changedElsewhere": "„{name}” egy másik lapon módosult; újratöltve (visszavonással visszakapod a tiédet).",
    "toast.copiedTo": "„{name}” átmásolva ide: {project}.",
    "toast.deletedFile": "„{name}” törölve. Visszaállíthatod az Undo gombbal, vagy később: ⋮ → Recently deleted.",
    "toast.deletedProject": "A(z) „{name}” projekt törölve. Visszaállíthatod az Undo gombbal, vagy később: ⋮ → Recently deleted.",

    "problems.none": "Nincs talált probléma.",

    "v.actOnBoundary": "act.txt: a(z) „{name}” állomás pontosan {r} m-re van „{center}”-tól, a CLOSE_AREA sugarán. A javító XY→GPS→XY átváltása bármelyik oldalra teheti; tedd egyértelműen belülre vagy kívülre, hacsak nem épp a határ a teszt lényege.",
    "v.dupFileName": "Ebben a projektben egy másik teszteset neve is „{name}”; a Generate all egyedi neveket igényel.",
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
    "v.badName": "A teszt neve üres, csak pontokból áll, vagy könyvtárnévben nem biztonságos karaktert tartalmaz.",
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
}

function savedLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'hu' || saved === 'en') return saved
  } catch { /* no localStorage */ }
  return 'en'
}

export const lang = ref<Lang>(savedLang())

export function setLang(l: Lang) {
  lang.value = l
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* no localStorage */ }
}

export function t(key: string, params?: Record<string, unknown>): string {
  const s = STRINGS[lang.value][key] ?? STRINGS.en[key] ?? key
  return params
    ? s.replace(/\{(\w+)\}/g, (m, k: string) => params[k] !== undefined ? String(params[k]) : m)
    : s
}
