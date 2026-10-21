// IDE-style panels around the map: drag a splitter to resize (double-click
// resets it, arrow keys nudge it), and hide/show each panel. Sizes and
// visibility are remembered per browser; phones get a stacked layout in CSS.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const STORAGE_KEY = "gtfs-editor-layout";
    const PANELS = ["test", "model", "problems"];

    let layout;
    let state = {}; // { "test-size": "320px", "model-size": ..., "problems-size": ..., hidden: { test: true } }
    const MIN_MAP_WIDTH = 320;

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { }
    }

    function apply() {
        for (const name of PANELS) {
            const hidden = !!state.hidden?.[name];
            layout.classList.toggle("hide-" + name, hidden);
            document.querySelectorAll(`[data-toggle="${name}"]`).forEach(b =>
                b.setAttribute("aria-pressed", String(!hidden)));
        }
        for (const prop of ["test-size", "model-size", "problems-size"]) {
            if (state[prop]) layout.style.setProperty("--" + prop, state[prop]);
            else layout.style.removeProperty("--" + prop); // CSS default
        }
    }

    function setHidden(name, hidden) {
        state.hidden = { ...state.hidden, [name]: hidden };
        apply();
        save();
    }

    // splitter name -> how a pointer position becomes that panel's size
    // (other: the panel sharing the row, so the map keeps MIN_MAP_WIDTH)
    const SPLITS = {
        test: { prop: "test-size", min: 220, other: "panel-model", size: (r, e) => e.clientX - r.left, grow: "ArrowRight", shrink: "ArrowLeft" },
        model: { prop: "model-size", min: 260, other: "panel-test", size: (r, e) => r.right - e.clientX, grow: "ArrowLeft", shrink: "ArrowRight" },
        problems: { prop: "problems-size", min: 60, size: (r, e) => r.bottom - e.clientY, grow: "ArrowUp", shrink: "ArrowDown" }
    };

    function resize(split, size) {
        const r = layout.getBoundingClientRect();
        const max = split.other
            ? r.width - document.getElementById(split.other).offsetWidth - MIN_MAP_WIDTH
            : r.height * .7;
        state[split.prop] = Math.round(Math.max(split.min, Math.min(max, size))) + "px";
        apply();
    }

    function initSplitter(el) {
        const split = SPLITS[el.dataset.split];
        const panel = document.getElementById("panel-" + el.dataset.split);

        el.addEventListener("pointerdown", (ev) => {
            ev.preventDefault();
            el.setPointerCapture(ev.pointerId);
            el.classList.add("dragging");
            const move = (e) => resize(split, split.size(layout.getBoundingClientRect(), e));
            const end = () => {
                el.classList.remove("dragging");
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", end);
                el.removeEventListener("pointercancel", end);
                save();
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", end);
            el.addEventListener("pointercancel", end);
        });

        el.addEventListener("dblclick", () => {
            delete state[split.prop];
            apply();
            save();
        });

        el.addEventListener("keydown", (ev) => {
            const current = split.other ? panel.offsetWidth : panel.offsetHeight;
            const step = ev.shiftKey ? 64 : 16;
            if (ev.key === split.grow) resize(split, current + step);
            else if (ev.key === split.shrink) resize(split, current - step);
            else return;
            ev.preventDefault();
            save();
        });
    }

    function init() {
        layout = document.getElementById("layout");
        try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { state = {}; }

        document.querySelectorAll(".splitter").forEach(initSplitter);
        document.querySelectorAll("[data-toggle]").forEach(btn =>
            btn.addEventListener("click", () => setHidden(btn.dataset.toggle, !state.hidden?.[btn.dataset.toggle])));
        document.querySelectorAll("[data-hide]").forEach(btn =>
            btn.addEventListener("click", () => setHidden(btn.dataset.hide, true)));
        apply();
    }

    // makes a panel visible and scrolls it into view (phones stack the panels)
    function show(name) {
        if (state.hidden?.[name]) setHidden(name, false);
        document.getElementById("panel-" + name)?.scrollIntoView({ block: "nearest" });
    }

    G.layout = { init, show };
})();
