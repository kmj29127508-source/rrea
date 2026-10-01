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


if (typeof module !== "undefined" && module.exports) { module.exports = { progressSVG, shelfSVG, niceTicks, fmt, esc }; }
