"use strict";

/* =====================================================================
   생산순서 최적화 방법 비교 — 화면 로직

   [규칙 조립기]
   results.csv 는 "1순위/2순위/3순위 조합(설정)"마다 미리 계산해둔 결과표예요.
   화면에서 드롭다운으로 고르면, 그 조합에 해당하는 행을 찾아서 보여줘요.
   브라우저 안에서 그 자리에 다시 계산하는 게 아니라, 미리 계산해둔 값을 "찾아오는" 거예요.
   (원본 주문 데이터를 브라우저로 보내지 않기 위해서예요)
   ===================================================================== */

const REQUIRED = ["날짜", "최대 사용 칸 수"];   // "설정" 또는 "변형" 둘 중 하나만 있으면 됨(아래서 따로 검사)
const FIELD = {
  scenario: "시나리오", config: "설정", date: "날짜",
  maxcells: "최대 사용 칸 수", avgcells: "평균 사용 칸 수(시간가중)",
  dd: "DD 처리 완료(h)", pd: "PD 처리 완료(h)", all: "전체 처리 완료(h)",
  obj3: "Obj3_완료시각합(h)", r50: "50%처리가능순번", idle: "피커유휴(h)",
};

/* 파이썬 greedy2.py 의 라벨과 반드시 같은 뜻이어야 해요(문구는 자유롭게 다듬어도 됨) */
const PRIMARY_LABELS = {
  count: "지금 만들면 바로 끝나는 주문 수",
  count_partial: "지금 만들면 바로 끝나는 주문 수 (거의 다 끝난 주문도 미리 반영)",
  count_ddweighted: "지금 만들면 바로 끝나는 주문 수 (새벽배송 주문을 2배 중요하게)",
};
const PRIMARY_HELP = {
  count: "그 상품을 만드는 순간, 필요한 게 다 갖춰져서 바로 포장 가능해지는 주문이 몇 건인지 세요.",
  count_partial: "완성되는 주문뿐 아니라, 이미 절반쯤 갖춰진 주문에도 조금씩 점수를 줘요. 그래서 \"거의 다 됐는데 하나가 부족한\" 주문들이 더 빨리 챙겨져요.",
  count_ddweighted: "완성되는 주문이 새벽배송(DD)이면 점수를 2배로 쳐서, 새벽배송을 더 우선해서 끝내려는 방식이에요.",
};
const TIE_LABELS = {
  none: "사용 안 함",
  time_asc: "생산시간이 짧은 것",
  demand_desc: "이 상품을 필요로 하는 대기 주문이 많은 것",
  cells_asc: "선반 칸을 적게 차지하는 것",
  qty_desc: "오늘 만들 개수가 많은 것",
};
const SORT_LABELS = {
  qty_desc: "오늘 만들 개수가 많은 순",
  qty_asc: "오늘 만들 개수가 적은 순",
  time_asc: "생산시간이 짧은 순",
  demand_desc: "필요로 하는 주문이 많은 순",
  cells_asc: "선반 칸을 적게 차지하는 순",
  code: "상품코드 순 (특별한 기준 없음)",
  random: "무작위",
};
const QTY_VS_DEMAND_NOTE =
  "\"만들 개수\"는 오늘 그 상품을 총 몇 개 만들어야 하는지예요. " +
  "\"필요로 하는 주문 수\"는 몇 명의 서로 다른 주문이 그 상품을 시켰는지예요. " +
  "한 사람이 대량으로 시키면 개수는 크지만 주문 수는 작을 수 있어요.";

const PRESETS = [
  { name: "baseline", label: "baseline (교수님이 주신 순서)", config: "sort:code", fixed: true,
    help: "비교 기준. 확인해보니 상품코드 오름차순과 완전히 같았어요(27일 전부)." },
  { name: "search:genetic", label: "자동 탐색(유전 알고리즘)", config: "search:genetic", fixed: true,
    help: "규칙 하나로 정하는 대신, 여러 순서 후보를 섞고 바꿔가며 선반 사용량이 가장 낮아지는 쪽으로 계속 개선한 결과예요. 계산이 느린 대신(수 초) 대체로 제일 낮은 칸 수가 나와요." },
];
const QUICK_FILLS = [
  { label: "예시: 개수 많은 순", family: "sort", key: "qty_desc" },
  { label: "예시: 그리디(대기 주문 많은 것)", family: "greedy", primary: "count", tie2: "demand_desc", tie3: "none" },
  { label: "예시: 그리디(완성 임박 반영)", family: "greedy", primary: "count_partial", tie2: "none", tie3: "none" },
];

const PALETTE_SEQ = ["#c96f3b", "#1f6f8b", "#7a5c99", "#3b9ab5", "#e08a4f", "#5a9367", "#b8574f", "#8a9099"];
const WD = ["일", "월", "화", "수", "목", "금", "토"];

/* ---------- 작은 유틸 ---------- */
function num(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "nan") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const finite = (a) => a.filter(Number.isFinite);
const mean = (a) => { const b = finite(a); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : NaN; };
const maxOf = (a) => { const b = finite(a); return b.length ? Math.max(...b) : NaN; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d) => Number.isFinite(v)
  ? v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
const shortDate = (s) => s.slice(5);

/* ---------- 설정(config) id <-> 뜻 ---------- */
function parseConfig(id) {
  const p = id.split(":");
  if (p[0] === "sort") return { family: "sort", key: p[1] };
  if (p[0] === "greedy") return { family: "greedy", primary: p[1], tie2: p[2], tie3: p[3] };
  if (p[0] === "search") return { family: "search", kind: p[1] };
  return null;
}
function configId(o) {
  if (o.family === "sort") return `sort:${o.key}`;
  return `greedy:${o.primary}:${o.tie2}:${o.tie3}`;
}
function describeConfig(id) {
  const c = parseConfig(id);
  if (!c) return id;
  if (c.family === "search") return "여러 순서 후보를 섞고 바꿔가며 자동으로 개선한 결과예요.";
  if (c.family === "sort") return `한 번에 순서를 정해요 — 기준: ${SORT_LABELS[c.key] || c.key}`;
  const parts = [`1순위: ${PRIMARY_LABELS[c.primary] || c.primary}`];
  if (c.tie2 !== "none") parts.push(`2순위(동점이면): ${TIE_LABELS[c.tie2] || c.tie2}`);
  if (c.tie3 !== "none") parts.push(`3순위(그래도 동점이면): ${TIE_LABELS[c.tie3] || c.tie3}`);
  return "매 순간 다시 계산해요(그리디) — " + parts.join(" · ");
}
function shortLabel(id) {
  const c = parseConfig(id);
  if (!c) return id;
  if (c.family === "search") return "자동 탐색";
  if (c.family === "sort") return "정렬: " + (SORT_LABELS[c.key] || c.key);
  let s = "그리디: " + (c.primary === "count" ? "기본" : c.primary === "count_partial" ? "완성임박반영" : "DD가중");
  if (c.tie2 !== "none") s += " · " + (TIE_LABELS[c.tie2] || c.tie2).slice(0, 8) + (TIE_LABELS[c.tie2].length > 8 ? "…" : "");
  return s;
}

/* 예전 버전(V0~V5, R1~R7, L1, L2 같은 고정 이름) 파일을 새 규칙(설정 id)으로 자동 변환.
   L1(그리디+개선탐색)은 지금 체계에 대응하는 게 없어서 변환 못 함(제외됨). */
const LEGACY_ID_MAP = {
  "baseline": "sort:code", "R1_코드순": "sort:code",
  "R2_수량많은순": "sort:qty_desc", "R3_수량적은순": "sort:qty_asc",
  "R4_생산시간짧은순": "sort:time_asc", "R5_주문많이걸린순": "sort:demand_desc",
  "R6_칸적은순": "sort:cells_asc", "R7_무작위": "sort:random",
  "V0_이름순": "greedy:count:none:none", "V1_생산시간짧은": "greedy:count:time_asc:none",
  "V2_수요많은": "greedy:count:demand_desc:none", "V3_칸적은": "greedy:count:cells_asc:none",
  "V4_DD가중2": "greedy:count_ddweighted:none:none", "V5_부분점수": "greedy:count_partial:none:none",
  "L2_유전알고리즘": "search:genetic",
};

/* ---------- CSV 읽기 ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* 무시 */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function decodeBuffer(buf) {
  let t = new TextDecoder("utf-8").decode(buf);
  if ((!t.includes("설정") && !t.includes("변형")) || t.includes("\uFFFD")) {
    try {
      const k = new TextDecoder("euc-kr").decode(buf);
      if (k.includes("설정") || k.includes("변형")) t = k;
    } catch (e) { /* 무시 */ }
  }
  return t;
}

function normalizeRows(table) {
  if (!table.length) return { rows: [], error: "빈 파일입니다." };
  const header = table[0].map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  const hasNew = header.includes("설정"), hasLegacy = header.includes("변형");
  if (missing.length || (!hasNew && !hasLegacy)) {
    const allMissing = [...missing, ...(hasNew || hasLegacy ? [] : ["설정(또는 변형)"])];
    return { rows: [], error: `필수 열이 없습니다: ${allMissing.join(", ")}. ` +
      `export_builder.py 로 만든 results.csv 인지 확인하세요. (찾은 열: ${header.slice(0, 6).join(", ")}…)` };
  }
  const col = {};
  for (const [k, name] of Object.entries(FIELD)) col[k] = header.indexOf(name);
  if (!hasNew) col.config = header.indexOf("변형");   // 예전 파일: "변형" 열을 config 자리에서 읽음

  const rows = [];
  const droppedIds = new Set();
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const get = (k) => (col[k] >= 0 ? r[col[k]] : undefined);
    let config = String(get("config") ?? "").trim();
    const date = String(get("date") ?? "").trim().slice(0, 10);
    if (!config || !date) continue;
    if (!hasNew) {   // 예전 이름(V0_이름순 등)이면 지금 규칙 체계의 id로 변환
      const mapped = LEGACY_ID_MAP[config];
      if (!mapped) { droppedIds.add(config); continue; }
      config = mapped;
    }
    rows.push({
      scenario: (String(get("scenario") ?? "").trim()) || "기본",
      config, date,
      maxcells: num(get("maxcells")), avgcells: num(get("avgcells")),
      dd: num(get("dd")), pd: num(get("pd")), all: num(get("all")),
      obj3: num(get("obj3")), r50: num(get("r50")), idle: num(get("idle")),
    });
  }
  if (!rows.length) return { rows: [], error: "읽을 수 있는 데이터 행이 없습니다." };
  return { rows, legacy: !hasNew, dropped: [...droppedIds] };
}

/* ---------- 집계 / 순위 ---------- */
const STATS = [
  { key: "maxOfMax", label: "월최대칸", d: 0, fn: (r) => maxOf(r.map((x) => x.maxcells)) },
  { key: "meanMax", label: "평균최대칸", d: 1, fn: (r) => mean(r.map((x) => x.maxcells)) },
  { key: "meanAvg", label: "평균칸(시간가중)", d: 1, fn: (r) => mean(r.map((x) => x.avgcells)) },
  { key: "dd", label: "DD완료(h)", d: 2, fn: (r) => mean(r.map((x) => x.dd)) },
  { key: "pd", label: "PD완료(h)", d: 2, fn: (r) => mean(r.map((x) => x.pd)) },
  { key: "all", label: "전체완료(h)", d: 2, fn: (r) => mean(r.map((x) => x.all)) },
  { key: "obj3", label: "Obj3(h)", d: 0, fn: (r) => mean(r.map((x) => x.obj3)) },
  { key: "r50", label: "50%순번", d: 1, fn: (r) => mean(r.map((x) => x.r50)) },
  { key: "idle", label: "피커유휴(h)", d: 1, fn: (r) => mean(r.map((x) => x.idle)) },
  { key: "over", label: "한도초과일수", d: 0, fn: (r, ctx) => r.filter((x) => x.maxcells > ctx.cap).length },
];
const STAT = Object.fromEntries(STATS.map((s) => [s.key, s]));
const DAY_METRICS = [
  { key: "maxcells", label: "최대 사용 칸 수", d: 0 },
  { key: "avgcells", label: "평균 사용 칸 수(시간가중)", d: 1 },
  { key: "dd", label: "DD 처리 완료(h)", d: 2 },
  { key: "pd", label: "PD 처리 완료(h)", d: 2 },
  { key: "all", label: "전체 처리 완료(h)", d: 2 },
  { key: "obj3", label: "Obj3 (완료시각 합, h)", d: 0 },
  { key: "r50", label: "50% 처리 가능 순번", d: 0 },
  { key: "idle", label: "피커 유휴(h)", d: 1 },
];

function aggregate(rows, { scenario, configs, dates, cap }) {
  const dset = new Set(dates), cset = new Set(configs), by = new Map();
  for (const r of rows) {
    if (r.scenario !== scenario || !cset.has(r.config) || !dset.has(r.date)) continue;
    if (!by.has(r.config)) by.set(r.config, []);
    by.get(r.config).push(r);
  }
  const out = [];
  for (const [config, rs] of by) {
    const stats = {};
    for (const s of STATS) stats[s.key] = s.fn(rs, { cap });
    stats.pdN = finite(rs.map((x) => x.pd)).length;
    out.push({ config, n: new Set(rs.map((x) => x.date)).size, stats });
  }
  return out;
}

function rankItems(aggs, criteria) {
  const cmp = (a, b) => {
    for (const k of criteria) {
      const x = a.stats[k], y = b.stats[k];
      const xn = Number.isNaN(x), yn = Number.isNaN(y);
      if (xn && yn) continue;
      if (xn) return 1;
      if (yn) return -1;
      if (Math.abs(x - y) > 1e-9) return x - y;
    }
    return a.config.localeCompare(b.config, "ko", { numeric: true });
  };
  return [...aggs].sort(cmp).map((a, i) => ({ ...a, rank: i + 1 }));
}

function perDay(rows, { scenario, config, dates, metric }) {
  const map = new Map();
  for (const r of rows) if (r.scenario === scenario && r.config === config) map.set(r.date, r[metric]);
  return dates.map((d) => (map.has(d) ? map.get(d) : NaN));
}

/* ---------- SVG 그래프 ---------- */
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

function barSVG(items, { cap = null, d = 0 } = {}) {
  const W = 960, L = 230, R = 90, rowH = 34, top = 30, bottom = 30;
  const H = top + items.length * rowH + bottom;
  const vals = finite(items.map((i) => i.value));
  const maxV = Math.max(...vals, cap || 0, 1) * 1.08;
  const x = (v) => L + (W - L - R) * (v / maxV);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="비교 막대그래프">`;
  for (const t of niceTicks(0, maxV, 5)) {
    s += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${H - bottom}"/>` +
         `<text class="tick" x="${x(t)}" y="${H - bottom + 18}" text-anchor="middle">${fmt(t, 0)}</text>`;
  }
  items.forEach((it, i) => {
    const y = top + i * rowH, w = Number.isFinite(it.value) ? Math.max(x(it.value) - L, 0) : 0;
    s += `<text class="lbl${it.isBase ? " base" : ""}" x="${L - 10}" y="${y + rowH / 2 + 5}" text-anchor="end">${esc(it.name)}</text>` +
         `<rect x="${L}" y="${y + 5}" width="${w}" height="${rowH - 10}" rx="3" fill="${it.color}"><title>${esc(it.name)}: ${fmt(it.value, d)}</title></rect>` +
         `<text class="val" x="${L + w + 8}" y="${y + rowH / 2 + 5}">${fmt(it.value, d)}</text>`;
  });
  if (cap && cap > 0 && cap < maxV) {
    s += `<line class="cap" x1="${x(cap)}" x2="${x(cap)}" y1="${top}" y2="${H - bottom}"/>` +
         `<text class="captxt" x="${x(cap)}" y="${top - 10}" text-anchor="middle">선반 한도 ${fmt(cap, 0)}칸</text>`;
  }
  return s + "</svg>";
}

function lineSVG(series, dates, { cap = null, d = 0 } = {}) {
  const W = 960, H = 400, L = 62, R = 24, T = 18, B = 62;
  const all = finite(series.flatMap((s) => s.values));
  if (!all.length) return `<p class="empty">표시할 값이 없습니다.</p>`;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (cap && cap > 0) { lo = Math.min(lo, cap); hi = Math.max(hi, cap); }
  const pad = (hi - lo || 1) * 0.08;
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = (i) => L + (dates.length > 1 ? (W - L - R) * (i / (dates.length - 1)) : (W - L - R) / 2);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 추이 선그래프">`;
  for (const t of niceTicks(lo, hi, 5)) {
    s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>` +
         `<text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t, d > 0 && hi - lo < 20 ? 1 : 0)}</text>`;
  }
  const every = Math.ceil(dates.length / 14);
  dates.forEach((dt, i) => {
    if (i % every) return;
    s += `<text class="tick" transform="translate(${x(i)},${H - B + 16}) rotate(-40)" text-anchor="end">${shortDate(dt)}(${WD[weekday(dt)]})</text>`;
  });
  if (cap && cap > 0) {
    s += `<line class="cap" x1="${L}" x2="${W - R}" y1="${y(cap)}" y2="${y(cap)}"/>` +
         `<text class="captxt" x="${W - R - 4}" y="${y(cap) - 6}" text-anchor="end">선반 한도 ${fmt(cap, 0)}칸</text>`;
  }
  for (const se of series) {
    let path = "", pen = false;
    se.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true;
    });
    s += `<path d="${path}" fill="none" stroke="${se.color}" stroke-width="${se.isBase ? 3 : 2}" ${se.isBase ? 'stroke-dasharray="6 4"' : ""}/>`;
    se.values.forEach((v, i) => {
      if (Number.isFinite(v)) s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${se.color}"><title>${esc(se.name)} · ${dates[i]} · ${fmt(v, d)}</title></circle>`;
    });
  }
  return s + "</svg>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseCSV, normalizeRows, aggregate, rankItems, perDay, decodeBuffer, STATS,
                     barSVG, lineSVG, weekday, niceTicks, parseConfig, configId, describeConfig,
                     shortLabel, PRIMARY_LABELS, TIE_LABELS, SORT_LABELS, progressSVG, shelfSVG };
}

/* =====================================================================
   화면 (브라우저에서만)
   ===================================================================== */
if (typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", initUI);
}

function initUI() {
  const $ = (s) => document.querySelector(s);
  const S = {
    rows: [], scenarios: [], scenario: "", allConfigsInData: new Set(), allDates: [],
    items: [], colorMap: {}, nextColor: 0,
    crit: ["maxOfMax", "meanMax", "dd"], cap: 200,
    barMetric: "maxOfMax", barSort: "rank", lineMetric: "maxcells", hidden: new Set(),
    isSample: false, source: "",
    builder: { family: "greedy", sortKey: "qty_desc", primary: "count", tie2: "none", tie3: "none" },
  };

  function colorFor(name) {
    if (name === "baseline") return "#111111";
    if (!S.colorMap[name]) { S.colorMap[name] = PALETTE_SEQ[S.nextColor % PALETTE_SEQ.length]; S.nextColor++; }
    return S.colorMap[name];
  }

  /* ----- 데이터 넣기 ----- */
  function setData(text, source, isSample) {
    const parsed = normalizeRows(parseCSV(text));
    const msg = $("#loadMsg");
    if (parsed.error) { msg.className = "load-msg err"; msg.textContent = parsed.error; return false; }
    S.rows = parsed.rows; S.isSample = !!isSample; S.source = source;
    S.scenarios = [...new Set(S.rows.map((r) => r.scenario))];
    S.scenario = S.scenarios[0];
    S.allConfigsInData = new Set(S.rows.map((r) => r.config));
    S.allDates = [...new Set(S.rows.map((r) => r.date))].sort();
    S.items = PRESETS.filter((p) => p.config === null || S.allConfigsInData.has(p.config))
      .map((p) => ({ id: p.name, label: p.label, config: p.config, fixed: true, help: p.help }));
    msg.className = "load-msg ok";
    let m = `${source} — ${S.rows.length.toLocaleString()}행, 설정 ${S.allConfigsInData.size}개, 날짜 ${S.allDates.length}일, 시나리오 ${S.scenarios.length}개`;
    if (parsed.legacy) {
      m += `\n예전 방식(변형 이름) 파일이라 지금 규칙 체계로 자동 변환했어요.`;
      if (parsed.dropped.length) m += ` ${parsed.dropped.join(", ")}은(는) 지금 체계에 대응하는 게 없어 제외됐어요.`;
    }
    msg.textContent = m;
    buildControls(); render();
    return true;
  }

  async function loadFile(file) {
    const buf = await file.arrayBuffer();
    setData(decodeBuffer(buf), file.name, false);
  }

  async function autoLoad() {
    try {
      for (const path of ["data/results.csv", "results.csv"]) {
        try {
          const res = await fetch(path, { cache: "no-store" });
          if (res.ok) { setData(decodeBuffer(await res.arrayBuffer()), path, false); return; }
        } catch (e) { /* 이 경로엔 없음, 다음 경로 시도 */ }
      }
    } catch (e) { /* file:// 등에서는 실패 → 아래 샘플 */ }
    if (typeof window.SAMPLE_CSV === "string") { setData(window.SAMPLE_CSV, "샘플 데이터", true); return; }
    // <script> 태그로 미리 못 불러왔으면(예: data/ 폴더 없이 루트에 올린 경우), fetch로 직접 시도
    for (const path of ["data/sample_results.csv", "sample_results.csv"]) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (res.ok) { setData(decodeBuffer(await res.arrayBuffer()), "샘플 데이터", true); return; }
      } catch (e) { /* 이 경로엔 없음, 다음 경로 시도 */ }
    }
    $("#loadMsg").className = "load-msg err";
    $("#loadMsg").textContent = "데이터가 없습니다. 위 상자에 results.csv 를 끌어다 놓으세요.";
    $("#main").classList.add("nodata");
  }

  /* ----- 규칙 조립기 ----- */
  function builderConfigId() {
    const b = S.builder;
    if (b.family === "sort") return configId({ family: "sort", key: b.sortKey });
    return configId({ family: "greedy", primary: b.primary, tie2: b.tie2, tie3: b.tie3 });
  }

  function renderBuilder() {
    const b = S.builder;
    $("#bFamilySort").checked = b.family === "sort";
    $("#bFamilyGreedy").checked = b.family === "greedy";
    $("#sortBlock").hidden = b.family !== "sort";
    $("#greedyBlock").hidden = b.family !== "greedy";

    if (!$("#bSortKey").options.length) {
      $("#bSortKey").innerHTML = Object.entries(SORT_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
      $("#bPrimary").innerHTML = Object.entries(PRIMARY_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
      const tieOpts = Object.entries(TIE_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
      $("#bTie2").innerHTML = tieOpts; $("#bTie3").innerHTML = tieOpts;
    }
    $("#bSortKey").value = b.sortKey;
    $("#bPrimary").value = b.primary;
    $("#bTie2").value = b.tie2;
    $("#bTie3").value = b.tie3;
    $("#bTie3").disabled = b.tie2 === "none";
    if (b.tie2 === "none") b.tie3 = "none";

    $("#bPrimaryHelp").textContent = PRIMARY_HELP[b.primary];
    const cid = builderConfigId();
    const inData = S.allConfigsInData.has(cid);
    $("#bSentence").innerHTML = `<strong>지금 조립한 규칙:</strong> ${esc(describeConfig(cid))}`;
    $("#bAddBtn").disabled = !inData;
    $("#bMissing").hidden = inData;
    if (!inData) $("#bMissing").textContent = "이 조합은 results.csv에 아직 없어요. export_builder.py로 다시 만들면 추가돼요.";
  }

  function addItemFromBuilder() {
    const cid = builderConfigId();
    if (!S.allConfigsInData.has(cid)) return;
    if (S.items.some((it) => it.config === cid)) return;   // 이미 추가됨
    S.items.push({ id: "custom:" + cid + ":" + Date.now(), label: shortLabel(cid), config: cid, fixed: false, help: describeConfig(cid) });
    renderItemList(); render();
  }

  function applyQuickFill(q) {
    S.builder.family = q.family;
    if (q.family === "sort") S.builder.sortKey = q.key;
    else { S.builder.primary = q.primary; S.builder.tie2 = q.tie2; S.builder.tie3 = q.tie3; }
    renderBuilder();
  }

  /* ----- 항목(비교 대상) 목록 ----- */
  function renderItemList() {
    $("#itemList").innerHTML = S.items.map((it) => `
      <li class="item-row" title="${esc(it.help || "")}">
        <span class="dot" style="background:${colorFor(it.id)}"></span>
        <span class="item-label">${esc(it.label)}</span>
        ${it.fixed ? "" : `<button type="button" class="item-del" data-id="${esc(it.id)}" aria-label="삭제">×</button>`}
      </li>`).join("");
    $("#itemList").querySelectorAll(".item-del").forEach((btn) => btn.addEventListener("click", () => {
      S.items = S.items.filter((it) => it.id !== btn.dataset.id);
      S.hidden.delete(btn.dataset.id);
      renderItemList(); render();
    }));
  }

  /* ----- 컨트롤 만들기 ----- */
  function optionList(items, sel) {
    return items.map((o) => `<option value="${esc(o.key)}"${o.key === sel ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  }

  function buildControls() {
    $("#main").classList.remove("nodata");
    const sc = $("#scenario");
    sc.innerHTML = S.scenarios.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    sc.value = S.scenario;
    $("#scenarioWrap").hidden = S.scenarios.length < 2;

    [1, 2, 3].forEach((n, i) => { $("#crit" + n).innerHTML = optionList(STATS, S.crit[i]); });
    $("#barMetric").innerHTML = optionList(STATS, S.barMetric);
    $("#lineMetric").innerHTML = optionList(DAY_METRICS, S.lineMetric);
    $("#cap").value = S.cap;

    $("#quickFills").innerHTML = QUICK_FILLS.map((q, i) => `<button type="button" data-i="${i}">${esc(q.label)}</button>`).join("");
    $("#quickFills").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => applyQuickFill(QUICK_FILLS[b.dataset.i])));

    S.selDates = new Set(S.allDates);
    const dbox = $("#dateBox");
    dbox.innerHTML = S.allDates.map((d) =>
      `<label class="chk small"><input type="checkbox" data-d="${d}" checked>` +
      `${shortDate(d)} <em>${WD[weekday(d)]}</em></label>`).join("");
    dbox.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      inp.checked ? S.selDates.add(inp.dataset.d) : S.selDates.delete(inp.dataset.d);
      render();
    }));

    renderBuilder();
    renderItemList();
  }

  /* ----- 그리기 ----- */
  function render() {
    if (!S.rows.length) return;
    const dates = S.allDates.filter((d) => S.selDates.has(d));
    const items = S.items;
    const configs = items.map((it) => it.config);
    const aggs = aggregate(S.rows, { scenario: S.scenario, configs, dates, cap: S.cap });
    const byConfig = Object.fromEntries(aggs.map((a) => [a.config, a]));
    const ranked = rankItems(items.filter((it) => byConfig[it.config]).map((it) => ({ ...byConfig[it.config], id: it.id, label: it.label })), S.crit);
    const base = ranked.find((r) => r.id === "baseline");
    const c1 = STAT[S.crit[0]];

    $("#subtitle").textContent =
      `시나리오: ${S.scenario} · 날짜 ${dates.length}일 · 항목 ${ranked.length}개 · 판정 기준: ` +
      S.crit.map((k) => STAT[k].label).join(" → ");
    const banner = $("#banner");
    banner.hidden = !S.isSample;
    banner.textContent = "샘플 데이터입니다. 임시 크기표로 만든 값이라 실제 결과가 아니에요. data/results.csv 를 올리면 이 표시는 사라져요.";

    /* KPI */
    const kp = $("#kpis");
    if (!ranked.length) {
      kp.innerHTML = `<div class="kpi wide"><b>왼쪽에서 규칙을 하나 이상 추가하세요</b><span>규칙 조립기에서 "이 규칙 추가하기"를 눌러보세요.</span></div>`;
    } else {
      const best = ranked[0];
      const delta = base && Number.isFinite(base.stats[c1.key]) && base.stats[c1.key] !== 0 && best !== base
        ? (best.stats[c1.key] - base.stats[c1.key]) / base.stats[c1.key] * 100 : null;
      const overB = base ? base.stats.over : null, nd = dates.length;
      kp.innerHTML =
        `<div class="kpi"><span>1위</span><b>${esc(best.label)}</b><small>${c1.label} ${fmt(best.stats[c1.key], c1.d)}</small></div>` +
        `<div class="kpi"><span>baseline 대비 (${c1.label})</span><b class="${delta !== null && delta < 0 ? "good" : ""}">${delta === null ? "—" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%"}</b>` +
        `<small>${base ? "baseline " + fmt(base.stats[c1.key], c1.d) : "baseline 미선택"}</small></div>` +
        `<div class="kpi"><span>선반 ${fmt(S.cap, 0)}칸 초과 일수</span><b>${fmt(ranked[0].stats.over, 0)} / ${nd}일</b>` +
        `<small>${overB === null ? "baseline 미선택" : "baseline " + fmt(overB, 0) + " / " + nd + "일"}</small></div>` +
        `<div class="kpi"><span>비교 대상</span><b>${ranked.length}개</b><small>${dates.length}일 · ${esc(S.scenario)}</small></div>`;
    }

    /* 표 */
    const cols = ["maxOfMax", "meanMax", "meanAvg", "dd", "pd", "all", "obj3", "r50", "over"];
    const th = (k) => { const i = S.crit.indexOf(k); return `<th class="num${i >= 0 ? " crit" : ""}">${STAT[k].label}${i >= 0 ? `<sup>${i + 1}</sup>` : ""}</th>`; };
    $("#rankTable").innerHTML =
      `<thead><tr><th>순위</th><th>규칙</th>${cols.map(th).join("")}<th class="num">날짜수</th><th class="num">baseline 대비<sup>${c1.label}</sup></th></tr></thead><tbody>` +
      ranked.map((r) => {
        const b = base && base !== r && base.stats[c1.key] ? (r.stats[c1.key] - base.stats[c1.key]) / base.stats[c1.key] * 100 : null;
        return `<tr class="${r.id === "baseline" ? "is-base" : ""}"><td>${r.rank}</td>` +
          `<td title="${esc(describeConfig(r.config) || "")}"><span class="dot" style="background:${colorFor(r.id)}"></span>${esc(r.label)}</td>` +
          cols.map((k) => `<td class="num${S.crit.includes(k) ? " crit" : ""}">${fmt(r.stats[k], STAT[k].d)}</td>`).join("") +
          `<td class="num${r.n !== dates.length ? " warn" : ""}">${r.n}</td>` +
          `<td class="num ${b !== null && b < 0 ? "good" : ""}">${b === null ? "—" : (b > 0 ? "+" : "") + b.toFixed(1) + "%"}</td></tr>`;
      }).join("") + "</tbody>";

    /* 막대 그래프 */
    const bm = STAT[S.barMetric];
    let bars = ranked.map((r) => ({ name: r.label, value: r.stats[bm.key], color: colorFor(r.id), isBase: r.id === "baseline" }));
    if (S.barSort === "value") bars.sort((a, b) => (Number.isNaN(a.value) - Number.isNaN(b.value)) || a.value - b.value);
    const capOn = S.barMetric === "maxOfMax" || S.barMetric === "meanMax";
    $("#barChart").innerHTML = bars.length ? barSVG(bars, { cap: capOn ? S.cap : null, d: bm.d }) : "";

    /* 선 그래프 */
    const lm = DAY_METRICS.find((m) => m.key === S.lineMetric);
    const series = ranked.filter((r) => !S.hidden.has(r.id)).map((r) => ({
      name: r.label, color: colorFor(r.id), isBase: r.id === "baseline",
      values: perDay(S.rows, { scenario: S.scenario, config: r.config, dates, metric: lm.key }),
    }));
    $("#lineChart").innerHTML = ranked.length ? lineSVG(series, dates, { cap: lm.key === "maxcells" ? S.cap : null, d: lm.d }) : "";
    $("#legend").innerHTML = ranked.map((r) =>
      `<button type="button" class="leg${S.hidden.has(r.id) ? " off" : ""}" data-id="${esc(r.id)}">` +
      `<span class="dot" style="background:${colorFor(r.id)}"></span>${esc(r.label)}</button>`).join("");
    $("#legend").querySelectorAll(".leg").forEach((b) => b.addEventListener("click", () => {
      S.hidden.has(b.dataset.id) ? S.hidden.delete(b.dataset.id) : S.hidden.add(b.dataset.id);
      render();
    }));

    /* 주의 문구 */
    const notes = [
      "판정 기준은 설정의 1→2→3순위 순서대로 값이 낮은 규칙이 앞서요. 결과를 보기 전에 정해두는 게 좋아요.",
      "생산시간이 임의 값이라 절대 시간보다 baseline 대비 비율로 읽는 게 안전해요.",
      "자동 탐색(유전 알고리즘)은 판정 기준과 같은 점수를 직접 줄이는 방법이라 그 지표에서 유리해요. 규칙 하나로 충분한지 보는 용도예요.",
      `선반 한도(${fmt(S.cap, 0)}칸)는 회의에서 나온 실제 선반 개수이고, 시뮬레이터 코드에는 없는 값이에요.`,
      QTY_VS_DEMAND_NOTE,
    ];
    const uneven = ranked.some((r) => r.n !== dates.length);
    if (uneven) notes.push("날짜수가 선택한 날짜 수와 다른 규칙이 있어요(표에서 주황색). 그대로 평균을 비교하면 안 돼요.");
    const pdAllFull = ranked.every((r) => r.stats.pdN === dates.length);
    if (!pdAllFull) notes.push("PD 주문이 없는 날은 'PD완료' 평균에서 빠져요. 그래서 '전체완료'가 'PD완료'보다 작게 보일 수 있어요 — 서로 다른 날짜 수로 평균 낸 값이라 그래요. 하루 단위로는 전체완료가 항상 DD·PD완료보다 크거나 같아요.");
    $("#notes").innerHTML = "<h2>읽을 때 주의</h2><ul>" + notes.map((n) => `<li>${esc(n)}</li>`).join("") + "</ul>";
  }

  /* ----- 이벤트 ----- */
  $("#scenario").addEventListener("change", (e) => { S.scenario = e.target.value; render(); });
  [1, 2, 3].forEach((n, i) => $("#crit" + n).addEventListener("change", (e) => { S.crit[i] = e.target.value; render(); }));
  $("#cap").addEventListener("input", (e) => { const v = Number(e.target.value); S.cap = Number.isFinite(v) && v >= 0 ? v : 200; render(); });
  $("#barMetric").addEventListener("change", (e) => { S.barMetric = e.target.value; render(); });
  $("#barSort").addEventListener("change", (e) => { S.barSort = e.target.value; render(); });
  $("#lineMetric").addEventListener("change", (e) => { S.lineMetric = e.target.value; render(); });

  $("#dAll").addEventListener("click", () => { S.selDates = new Set(S.allDates); syncDates(); render(); });
  $("#dMon").addEventListener("click", () => { S.selDates = new Set(S.allDates.filter((d) => weekday(d) === 1)); syncDates(); render(); });
  $("#dWeek").addEventListener("click", () => { S.selDates = new Set(S.allDates.filter((d) => weekday(d) >= 1 && weekday(d) <= 5)); syncDates(); render(); });
  $("#dNone").addEventListener("click", () => { S.selDates = new Set(); syncDates(); render(); });
  function syncDates() { document.querySelectorAll("#dateBox input").forEach((i) => { i.checked = S.selDates.has(i.dataset.d); }); }

  $("#bFamilySort").addEventListener("change", () => { S.builder.family = "sort"; renderBuilder(); });
  $("#bFamilyGreedy").addEventListener("change", () => { S.builder.family = "greedy"; renderBuilder(); });
  $("#bSortKey").addEventListener("change", (e) => { S.builder.sortKey = e.target.value; renderBuilder(); });
  $("#bPrimary").addEventListener("change", (e) => { S.builder.primary = e.target.value; renderBuilder(); });
  $("#bTie2").addEventListener("change", (e) => { S.builder.tie2 = e.target.value; renderBuilder(); });
  $("#bTie3").addEventListener("change", (e) => { S.builder.tie3 = e.target.value; renderBuilder(); });
  $("#bAddBtn").addEventListener("click", addItemFromBuilder);

  $("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  function renderDetail(detail) {
    const cfgName = shortLabel(detail.config) || detail.config;
    $("#detailTitle").textContent = `${detail.date} · ${cfgName}${detail.scenario ? " · " + detail.scenario : ""}`;
    $("#progressChart").innerHTML = progressSVG(detail.production);
    $("#shelfChart").innerHTML = shelfSVG(detail.timeline, S.cap);
    $("#detailBody").hidden = false;
  }

  async function loadDetailFile(file) {
    const msg = $("#detailMsg");
    try {
      const text = decodeBuffer(await file.arrayBuffer());
      const detail = JSON.parse(text);
      if (!detail.production || !detail.timeline) throw new Error("production/timeline 항목이 없는 파일이에요.");
      renderDetail(detail);
      msg.className = "load-msg ok";
      msg.textContent = `${file.name} — 생산 ${detail.production.length}단계, 선반 기록 ${detail.timeline.length}개`;
    } catch (e) {
      msg.className = "load-msg err";
      msg.textContent = `읽기 실패: export_detail.py로 만든 JSON 파일이 맞는지 확인하세요. (${e.message})`;
    }
  }
  $("#detailInput").addEventListener("change", (e) => { if (e.target.files[0]) loadDetailFile(e.target.files[0]); e.target.value = ""; });
  const detailDrop = $("#detailDrop");
  ["dragenter", "dragover"].forEach((ev) => detailDrop.addEventListener(ev, (e) => { e.preventDefault(); detailDrop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => detailDrop.addEventListener(ev, (e) => { e.preventDefault(); detailDrop.classList.remove("over"); }));
  detailDrop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadDetailFile(f); });

  $("#btnPresent").addEventListener("click", () => document.body.classList.add("present"));
  $("#btnExit").addEventListener("click", () => document.body.classList.remove("present"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.body.classList.remove("present"); });

  autoLoad();
}
