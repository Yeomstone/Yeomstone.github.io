/* ============================================================
   C-One — TOP30 탭 (장비품질개선: 업로드 건물 목록 × 라이브 품질 진단)
   좌: 건물 리스트(상태·D-1~D+7 BAD% 추이 바) / 우: 상세(장비 상태·조치 이력)
   ============================================================ */

const T30_STATUS = {
  critical: { label: '위험', cls: 't30-st--crit' },
  warning:  { label: '주의', cls: 't30-st--warn' },
  normal:   { label: '정상', cls: 't30-st--ok' },
  none:     { label: '미매칭', cls: 't30-st--na' },
};

let _t30Inited = false;
let _t30TeamParts = {};
let _t30Items = [];
let _t30Media = 'TOP30';
let _t30Selected = null;
let _t30BaseDt = '';

function t30Date8(v) { return (v || '').replace(/-/g, ''); }

async function top30Init() {
  if (_t30Inited) { t30Load(); return; }
  _t30Inited = true;

  const dateInp = document.getElementById('t30-base-date');
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  dateInp.value = todayISO;
  dateInp.max = todayISO;

  document.querySelectorAll('#t30-media-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#t30-media-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _t30Media = chip.dataset.m;
      t30Load();
    };
  });

  t30Load();
}

function t30TeamChanged() {
  const team = document.getElementById('t30-team').value;
  const sel = document.getElementById('t30-part');
  sel.innerHTML = '<option value="">전체 파트</option>';
  (team ? (_t30TeamParts[team] || [])
        : [...new Set(Object.values(_t30TeamParts).flat())].sort())
    .forEach(p => sel.add(new Option(p, p)));
}

const t30SearchDebounced = (typeof debounce === 'function')
  ? debounce(() => t30Load(), 250) : () => t30Load();

// ── 추이 바 (일별 BAD% — ≥10% 위험 / ≥5% 주의 / 미만 정상) ────
function t30Bars(trend) {
  if (!trend || !trend.length) return '<span class="ops-td-sub">—</span>';
  const w = 8, gap = 3, h = 24;
  const max = Math.max(10, ...trend.map(t => t.bad_rate));
  const bars = trend.map((t, i) => {
    const bh = Math.max(2, (t.bad_rate / max) * (h - 2));
    const cls = t.bad_rate >= 10 ? 't30-bar--crit' : (t.bad_rate >= 5 ? 't30-bar--warn' : 't30-bar--ok');
    return `<rect class="${cls}" x="${i * (w + gap)}" y="${(h - bh).toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" rx="1.5"><title>${t.dt} · BAD ${t.bad_rate}%</title></rect>`;
  }).join('');
  const tw = trend.length * (w + gap) - gap;
  return `<svg class="t30-bars" viewBox="0 0 ${tw} ${h}" width="${tw}" height="${h}" role="img"
    aria-label="일별 BAD% 추이">${bars}</svg>`;
}

// ── 개선 성과 스트립 (Closed-loop 효과: C·D 비중 감소·졸업·전주 대비) ──
let _t30InsDt = null;   // 마지막으로 렌더한 base_dt — 같은 날짜면 재요청 안 함

function t30InsLine(series, project) {
  // 일자별 전국 C·D% 인라인 SVG 라인차트 (t30Bars 패턴 — 외부 라이브러리 없음)
  // project=true 면 최소자승 기울기를 마지막 실측점에 앵커해 3스텝 점선 연장 (Goal 전망 — 문구 수치는 t30Trend 90일 연장 실계산, 5-4)
  const W = 420, H = 56, P = 5, PN = project ? 3 : 0;   // 가로형 비율 — CSS에서 max-width로 캡
  const vals = series.map(s => s.rate);
  let proj = [];
  if (PN && vals.length >= 2) {
    const n = vals.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    vals.forEach((v, i) => { sx += i; sy += v; sxy += i * v; sxx += i * i; });
    const slope = (n * sxy - sx * sy) / Math.max(n * sxx - sx * sx, 1e-9);
    for (let k = 1; k <= PN; k++) proj.push(Math.max(0, +(vals[n - 1] + slope * k).toFixed(2)));
  }
  const all = vals.concat(proj);
  const min = Math.min(...all), max = Math.max(...all);
  const span = Math.max(max - min, 0.1);
  const total = all.length;
  const x = i => P + i * ((W - P * 2) / Math.max(total - 1, 1));
  const y = v => P + (1 - (v - min) / span) * (H - P * 2);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = series.map((s, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(s.rate).toFixed(1)}" r="2.4"
       class="${i === series.length - 1 ? 't30-ins-dot--last' : 't30-ins-dot'}">
       <title>${s.dt.slice(4, 6)}/${s.dt.slice(6, 8)} · C·D ${s.rate}%</title></circle>`).join('');
  let projSvg = '';
  if (proj.length) {
    // 전망 구간 음영 — 실측 마지막 점 이후를 반투명 밴드로 구분 (모델 ④ 4주 전망 구간)
    const zx = x(vals.length - 1).toFixed(1);
    const zone = `<rect x="${zx}" y="${P}" width="${(x(total - 1) - x(vals.length - 1)).toFixed(1)}"
      height="${H - P * 2}" class="t30-ins-projzone"><title>시계열 모델 전망 구간</title></rect>`;
    const pPts = [`${x(vals.length - 1).toFixed(1)},${y(vals[vals.length - 1]).toFixed(1)}`]
      .concat(proj.map((v, k) => `${x(vals.length + k).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
    projSvg = `${zone}<polyline points="${pPts}" fill="none" class="t30-ins-proj"/>
      <circle cx="${x(total - 1).toFixed(1)}" cy="${y(proj[proj.length - 1]).toFixed(1)}" r="2.4"
        class="t30-ins-dot--proj"><title>추세 연장 전망 · C·D ${proj[proj.length - 1]}%</title></circle>`;
  }
  return `<svg class="t30-ins-line" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="일자별 전국 C·D 등급 비중 추이${proj.length ? ' — 점선은 추세 연장 전망' : ''}">
    <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" class="t30-ins-grid"/>
    <polyline points="${pts}" fill="none" class="t30-ins-path"/>${projSvg}${dots}</svg>`;
}

// 최근 실측 시계열의 최소자승 추세 — Goal 전망 계산용 (일 단위 기울기)
// 반환: { perDay: 하루당 %p 변화, last: 마지막 실측 % } / 계산 불가 시 null
function t30DayNum(dt) {
  const m = String(dt).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN;
}
function t30Trend(series) {
  const pts = (series || [])
    .map(s => ({ d: t30DayNum(s.dt), v: s.rate }))
    .filter(p => Number.isFinite(p.d) && p.v != null);
  if (pts.length < 2) return null;
  const x0 = pts[0].d;
  let n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  pts.forEach(p => { const x = p.d - x0; sx += x; sy += p.v; sxy += x * p.v; sxx += x * x; });
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  return { perDay: (n * sxy - sx * sy) / denom, last: pts[pts.length - 1].v };
}

// MM/DD 축약 — 'YYYYMMDD' / 'YYYY-MM-DD HH:MM' 둘 다 수용
function t30ShortDt(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[2]}/${m[3]}` : String(s);
}

// 고객수 만 단위 축약 (전국 등급별 고객수 — 백만 단위 실데이터)
function t30FmtCust(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
  if (v >= 1e6) return Math.round(v / 1e4).toLocaleString() + '만';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '만';
  return v.toLocaleString();
}

// ── 전체 관점 실적 (5-3 우) — 전국 S~D 등급 고객수, 전일 비·전주 비 ──
// 방향 주의: S·A·B 는 증가가 개선(green), C·D 는 감소가 개선(green)
function t30GradeTiles(gk) {
  const box = document.getElementById('t30-ins-grades');
  if (!box) return;
  if (!gk || !gk.grades) { box.hidden = true; return; }
  const upGood = { S: true, A: true, B: true, C: false, D: false };
  const dHtml = (delta, ug) => {
    if (delta == null) return '<span class="ops-td-sub">—</span>';
    if (delta === 0) return '<span class="ops-td-sub">보합</span>';
    const up = delta > 0;
    return `<b class="${up === ug ? 'ops-good' : 'ops-bad'}">${up ? '▲' : '▼'}${t30FmtCust(Math.abs(delta))}</b>`;
  };
  box.innerHTML = `
    <div class="t30-gk-hd">
      <span class="ops-stat-lbl">전국 등급별 고객수</span>
      <span class="ops-td-sub">기준 ${t30ShortDt(gk.base_dt)} (최신 D-1) · 관제 TOT</span>
    </div>` + ['S', 'A', 'B', 'C', 'D'].map(L => {
    const g = gk.grades[L] || {};
    return `
    <div class="t30-gk-tile" title="${L}등급 고객 ${g.cur != null ? g.cur.toLocaleString() : '—'}명">
      <span class="t30-gk-badge t30-gk--${L.toLowerCase()}">${L}</span>
      <b class="t30-gk-val">${t30FmtCust(g.cur)}</b>
      <span class="t30-gk-sub">전일 ${dHtml(g.delta_day, upGood[L])}<br>전주 ${dHtml(g.delta_week, upGood[L])}</span>
    </div>`;
  }).join('');
  box.hidden = false;
}

// ── 팀별 관리 성과 스코어보드 (Sheet3 평가 프레임) ──────────────
//    TOP 국소는 팀이 직접 선정한 실적 평가용 관리 건물 — "어느 팀이
//    자기 국소를 잘 관리하나"를 리그테이블로 보여준다.
//    필터와 무관하게 전체 목록 기준 집계(media·기준일별 캐시),
//    정렬은 위험 비중 낮은 팀이 위. 기존 "팀별 진도"(창 내 C·D 비중
//    %p 배지, 5-5)는 카드 우측 배지로 통합. 카드 클릭 = 팀 필터 토글.
let _t30Board = { key: null, rows: null, items: null };
let _t30BoardParts = [];   // 현재 펼친 팀의 파트 집계 (클릭 인덱스 참조용)

function t30TeamAgg(items, groupKey = 'team') {
  const by = {};
  (items || []).forEach(it => {
    const t = (by[it[groupKey] || '미지정'] ||= {
      team: it[groupKey] || '미지정', n: 0, crit: 0, warn: 0, ok: 0, na: 0, deltas: [],
    });
    t.n++;
    if (it.status === 'critical') t.crit++;
    else if (it.status === 'warning') t.warn++;
    else if (it.status === 'normal') t.ok++;
    else t.na++;
    const tr = it.trend || [];
    if (tr.length >= 2) t.deltas.push(tr[tr.length - 1].bad_rate - tr[0].bad_rate);
  });
  return Object.values(by).map(t => ({
    ...t,
    delta: t.deltas.length
      ? Math.round(t.deltas.reduce((s, v) => s + v, 0) / t.deltas.length * 10) / 10 : null,
  })).sort((a, b) =>
    (a.crit / a.n) - (b.crit / b.n)     // 위험 비중 낮은 팀(잘 관리) 먼저
    || (a.warn / a.n) - (b.warn / b.n)  // 동률이면 주의 비중
    || b.n - a.n);                       // 그다음 관리 규모 큰 팀
}

function t30TeamBoardRender() {
  const box = document.getElementById('t30-teamboard');
  const grid = document.getElementById('t30-tb-grid');
  if (!box || !grid) return;
  const rows = _t30Board.rows || [];
  if (!rows.length) { box.hidden = true; return; }
  const active = document.getElementById('t30-team').value;
  const imp = rows.filter(r => r.delta != null && r.delta <= -0.5).length;
  const wor = rows.filter(r => r.delta != null && r.delta >= 0.5).length;
  document.getElementById('t30-tb-meta').innerHTML =
    `위험 비중 낮은 팀이 상위 · 창 내 C·D 비중 —
     개선 <b class="ops-good">${imp}</b> · 악화 <b class="ops-bad">${wor}</b> · 보합 ${rows.length - imp - wor}`;
  grid.innerHTML = rows.map((r, i) => {
    const dCls = r.delta != null && r.delta <= -0.5 ? 't30-tp--good'
      : (r.delta != null && r.delta >= 0.5 ? 't30-tp--bad' : 't30-tp--flat');
    const dTxt = r.delta == null ? '—'
      : `${r.delta <= -0.5 ? '▼' : (r.delta >= 0.5 ? '▲' : '·')}${Math.abs(r.delta)}%p`;
    const pct = k => (r.n ? (r[k] / r.n * 100).toFixed(1) : 0);
    const seg = (k, cls) => (r[k] ? `<i class="${cls}" style="width:${pct(k)}%"></i>` : '');
    return `
    <button type="button" class="t30-tb-card ${active === r.team ? 'is-active' : ''}" onclick="t30TbClick(${i})"
      title="${_escapeHtml(r.team)} — 관리 ${r.n}곳 · 위험 ${r.crit} · 주의 ${r.warn} · 정상 ${r.ok}${r.na ? ` · 미매칭 ${r.na}` : ''} — 클릭하면 이 팀만 봅니다 (다시 클릭 시 해제)">
      <span class="t30-tb-rank">${i + 1}</span>
      <span class="t30-tb-body">
        <span class="t30-tb-hd-line"><b class="t30-tb-name">${_escapeHtml(r.team)}</b>
          <span class="t30-tp-chip ${dCls}" title="창 내(D-1~D+7) 관리 국소 평균 C·D 비중 증감 — 감소가 개선">${dTxt}</span></span>
        <span class="t30-tb-bar" aria-hidden="true">${seg('crit', 't30-tb-seg--crit')}${seg('warn', 't30-tb-seg--warn')}${seg('ok', 't30-tb-seg--ok')}${seg('na', 't30-tb-seg--na')}</span>
        <span class="ops-td-sub t30-tb-cnt"><span>관리 <b>${r.n}</b>곳</span><span>위험 <b class="${r.crit ? 'ops-bad' : ''}">${r.crit}</b></span><span>주의 ${r.warn}</span><span>정상 <b class="${r.ok ? 'ops-good' : ''}">${r.ok}</b></span></span>
      </span>
    </button>`;
  }).join('');
  t30PartsRender(active);
  box.hidden = false;
}

// 파트별 드릴다운 줄 — 팀 카드 선택 시 그 팀의 파트 미니 카드,
// 파트 클릭 = 파트 필터 토글 (팀 해제 시 함께 닫힘)
function t30PartsRender(activeTeam) {
  const box = document.getElementById('t30-tb-parts');
  if (!box) return;
  if (!activeTeam || !(_t30Board.items || []).length) {
    box.hidden = true; box.innerHTML = ''; _t30BoardParts = [];
    return;
  }
  _t30BoardParts = t30TeamAgg(
    _t30Board.items.filter(it => (it.team || '미지정') === activeTeam), 'part');
  if (!_t30BoardParts.length) { box.hidden = true; box.innerHTML = ''; return; }
  const activePart = document.getElementById('t30-part').value;
  const pct = (r, k) => (r.n ? (r[k] / r.n * 100).toFixed(1) : 0);
  const seg = (r, k, cls) => (r[k] ? `<i class="${cls}" style="width:${pct(r, k)}%"></i>` : '');
  box.innerHTML = `<span class="t30-tb-parts-lbl ops-td-sub"><b>${_escapeHtml(activeTeam)}</b> 파트별 —
      파트 클릭 시 그 파트만 봅니다 (다시 클릭 해제)</span>` +
    _t30BoardParts.map((r, i) => `
    <button type="button" class="t30-tb-part ${activePart === r.team ? 'is-active' : ''}" onclick="t30TbPartClick(${i})"
      title="${_escapeHtml(activeTeam)} / ${_escapeHtml(r.team)} — 관리 ${r.n}곳 · 위험 ${r.crit} · 주의 ${r.warn} · 정상 ${r.ok}${r.na ? ` · 미매칭 ${r.na}` : ''}">
      <span class="t30-tb-part-hd"><b>${_escapeHtml(r.team)}</b><span class="ops-td-sub">${r.n}곳</span></span>
      <span class="t30-tb-bar t30-tb-bar--sm" aria-hidden="true">${seg(r, 'crit', 't30-tb-seg--crit')}${seg(r, 'warn', 't30-tb-seg--warn')}${seg(r, 'ok', 't30-tb-seg--ok')}${seg(r, 'na', 't30-tb-seg--na')}</span>
      <span class="ops-td-sub t30-tb-cnt"><span>위험 <b class="${r.crit ? 'ops-bad' : ''}">${r.crit}</b></span><span>주의 ${r.warn}</span><span>정상 <b class="${r.ok ? 'ops-good' : ''}">${r.ok}</b></span></span>
    </button>`).join('');
  box.hidden = false;
}

// 파트 미니 카드 클릭 — 파트 필터 토글 (팀은 유지)
function t30TbPartClick(i) {
  const r = _t30BoardParts[i];
  if (!r) return;
  const sel = document.getElementById('t30-part');
  sel.value = sel.value === r.team ? '' : r.team;   // 옵션에 없으면 '' 로 남음
  t30Load();
}

async function t30TeamBoard(d, params) {
  const key = `${_t30Media}|${d.base_dt || ''}`;
  if (_t30Board.key !== key) {
    let items = null;
    if (!params.get('team') && !params.get('part') && !params.get('q')) {
      items = d.items || [];   // 이미 전체 목록 — 재요청 없이 재사용
    } else {
      try {
        const full = await fetch(`${BASE_PATH}/api/top30/list?base_dt=${params.get('base_dt')}&media=${encodeURIComponent(_t30Media)}`)
          .then(r => r.json());
        items = full.items || [];
      } catch (e) { /* 전체 집계 실패 — 이전 보드 유지 */ }
    }
    if (items) _t30Board = { key, rows: t30TeamAgg(items), items };
  }
  t30TeamBoardRender();
}

// 팀 카드 클릭 — 그 팀으로 리스트 필터 (같은 팀 재클릭 시 해제)
function t30TbClick(i) {
  const r = (_t30Board.rows || [])[i];
  if (!r) return;
  const sel = document.getElementById('t30-team');
  sel.value = sel.value === r.team ? '' : r.team;   // 옵션에 없는 팀명이면 '' 로 남음
  t30TeamChanged();
  t30Load();
}

async function t30LoadInsight(baseDt) {
  const box = document.getElementById('t30-insight');
  if (!box || _t30InsDt === baseDt) return;
  try {
    const d = await fetch(`${BASE_PATH}/api/top30/summary?base_dt=${baseDt}`).then(r => r.json());
    if (!d.ready || !(d.series || []).length) { box.hidden = true; return; }
    _t30InsDt = baseDt;

    // Goal 전망 (5-4) — 최근 실측 최소자승 추세의 90일 선형 연장 (실측 계산).
    // 개선(감소) 추세일 때만 점선 + 전망 문구, 아니면 관찰 문구.
    const tr = t30Trend(d.series);
    const improving = !!(d.delta && d.delta.diff < 0) && !!tr && tr.perDay < 0;
    document.getElementById('t30-ins-svg').innerHTML = t30InsLine(d.series, improving);
    const goal = document.getElementById('t30-ins-goal');
    if (goal) {
      if (improving) {
        // 선형 연장 하한 60% 개선 — 0%까지 떨어지는 비현실 전망(과장) 방지.
        // 실제 개선 속도는 후반부 둔화가 일반적이라 보수적으로 캡.
        const proj90 = Math.max(tr.last * 0.4, tr.last + tr.perDay * 90);
        const imp = tr.last > 0 ? Math.round((tr.last - proj90) / tr.last * 100) : 0;
        const impTxt = `약 ${imp}% 개선`;
        goal.innerHTML = `<b class="ops-good">Goal</b> — 최근 추세(일 평균 ▼${Math.abs(tr.perDay).toFixed(2)}%p)면
          <b>3개월 내</b> C·D 비중 ${tr.last.toFixed(2)}% → ${proj90.toFixed(2)}%,
          <b class="ops-good">${impTxt}</b> 전망 · 목표 30% ${imp >= 30 ? '달성권' : '개선'}
          ${typeof modelBadgeHtml === 'function' ? modelBadgeHtml('forecast', '전망') : ''}`;
        goal.title = '최근 실측 구간의 최소자승 추세를 90일 선형 연장한 단순 추정 — 실제 개선 속도는 후반부에 둔화될 수 있습니다';
      } else {
        goal.innerHTML = '추세 관찰 중 — 개선 추세가 확인되면 Goal 전망을 표시합니다';
        goal.title = '';
      }
      goal.hidden = false;
    }
    // 전체 관점 실적 (5-3 우) — 전국 S~D 등급 고객수 타일
    t30GradeTiles(d.grade_kpi);

    document.getElementById('t30-ins-grad').textContent = `${d.grad}건`;
    document.getElementById('t30-ins-reentry').textContent = d.reentry;

    const dEl = document.getElementById('t30-ins-delta');
    if (d.delta) {
      const better = d.delta.diff < 0;   // C·D 비중은 감소가 개선
      dEl.innerHTML = `<b class="${better ? 'ops-good' : (d.delta.diff > 0 ? 'ops-bad' : '')}">
        ${better ? '▼' : (d.delta.diff > 0 ? '▲' : '—')} ${Math.abs(d.delta.diff)}%p</b>
        <span class="ops-td-sub">${d.delta.prev}% → ${d.delta.cur}%</span>`;
    } else { dEl.textContent = '—'; }
    box.hidden = false;
  } catch (e) { box.hidden = true; }
}

// ── 목록 로드 ────────────────────────────────────────────────
async function t30Load() {
  const p = new URLSearchParams({
    base_dt: t30Date8(document.getElementById('t30-base-date').value),
    team: document.getElementById('t30-team').value,
    part: document.getElementById('t30-part').value,
    media: _t30Media,
    q: document.getElementById('t30-q').value.trim(),
  });
  t30LoadInsight(p.get('base_dt'));   // 개선 성과 스트립 — 목록과 병렬 (같은 캐시 재사용)
  const body = document.getElementById('t30-body');
  if (!body.querySelector('.t30-row')) {
    body.innerHTML = skelTableRows(8, 8, '건물 품질 조회 중… (탭 최초 진입 시 몇 초 걸릴 수 있습니다)');
  }
  try {
    const d = await fetch(`${BASE_PATH}/api/top30/list?${p}`).then(r => r.json());
    _t30Items = d.items || [];
    _t30BaseDt = d.base_dt || '';

    // 필터 드롭다운은 업로드 파일 기준으로 1회 구성
    if (d.teams && !Object.keys(_t30TeamParts).length) {
      _t30TeamParts = d.team_parts || {};
      const teamSel = document.getElementById('t30-team');
      d.teams.forEach(t => teamSel.add(new Option(t, t)));
      t30TeamChanged();
    }

    const meta = [];
    if (d.base_dt) meta.push(`기준일 ${d.base_dt}`);
    if (d.meta?.filename) meta.push(`${d.meta.filename} (${(d.meta.updated_at || '').slice(0, 10)} 업로드)`);
    document.getElementById('t30-meta').textContent = meta.join(' · ');

    document.getElementById('t30-total').textContent = _t30Items.length;
    document.getElementById('t30-critical').textContent =
      _t30Items.filter(i => i.status === 'critical').length;
    document.getElementById('t30-pending').textContent =
      _t30Items.reduce((s, i) => s + (i.pending || 0), 0);
    document.getElementById('t30-verified').textContent =
      _t30Items.reduce((s, i) => s + (i.verified || 0), 0);

    // 팀별 관리 성과 스코어보드 — 전체 목록 기준 집계 (필터 무관, 캐시)
    t30TeamBoard(d, p);

    if (!_t30Items.length) {
      body.innerHTML = `<tr><td colspan="8" class="ops-empty">${d.ready === false
        ? '관리자가 TOP30 목록을 업로드하면 표시됩니다' : '조건에 맞는 건물이 없습니다'}</td></tr>`;
      return;
    }
    body.innerHTML = _t30Items.map((it, i) => {
      const st = T30_STATUS[it.status] || T30_STATUS.none;
      return `
      <tr class="t30-row ${it.bld_cd === _t30Selected ? 'is-selected' : ''}" onclick="t30SelectIdx(${i}, this)">
        <td class="t30-rank">${it.rank ?? '—'}</td>
        <td class="ops-td-bld"><b>${_escapeHtml(it.bld_nm || it.bld_cd)}</b>
          <span class="ops-td-sub">${_escapeHtml(it.bld_cd)}${it.pending ? ` · <b class="ops-bad">지시서 ${it.pending}건 진행중</b>` : ''}</span></td>
        <td class="t30-team-cell"><b>${_escapeHtml(it.team || '—')}</b>${it.part ? `<span class="ops-td-sub"> / ${_escapeHtml(it.part)}</span>` : ''}</td>
        <td class="t30-trank">${it.team_rank != null
          ? `<span class="t30-trank-badge" title="팀 내 관리 우선순위 (업로드 목록 기준)">팀 ${it.team_rank}위</span>`
          : '<span class="ops-td-sub">—</span>'}</td>
        <td><span class="t30-st ${st.cls}">● ${st.label}</span></td>
        <td>${window.ceiBadgeHtml(it.cei)}${
          it.cei_delta != null && it.cei_delta !== 0
            ? `<span class="${it.cei_delta > 0 ? 'ops-good' : 'ops-bad'}" style="font-size:var(--fs-xs); font-weight:600"> ${it.cei_delta > 0 ? '▲' : '▼'}${Math.abs(it.cei_delta)}</span>` : ''}</td>
        <td>${it.bad_rate != null ? it.bad_rate + '%' : '—'}</td>
        <td>${t30Bars(it.trend)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="8" class="ops-empty">목록 조회 실패 — 네트워크 확인</td></tr>';
  }
}

// ── 업로드 (관리자) ──────────────────────────────────────────
async function t30Upload(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  const res = await fetch(`${BASE_PATH}/api/top30/upload`, { method: 'POST', body: fd })
    .then(r => r.json()).catch(() => ({ error: '업로드 실패' }));
  inp.value = '';
  if (res.ok) {
    alert(`TOP30 목록 ${res.count}건 업로드 완료`);
    _t30TeamParts = {};   // 드롭다운 재구성
    document.getElementById('t30-team').innerHTML = '<option value="">전체 팀</option>';
    t30Load();
  } else {
    alert(res.error || '업로드 실패');
  }
}

// ── 건물 선택 → 상세 (장비 상태 / 조치 이력) ─────────────────
// 행 클릭은 인덱스로 받는다 — 업로드 파일에서 온 bld_cd 를 인라인 핸들러에 넣지 않음
function t30SelectIdx(i, rowEl) {
  const it = _t30Items[i];
  if (it) t30Select(it.bld_cd, rowEl);
}

async function t30Select(bldCd, rowEl) {
  _t30Selected = bldCd;
  document.querySelectorAll('.t30-row').forEach(r => r.classList.remove('is-selected'));
  if (rowEl) rowEl.classList.add('is-selected');

  document.getElementById('t30-detail-empty').hidden = true;
  const box = document.getElementById('t30-detail-body');
  box.hidden = false;
  // 탭 상태 초기화 — 이전 선택에서 다른 탭을 열어뒀어도 장비 품질부터
  t30DetailTab('eq', document.getElementById('t30-tab-eq'));
  document.getElementById('t30-pane-eq').innerHTML =
    skelCards(3, '장비 품질 조회 중… (건물당 최초 조회는 몇 초 걸릴 수 있습니다)');
  document.getElementById('t30-pane-wk').innerHTML =
    skelCards(2, '작업 이력 조회 중… (최초 1회는 10초 안팎 걸릴 수 있습니다)');
  document.getElementById('t30-pane-his').innerHTML = skelCards(2);

  const d = await fetch(`${BASE_PATH}/api/top30/detail?bld_cd=${encodeURIComponent(bldCd)}&base_dt=${t30Date8(document.getElementById('t30-base-date').value)}`)
    .then(r => r.json()).catch(() => null);
  if (!d) { document.getElementById('t30-pane-eq').innerHTML = '<div class="ops-empty">조회 실패</div>'; return; }

  const b = d.building || {};
  const st = T30_STATUS[b.status] || T30_STATUS.none;
  document.getElementById('t30-d-name').textContent = b.bld_nm || bldCd;
  document.getElementById('t30-d-sub').textContent =
    `${bldCd}${b.team ? ` · ${b.team}${b.part ? '/' + b.part : ''}` : ''}${b.rank ? ` · 전체 ${b.rank}위` : ''}`;
  const stEl = document.getElementById('t30-d-status');
  stEl.textContent = `● ${st.label}`;
  stEl.className = `t30-st ${st.cls}`;
  document.getElementById('t30-d-cei').innerHTML = window.ceiBadgeHtml(b.cei);
  const dEl = document.getElementById('t30-d-cei-delta');
  if (b.cei_delta != null && b.cei_delta !== 0) {
    dEl.innerHTML = `전일 대비 <b class="${b.cei_delta > 0 ? 'ops-good' : 'ops-bad'}">${b.cei_delta > 0 ? '+' : ''}${b.cei_delta}</b>`;
  } else { dEl.textContent = b.cei_delta === 0 ? '전일과 동일' : ''; }
  document.getElementById('t30-d-svc').textContent = b.svc_cnt != null ? b.svc_cnt.toLocaleString() : '—';
  document.getElementById('t30-d-bad').textContent = b.bad_rate != null ? b.bad_rate + '%' : '—';
  document.getElementById('t30-d-voc').textContent =
    b.voc != null ? `${b.voc}${b.voc_30d ? ` (30일 ${b.voc_30d})` : ''}` : '—';
  document.getElementById('t30-d-trend').innerHTML =
    (b.trend && b.trend.length) ? `<span>BAD% 추이 (D-1~D+7)</span>${t30Bars(b.trend)}` : '';

  // 개선 History (5-3 좌) — 최초 수준 → Ticket(작업지시서) 발행·처리 → 처리 후 추이
  t30RenderHist(b, d.history || []);

  // 장비 상태 — 장비별 품질정보(마스터) 기준: BIP/ONT 광레벨/CRC/속도 미스매치
  const eqs = d.equips || [];
  const fmtD = dd => {
    if (!dd) return '';
    const p = [];
    if (dd.bip_error) p.push(`BIP ${dd.bip_error}`);
    if (dd.onu_power) p.push(`ONT ${dd.onu_power}dBm`);
    if (dd.crc_error) p.push(`CRC ${dd.crc_error}`);
    if (dd.ifspeedyn) p.push(`속도 미스매치 ${dd.ifspeedyn}`);
    return p.join(' · ');
  };
  document.getElementById('t30-pane-eq').innerHTML = eqs.length ? eqs.map(e => {
    const bad = e.cei != null && e.cei < 80;
    const delta = e.cei_delta != null && e.cei_delta !== 0
      ? ` <span class="${e.cei_delta > 0 ? 'ops-good' : 'ops-bad'}" style="font-size:var(--fs-xs)">(${e.cei_delta > 0 ? '+' : ''}${e.cei_delta})</span>` : '';
    return `
    <div class="t30-eq ${bad ? 't30-eq--bad' : ''}">
      <div class="t30-eq-hd">
        <b>${_escapeHtml(e.tid || e.equip_nm || e.equip_id)}</b>
        <span class="ops-factor-badge">${e.level}</span>
        <span class="t30-eq-cei">${e.cei != null ? window.ceiBadgeHtml(e.cei) : '측정불가'}${delta}</span>
      </div>
      <div class="ops-td-sub">${e.equip_nm ? _escapeHtml(e.equip_nm) + ' · ' : ''}가입자 ${e.svc_cnt} · C·D ${e.cd_cnt}명 · VoC ${e.voc}${e.voc_30d ? ` (30일 ${e.voc_30d})` : ''}</div>
      ${e.factors.length ? `<div class="t30-eq-fct">${e.factors.map(f => `<span class="ops-factor-badge">${f}</span>`).join('')}</div>` : ''}
      <div class="ops-td-sub">${fmtD(e.detail)}</div>
    </div>`;
  }).join('') : '<div class="ops-empty">장비 정보가 없습니다</div>';

  // 작업 이력 — 작업정보 데이터셋 (대/중분류 요약 + 최신순, 예정 작업 표시)
  const wk = d.works || { items: [], summary: {}, total: 0 };
  const sumChips = Object.entries(wk.summary || {})
    .sort((a, b2) => b2[1] - a[1])
    .map(([k, v]) => `<span class="ops-factor-badge">${_escapeHtml(k)} ${v}건</span>`).join('');
  document.getElementById('t30-pane-wk').innerHTML = (wk.items || []).length ? `
    <div class="t30-wk-sum">${sumChips}</div>
    <div class="ops-td-sub" style="margin-bottom:6px">총 ${wk.total}건${wk.planned_cnt ? ` · <b>예정 ${wk.planned_cnt}건</b>` : ''}${wk.total > wk.items.length ? ` · 최근 ${wk.items.length}건 표시` : ''}</div>
    ${wk.items.map(w => `
    <div class="t30-his ${w.planned ? 't30-wk--plan' : ''}">
      <div class="t30-his-hd">
        ${w.planned ? '<span class="ops-factor-badge">예정</span>' : ''}
        <b>${_escapeHtml(w.brief === '#' ? '기타 작업' : w.brief)}</b>
        ${w.lcl !== '#' ? `<span class="ops-factor-badge">${_escapeHtml(w.lcl)}${w.mcl !== '#' ? ' · ' + _escapeHtml(w.mcl) : ''}</span>` : ''}
      </div>
      <div class="ops-td-sub">${w.dtm}${w.equip_id ? ` · 장비 ${_escapeHtml(w.equip_id)}` : ''}${w.org && w.org !== '#' ? ` · ${_escapeHtml(w.org)}` : ''}</div>
    </div>`).join('')}` : '<div class="ops-empty">이 건물의 작업 이력이 없습니다</div>';

  // 지시서 이력 — Ticket (건물+장비 단위)
  const his = d.history || [];
  const STK = { issued: '발행', resolved: '조치완료', verified: '검증완료', dropped: '중단' };
  document.getElementById('t30-pane-his').innerHTML = his.length ? his.map(it => {
    const bm = it.before_metrics || {}, am = it.after_metrics || {};
    const delta = (bm.cei != null && am.cei != null) ? (am.cei - bm.cei) : null;
    return `
    <div class="t30-his">
      <div class="t30-his-hd">
        <span class="ops-status st-${it.status}">${STK[it.status] || it.status}</span>
        <b>${_escapeHtml(it.equip_nm || it.bld_nm || it.bld_cd)}</b>
        <span class="ops-td-sub">${it.equip_id ? '장비' : '건물'} 단위</span>
      </div>
      <div class="ops-td-sub">발행 ${it.issued_at || '—'}${it.resolved_at ? ` · 조치 ${it.resolved_at}` : ''}
        ${delta != null ? ` · <b class="${delta > 0 ? 'ops-good' : 'ops-bad'}">CEI ${delta > 0 ? '+' : ''}${delta.toFixed(1)}점</b>` : ''}</div>
      ${(it.cause_category || it.result_category) ? `<div class="ops-td-sub">원인 ${_escapeHtml(it.cause_category || '-')} · 조치 ${_escapeHtml(it.result_category || '-')}</div>` : ''}
      ${it.result_note ? `<div class="ops-td-sub">상세: ${_escapeHtml(it.result_note)}</div>` : ''}
    </div>`;
  }).join('') : '<div class="ops-empty">이 건물의 지시서 이력이 없습니다</div>';
}

// ── 개선 History 타임라인 (5-3 좌) — 지시서(Ticket) 이력 연동,
//    이력이 없으면 품질 추이(창 첫 관측 → 현재) 근사 표시 ──
function t30RenderHist(b, his) {
  const box = document.getElementById('t30-d-hist');
  if (!box) return;
  const alive = (his || []).filter(h => h.status !== 'dropped');
  const tk = alive.find(h => h.status === 'verified')
    || alive.find(h => h.status === 'resolved') || alive[0];
  const tr = b.trend || [];
  const first = tr[0], last = tr[tr.length - 1];
  const chip = (lbl, val, cls = '') =>
    `<span class="t30-hs ${cls}"><span class="t30-hs-lbl">${lbl}</span><span class="t30-hs-val">${val}</span></span>`;
  const arrow = '<span class="t30-hs-arrow">→</span>';
  let note = '';
  const chips = [];
  if (tk) {
    const bm = tk.before_metrics || {}, am = tk.after_metrics || {};
    const afterCei = am.cei ?? b.cei;
    const delta = (bm.cei != null && afterCei != null)
      ? Math.round((afterCei - bm.cei) * 10) / 10 : null;
    chips.push(chip('최초 수준',
      bm.cei != null ? window.ceiBadgeHtml(bm.cei) : (first ? `BAD ${first.bad_rate}%` : '—'), 't30-hs--bad'));
    chips.push(chip('Ticket 발행', t30ShortDt(tk.issued_at) || '—'));
    if (tk.resolved_at) {
      chips.push(chip('현장 처리', t30ShortDt(tk.resolved_at)));
      chips.push(chip(tk.status === 'verified' ? '처리 후 · 효과검증' : '처리 후',
        `${afterCei != null ? window.ceiBadgeHtml(afterCei) : '—'}${delta != null && delta !== 0
          ? ` <b class="${delta > 0 ? 'ops-good' : 'ops-bad'}">${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}</b>` : ''}`,
        't30-hs--good'));
    } else {
      chips.push(chip('현장 처리', '진행중 — 조치 후 CEI 효과검증'));
    }
    note = 'Ticket 이력 연동';
  } else if (first && last && tr.length >= 2) {
    const dd = Math.round((last.bad_rate - first.bad_rate) * 10) / 10;
    chips.push(chip(`최초 관측 ${t30ShortDt(first.dt)}`, `BAD ${first.bad_rate}%`,
      first.bad_rate >= 10 ? 't30-hs--bad' : ''));
    chips.push(chip(`현재 ${t30ShortDt(last.dt)}`,
      `BAD ${last.bad_rate}%${dd !== 0
        ? ` <b class="${dd < 0 ? 'ops-good' : 'ops-bad'}">${dd < 0 ? '▼' : '▲'}${Math.abs(dd)}%p</b>` : ''}`,
      dd < 0 ? 't30-hs--good' : ''));
    note = '지시서 이력 없음 · 품질 추이 근사';
  }
  if (!chips.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="t30-hist-hd">개선 History <span class="t30-hist-note">— ${note}</span></div>
    <div class="t30-hist-line">${chips.join(arrow)}</div>`;
  box.hidden = false;
}

function t30DetailTab(key, btn) {
  document.querySelectorAll('.t30-d-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.getElementById('t30-pane-eq').hidden = key !== 'eq';
  document.getElementById('t30-pane-wk').hidden = key !== 'wk';
  document.getElementById('t30-pane-his').hidden = key !== 'his';
}

// 선택 건물을 장비 탭 조회조건에 실어 이동 → 장비단위 지시서 발행 동선
function t30GoIssue() {
  if (!_t30Selected) return;
  const btn = document.getElementById('snav-eq-ops');
  if (btn) btn.click();
  const blds = document.getElementById('eqp-blds');
  if (blds) { blds.value = _t30Selected; eqpSearch(); }
}
