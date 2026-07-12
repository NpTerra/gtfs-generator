// SVG map view: grid, transit lines, draggable stations, act-phase overlay.
// World coordinates are meters on the XY grid with the Y axis pointing up.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});
    const SVG_NS = "http://www.w3.org/2000/svg";

    let svg, layers, cursorEl, msgEl;
    let cb; // callbacks provided by main.js

    const view = { cx: 10, cy: 0, scale: 18 }; // world center + px per meter

    function el(name, attrs) {
        const node = document.createElementNS(SVG_NS, name);
        for (const [k, v] of Object.entries(attrs ?? {}))
            node.setAttribute(k, v);
        return node;
    }

    function size() {
        const r = svg.getBoundingClientRect();
        return { w: r.width, h: r.height };
    }

    function worldToScreen(x, y) {
        const { w, h } = size();
        return {
            x: (x - view.cx) * view.scale + w / 2,
            y: (view.cy - y) * view.scale + h / 2
        };
    }

    function screenToWorld(sx, sy) {
        const { w, h } = size();
        return {
            x: (sx - w / 2) / view.scale + view.cx,
            y: view.cy - (sy - h / 2) / view.scale
        };
    }

    function eventPoint(ev) {
        const r = svg.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    // ---- rendering -----------------------------------------------------------

    function gridStep() {
        // world meters per grid line; keep spacing between 55 and 170 px
        let step = Math.pow(10, Math.floor(Math.log10(80 / view.scale)));
        for (const mul of [1, 2, 5, 10]) {
            if (step * mul * view.scale >= 55) { step *= mul; break; }
        }
        return step;
    }

    function formatMeters(v) {
        const abs = Math.abs(v);
        if (abs >= 1000) return (v / 1000) + " km";
        return Math.round(v * 1e6) / 1e6 + "";
    }

    function renderGrid() {
        const g = layers.grid;
        g.replaceChildren();
        const { w, h } = size();
        const step = gridStep();

        const tl = screenToWorld(0, 0);   // min x, max y
        const br = screenToWorld(w, h);   // max x, min y

        for (let i = Math.floor(tl.x / step); i <= Math.ceil(br.x / step); i++) {
            const gx = i * step;
            const sx = worldToScreen(gx, 0).x;
            g.append(el("line", { x1: sx, y1: 0, x2: sx, y2: h, class: i === 0 ? "grid-axis" : "grid-line" }));
            const label = el("text", { x: sx + 3, y: h - 5, class: "grid-label" });
            label.textContent = formatMeters(gx);
            g.append(label);
        }
        for (let i = Math.floor(br.y / step); i <= Math.ceil(tl.y / step); i++) {
            const gy = i * step;
            const sy = worldToScreen(0, gy).y;
            g.append(el("line", { x1: 0, y1: sy, x2: w, y2: sy, class: i === 0 ? "grid-axis" : "grid-line" }));
            const label = el("text", { x: 4, y: sy - 4, class: "grid-label" });
            label.textContent = formatMeters(gy);
            g.append(label);
        }
    }

    function renderLines(model, actInfo) {
        const g = layers.lines;
        g.replaceChildren();
        const stationById = new Map(model.stations.map(s => [s.id, s]));

        const drawable = model.lines.filter(l =>
            l.stops.filter(st => stationById.has(st.stationId)).length >= 2);

        drawable.forEach((line, idx) => {
            const pts = line.stops
                .map(st => stationById.get(st.stationId))
                .filter(Boolean)
                .map(s => worldToScreen(s.x, s.y));

            // per-line perpendicular offset so overlapping lines stay visible
            const offset = (idx - (drawable.length - 1) / 2) * 3.5;
            let d = "";
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len * offset, ny = dx / len * offset;
                d += `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} `;
            }

            const isTarget = actInfo.lineNames.has(String(line.shortName).toLowerCase())
                || actInfo.lineNames.has(String(line.name).toLowerCase());
            const path = el("path", {
                d,
                class: "line-path" + (isTarget ? " act-target" : ""),
                stroke: line.color || "#555",
                "stroke-width": isTarget ? 5 : 3.5,
                opacity: 0.9
            });
            const title = el("title");
            title.textContent = `${line.name} (R${line.id})`;
            path.append(title);
            g.append(path);
        });
    }

    function renderActOverlay(actInfo) {
        const g = layers.act;
        g.replaceChildren();
        for (const c of actInfo.circles) {
            const p = worldToScreen(c.x, c.y);
            g.append(el("circle", { cx: p.x, cy: p.y, r: c.r * view.scale, class: "act-circle" }));
        }
    }

    function renderStations(model, actInfo) {
        const g = layers.stations;
        g.replaceChildren();
        const selection = cb.getSelection();

        for (const s of model.stations) {
            const p = worldToScreen(s.x, s.y);

            if (actInfo.ringStationIds.has(s.id))
                g.append(el("circle", { cx: p.x, cy: p.y, r: 13, class: "act-ring" }));

            const dot = el("circle", {
                cx: p.x, cy: p.y, r: 7,
                class: "station-dot"
                    + (selection === s.id ? " selected" : "")
                    + (actInfo.ringStationIds.has(s.id) ? " act-target" : ""),
                "data-station-id": s.id
            });
            const title = el("title");
            title.textContent = `${s.name} (S${s.id})  x=${G.model.round6(s.x)} y=${G.model.round6(s.y)}`;
            dot.append(title);
            g.append(dot);

            const label = el("text", { x: p.x + 10, y: p.y - 8, class: "station-label" });
            label.textContent = s.name + " ";
            const idPart = el("tspan", { class: "station-id" });
            idPart.textContent = `(S${s.id})`;
            label.append(idPart);
            g.append(label);
        }
    }

    function render() {
        const model = cb.getModel();
        const message = cb.getMapMessage();

        msgEl.hidden = !message;
        if (message) msgEl.textContent = message;

        renderGrid();
        if (!model || message) {
            layers.act.replaceChildren();
            layers.lines.replaceChildren();
            layers.stations.replaceChildren();
            return;
        }
        const actInfo = G.actVisuals.compute(model, cb.getTestCase().act);
        renderActOverlay(actInfo);
        renderLines(model, actInfo);
        renderStations(model, actInfo);
    }

    function fit() {
        const model = cb.getModel();
        const { w, h } = size();
        if (!model || model.stations.length === 0) {
            view.cx = 10; view.cy = 0; view.scale = 18;
            render();
            return;
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const s of model.stations) {
            minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
            minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
        }
        // include act circles so a big CLOSE_AREA radius stays visible
        const actInfo = G.actVisuals.compute(model, cb.getTestCase().act);
        for (const c of actInfo.circles) {
            minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
            minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
        }
        const spanX = Math.max(maxX - minX, 1);
        const spanY = Math.max(maxY - minY, 1);
        view.cx = (minX + maxX) / 2;
        view.cy = (minY + maxY) / 2;
        view.scale = Math.min((w - 140) / spanX, (h - 140) / spanY);
        view.scale = Math.max(0.0005, Math.min(400, view.scale));
        render();
    }

    // ---- interaction -----------------------------------------------------------

    function snap(v, fine) {
        const step = fine ? 0.01 : 1;
        return Math.round(v / step) * step;
    }

    function initEvents() {
        let drag = null; // {type:'pan'|'station', ...}
        const touches = new Map(); // active touch pointers: pointerId -> screen point
        let pinch = null; // {dist, scale, wx, wy} — start distance/scale + world point under the midpoint

        // (re)anchor the pinch to the current first two fingers, e.g. when a finger lands or lifts
        function rebasePinch() {
            const [a, b] = touches.values();
            const mid = screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch = {
                dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
                scale: view.scale, wx: mid.x, wy: mid.y
            };
        }

        svg.addEventListener("pointerdown", (ev) => {
            if (ev.pointerType === "touch") {
                touches.set(ev.pointerId, eventPoint(ev));
                if (touches.size >= 2) {
                    // second finger turns any drag into a pinch; undo a half-dragged station
                    if (drag?.type === "station" && drag.moved) {
                        cb.onStationMoved(drag.station, drag.origX, drag.origY, false);
                        render();
                    }
                    drag = null;
                    svg.classList.remove("panning");
                    rebasePinch();
                    svg.setPointerCapture(ev.pointerId);
                    return;
                }
            }
            if (ev.button !== 0) return;
            const pt = eventPoint(ev);
            const stationId = ev.target.dataset?.stationId;
            if (stationId !== undefined && cb.canEdit()) {
                const model = cb.getModel();
                const station = model.stations.find(s => s.id === Number(stationId));
                if (!station) return;
                const w = screenToWorld(pt.x, pt.y);
                drag = {
                    type: "station", station,
                    origX: station.x, origY: station.y,
                    offX: station.x - w.x, offY: station.y - w.y,
                    moved: false
                };
            } else {
                drag = { type: "pan", startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, moved: false };
                svg.classList.add("panning");
            }
            svg.setPointerCapture(ev.pointerId);
        });

        svg.addEventListener("pointermove", (ev) => {
            if (ev.pointerType === "touch" && touches.has(ev.pointerId))
                touches.set(ev.pointerId, eventPoint(ev));
            if (pinch) {
                if (!touches.has(ev.pointerId)) return;
                const [a, b] = touches.values();
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                view.scale = Math.max(0.0005, Math.min(400, pinch.scale * dist / pinch.dist));
                // keep the world point that started under the fingers' midpoint under it
                const { w, h } = size();
                view.cx = pinch.wx - ((a.x + b.x) / 2 - w / 2) / view.scale;
                view.cy = pinch.wy + ((a.y + b.y) / 2 - h / 2) / view.scale;
                render();
                return;
            }
            const pt = eventPoint(ev);
            const w = screenToWorld(pt.x, pt.y);
            updateCursorReadout(w);

            if (!drag) return;
            if (drag.type === "pan") {
                view.cx = drag.cx - (pt.x - drag.startX) / view.scale;
                view.cy = drag.cy + (pt.y - drag.startY) / view.scale;
                drag.moved = drag.moved || Math.hypot(pt.x - drag.startX, pt.y - drag.startY) > 3;
                render();
            } else {
                const nx = snap(w.x + drag.offX, ev.shiftKey);
                const ny = snap(w.y + drag.offY, ev.shiftKey);
                if (nx !== drag.station.x || ny !== drag.station.y) {
                    drag.moved = true;
                    cb.onStationMoved(drag.station, nx, ny, false);
                    render();
                }
            }
        });

        // returns true if the lifted pointer belonged to an active pinch
        function liftPointer(ev) {
            if (ev.pointerType !== "touch" || !touches.delete(ev.pointerId) || !pinch)
                return false;
            if (touches.size >= 2) {
                rebasePinch();
            } else {
                pinch = null;
                if (touches.size === 1) {
                    // hand off to a one-finger pan without a jump
                    const [pt] = touches.values();
                    drag = { type: "pan", startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, moved: true };
                    svg.classList.add("panning");
                }
            }
            return true;
        }

        svg.addEventListener("pointerup", (ev) => {
            if (liftPointer(ev)) return;
            if (!drag) return;
            svg.classList.remove("panning");
            if (drag.type === "station") {
                if (drag.moved)
                    cb.onStationMoved(drag.station, drag.station.x, drag.station.y, true);
                else
                    cb.onSelect(drag.station.id);
            }
            drag = null;
        });

        svg.addEventListener("pointercancel", (ev) => {
            if (liftPointer(ev)) return;
            svg.classList.remove("panning");
            drag = null;
        });

        svg.addEventListener("wheel", (ev) => {
            ev.preventDefault();
            const pt = eventPoint(ev);
            const before = screenToWorld(pt.x, pt.y);
            const factor = Math.pow(1.0015, -ev.deltaY);
            view.scale = Math.max(0.0005, Math.min(400, view.scale * factor));
            const after = screenToWorld(pt.x, pt.y);
            view.cx += before.x - after.x;
            view.cy += before.y - after.y;
            render();
        }, { passive: false });

        svg.addEventListener("dblclick", (ev) => {
            if (ev.target.dataset?.stationId !== undefined) return;
            if (!cb.canEdit()) return;
            const pt = eventPoint(ev);
            const w = screenToWorld(pt.x, pt.y);
            cb.onAddStation(snap(w.x, ev.shiftKey), snap(w.y, ev.shiftKey));
        });

        new ResizeObserver(() => render()).observe(svg);
    }

    function updateCursorReadout(w) {
        try {
            const gps = G.geo.xyToGPS(w.x, w.y);
            cursorEl.textContent =
                `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}  |  ` +
                `lat ${gps.lat.toFixed(6)}  lon ${gps.lon.toFixed(6)}`;
        } catch {
            cursorEl.textContent = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}`;
        }
    }

    // Fits only when none of the shown model's stations are inside the viewport.
    function ensureVisible() {
        const model = cb.getModel();
        if (!model || model.stations.length === 0) return;
        const { w, h } = size();
        const anyVisible = model.stations.some(s => {
            const p = worldToScreen(s.x, s.y);
            return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
        });
        if (!anyVisible) fit();
    }

    function init(callbacks) {
        cb = callbacks;
        svg = document.getElementById("map");
        cursorEl = document.getElementById("cursor-pos");
        msgEl = document.getElementById("map-message");
        layers = {
            grid: document.getElementById("layer-grid"),
            act: document.getElementById("layer-act"),
            lines: document.getElementById("layer-lines"),
            stations: document.getElementById("layer-stations")
        };
        initEvents();
    }

    G.mapview = { init, render, fit, ensureVisible };
})();
