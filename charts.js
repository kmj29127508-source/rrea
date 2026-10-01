"use strict";
/* charts.js — progressSVG/shelfSVG와 그 의존 함수만 모아둔 독립 파일.
   app.js(메인 웹앱)와 compute.html(Pyodide 계산 페이지) 둘 다 이 파일을 씀.
   app.js 쪽 로직은 안 건드리려고 일부러 따로 뺐어요. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d) => Number.isFinite(v)
  ? v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

function niceTicks(min, max, n = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function fmtHM(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}시간${mm ? ` ${mm}분` : ""}`;
}

/* ---------- 생산 라인 타임라인 + 선반 점유 (마우스로 훑어보는 버전) ----------
   production: [{step, sku_cd, sku_nm, qty, start_h, end_h, cells, ...}, ...]
   timeline:   [{t_h, cells}, ...]
   container에 SVG 2장(생산 띠, 선반 점유)과 움직이는 안내선 + 정보창을 직접 그려 넣음.
   마우스를 아무 데나 올리면 그 시각에 "뭘 만들고 있는지 + 선반 몇 칸인지"가 항상 뜸. */
function renderTimeline(container, production, timeline, cap) {
  const W = 960, L = 56, R = 24;
  const maxT = Math.max(production[production.length - 1].end_h, timeline[timeline.length - 1].t_h, 1);
  const xOf = (h) => L + (W - L - R) * (h / maxT);
  const hOf = (xFrac) => Math.max(0, Math.min(maxT, xFrac * maxT));

  // ① 생산 라인 띠
  const T1 = 10, barH = 46, B1 = 22, H1 = T1 + barH + B1;
  let g = `<svg viewBox="0 0 ${W} ${H1}" width="100%" style="display:block">`;
  production.forEach((p, i) => {
    const x0 = xOf(p.start_h), x1 = xOf(p.end_h);
    const w = Math.max(x1 - x0, 0.5);
    g += `<rect x="${x0.toFixed(1)}" y="${T1}" width="${w.toFixed(1)}" height="${barH}" fill="${i % 2 === 0 ? "#74c476" : "#41ab5d"}"/>`;
    if (w > 46) g += `<text x="${(x0 + w / 2).toFixed(1)}" y="${T1 + barH / 2 + 4}" text-anchor="middle" font-size="9.5" fill="#fff" style="pointer-events:none">${esc(p.sku_nm)}</text>`;
  });
  const everyH1 = Math.max(Math.ceil(maxT / 14), 1);
  for (let h = 0; h <= maxT; h += everyH1) {
    g += `<line x1="${xOf(h).toFixed(1)}" x2="${xOf(h).toFixed(1)}" y1="${T1}" y2="${T1 + barH}" stroke="#fff" stroke-opacity=".5"/>`;
    g += `<text class="tick" x="${xOf(h).toFixed(1)}" y="${T1 + barH + 15}" text-anchor="middle">${h}h</text>`;
  }
  g += `<line class="cursor-line" x1="0" x2="0" y1="${T1}" y2="${T1 + barH}" stroke="#212121" stroke-width="1.5" visibility="hidden"/>`;
  g += `</svg>`;

  // ② 선반 점유 (기존 shelfSVG와 같은 L/R/W를 써서 시간축이 그대로 맞춰짐)
  const T2 = 18, B2 = 30, H2 = 170, H2top = T2, H2bot = T2 + H2;
  const maxC = Math.max(...timeline.map((p) => p.cells), cap || 0, 1) * 1.1;
  const yOf = (v) => H2top + H2 * (1 - v / maxC);
  let step = `M${xOf(0).toFixed(1)},${yOf(timeline[0].cells).toFixed(1)} `;
  for (let i = 1; i < timeline.length; i++) {
    step += `L${xOf(timeline[i].t_h).toFixed(1)},${yOf(timeline[i - 1].cells).toFixed(1)} L${xOf(timeline[i].t_h).toFixed(1)},${yOf(timeline[i].cells).toFixed(1)} `;
  }
  let s2 = `<svg viewBox="0 0 ${W} ${H2top + H2 + B2}" width="100%" style="display:block">`;
  for (const t of niceTicks(0, maxC, 4)) s2 += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yOf(t)}" y2="${yOf(t)}"/><text class="tick" x="${L - 8}" y="${yOf(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`;
  s2 += `<path d="${step} L${xOf(maxT).toFixed(1)},${yOf(0).toFixed(1)} L${xOf(0).toFixed(1)},${yOf(0).toFixed(1)} Z" fill="#cb181d" fill-opacity="0.15" stroke="none"/>`;
  s2 += `<path d="${step}" fill="none" stroke="#cb181d" stroke-width="1.8"/>`;
  if (cap > 0) { s2 += `<line class="cap" x1="${L}" x2="${W - R}" y1="${yOf(cap)}" y2="${yOf(cap)}"/><text class="captxt" x="${W - R}" y="${yOf(cap) - 6}" text-anchor="end">선반 한도 ${fmt(cap, 0)}칸</text>`; }
  const everyH2 = Math.max(Math.ceil(maxT / 14), 1);
  for (let h = 0; h <= maxT; h += everyH2) s2 += `<text class="tick" x="${xOf(h).toFixed(1)}" y="${H2top + H2 + 16}" text-anchor="middle">${h}h</text>`;
  s2 += `<line class="cursor-line" x1="0" x2="0" y1="${H2top}" y2="${H2top + H2}" stroke="#212121" stroke-width="1.5" visibility="hidden"/>`;
  s2 += `</svg>`;

  container.innerHTML =
    `<div class="tl-wrap" style="position:relative">
       <div class="tl-info" style="display:none">
         <b class="tl-time"></b> · <span class="tl-sku"></span> · 선반 <b class="tl-cells"></b>칸
       </div>
       <div class="tl-gantt">${g}</div>
       <div class="tl-shelf">${s2}</div>
     </div>`;

  // 마우스 추적: 시각 하나를 고르면, 그 순간 뭘 만들고 있고 선반이 몇 칸인지 찾아서 보여줌
  const wrap = container.querySelector(".tl-wrap");
  const info = container.querySelector(".tl-info");
  const cursors = container.querySelectorAll(".cursor-line");
  const svgs = container.querySelectorAll("svg");

  function showAt(clientX, svgEl) {
    const rect = svgEl.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const h = hOf(frac);
    const px = xOf(h);
    cursors.forEach((c) => { c.setAttribute("x1", px.toFixed(1)); c.setAttribute("x2", px.toFixed(1)); c.setAttribute("visibility", "visible"); });

    let cur = production.find((p) => h >= p.start_h && h < p.end_h) || production[production.length - 1];
    let cellsAt = 0;
    for (const t of timeline) { if (t.t_h <= h) cellsAt = t.cells; else break; }

    info.style.display = "block";
    info.querySelector(".tl-time").textContent = fmtHM(h);
    info.querySelector(".tl-sku").textContent = `지금 만드는 중: ${cur.sku_nm}`;
    info.querySelector(".tl-cells").textContent = cellsAt.toLocaleString("ko-KR");
  }
  svgs.forEach((svgEl) => {
    svgEl.addEventListener("mousemove", (e) => showAt(e.clientX, svgEl));
    svgEl.addEventListener("touchmove", (e) => { if (e.touches[0]) showAt(e.touches[0].clientX, svgEl); }, { passive: true });
  });
  wrap.addEventListener("mouseleave", () => { cursors.forEach((c) => c.setAttribute("visibility", "hidden")); info.style.display = "none"; });
}

/* ---------- 상세 그래프 (생산 진행 / 선반 점유) — 하나의 (날짜,방법) detail JSON을 그림 ---------- */
function progressSVG(production) {
  const n = production.length;
  const W = 960, H = 460, L = 56, R = 56, T = 20, B = 46, MID = 18;
  const H1 = (H - T - B - MID) * 0.55, H2 = (H - T - B - MID) * 0.45;
  const y1top = T, y1bot = T + H1, y2top = y1bot + MID, y2bot = y2top + H2;

  const newOrders = production.map((p) => p.new_dd + p.new_pd);
  const cumReady = production.map((p) => p.cum_ready_dd + p.cum_ready_pd);
  const cumDone = production.map((p) => p.cum_done_dd + p.cum_done_pd);
  const durMin = production.map((p) => (p.end_h - p.start_h) * 60);
  const cumH = production.map((p) => p.end_h);

  const x = (i) => L + (W - L - R) * (n > 1 ? i / (n - 1) : 0.5);
  const bw = Math.max((W - L - R) / n - 1, 0.5);

  const maxNew = Math.max(...newOrders, 1) * 1.25;
  const maxCumOrd = Math.max(...cumReady, ...cumDone, 1) * 1.08;
  const yNew = (v) => y1bot - (H1 - 4) * (v / maxNew);
  const yCumOrd = (v) => y1top + (H1 - 4) * (1 - v / maxCumOrd);

  const maxDur = Math.max(...durMin, 1) * 1.15;
  const maxCumH = Math.max(...cumH, 1) * 1.06;
  const yDur = (v) => y2bot - (H2 - 4) * (v / maxDur);
  const yCumH = (v) => y2top + (H2 - 4) * (1 - v / maxCumH);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="생산 진행에 따른 주문 완료">`;
  // panel 1: 새로 처리가능 주문 수(막대) + 누적 처리가능/완료(선)
  for (const t of niceTicks(0, maxNew, 3)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yNew(t)}" y2="${yNew(t)}"/><text class="tick" x="${L - 8}" y="${yNew(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`;
  production.forEach((p, i) => {
    const yb = yNew(newOrders[i]);
    if (newOrders[i] > 0) s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y1bot - yb).toFixed(1)}" fill="${ACCENT_COLOR}" fill-opacity="0.55"><title>${p.step}번째 · ${esc(p.sku_nm)} · 새로 처리가능 ${newOrders[i]}건</title></rect>`;
  });
  // 제일 많이 완성시킨 상품 이름표(최대 4개, 겹치지 않게) — "뭘 만드는지" 바로 보이게
  // 겹침 판정: 새 라벨 폭 + 이미 놓인 라벨 폭을 "둘 다" 반영(한쪽만 보면 긴 이름에서 겹침)
  const labelWidthOf = (text) => (text.length + 2) * 6.3;   // text는 실제로 렌더링될 전체 글자(이름+숫자)여야 함
  const order = production.map((_, i) => i).sort((a, b) => newOrders[b] - newOrders[a]);
  const placed = [];   // {x, halfW}
  let labelRow = 0;
  for (const i of order.slice(0, 20)) {
    if (placed.length >= 4 || newOrders[i] <= 0) break;
    const xi = x(i);
    const labelText = `${production[i].sku_nm} +${newOrders[i]}`;
    const halfW = labelWidthOf(labelText) / 2;
    if (placed.some((q) => Math.abs(xi - q.x) < halfW + q.halfW + 8)) continue;
    placed.push({ x: xi, halfW });
    const yb = yNew(newOrders[i]);
    // 막대가 짧은 값이면 라벨이 패널 아래쪽 캡션 글자와 겹칠 수 있어서, 최소 높이를 띄워줌
    const ly = Math.min(yb - 6 - (labelRow % 2) * 13, y1bot - 18);
    labelRow++;
    s += `<text class="lbl" x="${xi.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5">${esc(labelText)}</text>`;
  }
  let pr1 = "", pd1 = "";
  cumReady.forEach((v, i) => { pr1 += `${i ? "L" : "M"}${x(i).toFixed(1)},${yCumOrd(v).toFixed(1)} `; });
  cumDone.forEach((v, i) => { pd1 += `${i ? "L" : "M"}${x(i).toFixed(1)},${yCumOrd(v).toFixed(1)} `; });
  s += `<path d="${pr1}" fill="none" stroke="#2171b5" stroke-width="1.8" stroke-dasharray="5 3"/>`;
  s += `<path d="${pd1}" fill="none" stroke="#2171b5" stroke-width="2.4"/>`;
  s += `<text class="tick" x="${L}" y="${y1top - 6}">새로 처리가능 주문수(막대) · 누적 처리가능(점선) · 누적 완료(실선)</text>`;

  // panel 2: 제품별 생산시간(막대) + 누적 생산완료시각(선)
  for (const t of niceTicks(0, maxDur, 3)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yDur(t)}" y2="${yDur(t)}"/><text class="tick" x="${L - 8}" y="${yDur(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`;
  production.forEach((p, i) => {
    const yb = yDur(durMin[i]);
    s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y2bot - yb).toFixed(1)}" fill="#a1d99b"><title>${p.step}번째 · ${esc(p.sku_nm)} · 생산시간 ${durMin[i].toFixed(1)}분</title></rect>`;
  });
  // 생산시간이 제일 오래 걸린 제품 이름표(최대 4개) — "지금 뭘 만드는지, 얼마나 걸리는지"
  // 겹침 판정: 새 라벨 폭 + 이미 놓인 라벨 폭을 "둘 다" 반영해야 함(한쪽만 보면 긴 이름에서 겹침)
  const durOrder = production.map((_, i) => i).sort((a, b) => durMin[b] - durMin[a]);
  const durPlaced = [];   // {x, halfW}
  let durRow = 0;
  for (const i of durOrder.slice(0, 30)) {
    if (durPlaced.length >= 4 || durMin[i] <= 0) break;
    const xi = x(i);
    const labelText = `${production[i].sku_nm} ${durMin[i].toFixed(0)}분`;
    const halfW = labelWidthOf(labelText) / 2;
    if (durPlaced.some((q) => Math.abs(xi - q.x) < halfW + q.halfW + 8)) continue;
    durPlaced.push({ x: xi, halfW });
    const yb = yDur(durMin[i]);
    const ly = Math.min(yb - 6 - (durRow % 2) * 13, y2bot - 18);
    durRow++;
    s += `<text class="lbl" x="${xi.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5">${esc(labelText)}</text>`;
  }
  let pl2 = "";
  cumH.forEach((v, i) => { pl2 += `${i ? "L" : "M"}${x(i).toFixed(1)},${yCumH(v).toFixed(1)} `; });
  s += `<path d="${pl2}" fill="none" stroke="#006d2c" stroke-width="2.2"/>`;
  s += `<text class="tick" x="${L}" y="${y2top - 6}">제품별 생산시간(막대, 분) · 누적 생산완료 시각(선, h)</text>`;
  for (const t of niceTicks(0, maxCumH, 4)) s += `<text class="tick" x="${W - R + 8}" y="${yCumH(t) + 4}" text-anchor="start">${fmt(t, 0)}h</text>`;

  s += `<text class="tick" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">생산 순번 (그날 몇 번째로 생산한 제품인지) →</text>`;
  return s + "</svg>";
}
const ACCENT_COLOR = "#9e4fb3";

function shelfSVG(timeline, cap) {
  const W = 960, H = 300, L = 56, R = 24, T = 18, B = 40;
  const maxC = Math.max(...timeline.map((p) => p.cells), cap || 0, 1) * 1.1;
  const maxT = Math.max(...timeline.map((p) => p.t_h), 1);
  const x = (v) => L + (W - L - R) * (v / maxT);
  const y = (v) => T + (H - T - B) * (1 - v / maxC);

  let step = `M${x(0).toFixed(1)},${y(timeline[0].cells).toFixed(1)} `;
  for (let i = 1; i < timeline.length; i++) {
    step += `L${x(timeline[i].t_h).toFixed(1)},${y(timeline[i - 1].cells).toFixed(1)} L${x(timeline[i].t_h).toFixed(1)},${y(timeline[i].cells).toFixed(1)} `;
  }
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="시간에 따른 선반 사용량">`;
  for (const t of niceTicks(0, maxC, 4)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`;
  const everyH = Math.max(Math.ceil(maxT / 12), 1);
  for (let h = 0; h <= maxT; h += everyH) s += `<text class="tick" x="${x(h)}" y="${H - B + 16}" text-anchor="middle">${h}h</text>`;
  s += `<path d="${step} L${x(maxT).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z" fill="#cb181d" fill-opacity="0.15" stroke="none"/>`;
  s += `<path d="${step}" fill="none" stroke="#cb181d" stroke-width="1.8"/>`;
  if (cap && cap > 0) {
    s += `<line class="cap" x1="${L}" x2="${W - R}" y1="${y(cap)}" y2="${y(cap)}"/>`;
    s += `<text class="captxt" x="${W - R}" y="${y(cap) - 6}" text-anchor="end">선반 한도 ${fmt(cap, 0)}칸</text>`;
  }
  return s + "</svg>";
}


if (typeof module !== "undefined" && module.exports) { module.exports = { progressSVG, shelfSVG, renderTimeline, fmtHM, niceTicks, fmt, esc }; }
