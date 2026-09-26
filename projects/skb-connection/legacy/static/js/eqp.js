/* ============================================================
   C-One — 장비 탭 (장비품질개선: 건물 대상 → 품질 저조 장비 → 장비단위 지시서)
   ops.js 의 흐름을 따르되 단위가 건물이 아니라 장비다.
   기준일 D 선택 → D-1~D+7 창으로 추이·전후를 구성한다.
   ============================================================ */

const EQP_STATUS_META = WORKITEM_STATUS_META;   // 공용 정의(dashboard.js) 참조

let _eqpInited = false;
let _eqpTeamPosts = {};
let _eqpDates = [];
let _eqpTargets = [];
let _eqpEquips = [];
let _eqpBoardStatus = '';
let _eqpOrg = 'skb';
let _eqpBaseDt = '';       // yyyymmdd — 마지막 추출 기준일 (발행 스냅샷 기준)

// ── 관제 → BS 관리 진입 컨텍스트 (TODO-시연 1-3) ────────────────
// goBsManage(관제 진단)로 들어온 경우에만 세팅 — 수동 사용 흐름에는 영향 없음.
let _eqpEntryCtx = null;     // { bld_cd, bld_nm, primary, headline, src }
let _eqpAutoOpenBld = null;  // 검색 결과 렌더 후 자동 선택할 건물코드
let _eqpAutoPick = false;    // 자동 진입 시 위험 장비 사전 체크 (AI 대상선정)
let _eqpAutoIssue = false;   // AR 레포트 '발행 검토' 진입 — 사전 체크 후 발행 미리보기까지 자동

const EQP_PRIMARY_LABEL = { equip: '장비 품질', line: '선로 (광레벨·손실)', work: '전일 작업 영향' };

// 관제 진단 → 장비 탭 원스톱 진입: 프리필 + 검색 + 해당 건물 자동 선택까지.
// 사용자는 추가 클릭 없이 장비별 진단 결과를 바로 본다.
function eqpEnterFromControl(ctx) {
  _eqpEntryCtx = ctx && ctx.bld_cd ? ctx : null;
  _eqpAutoOpenBld = _eqpEntryCtx ? String(_eqpEntryCtx.bld_cd) : null;
  _eqpAutoPick = !!_eqpAutoOpenBld;
  _eqpAutoIssue = !!(_eqpEntryCtx && _eqpEntryCtx.src === 'ar');
  eqpRenderCtxBanner();
  const blds = document.getElementById('eqp-blds');
  if (blds) blds.value = _eqpAutoOpenBld || '';
  // 기준일을 비워 보낸다 — 오늘 날짜에 대상이 없어도 서비스가 데이터 있는
  // 최근일로 자동 폴백해 해당 건물이 잡히게 (응답 base_dt 를 입력창에 반영)
  const dt = document.getElementById('eqp-base-date');
  if (dt) dt.value = '';
  eqpSearch();
}

function eqpRenderCtxBanner() {
  const box = document.getElementById('eqp-ctx-banner');
  if (!box) return;
  if (!_eqpEntryCtx) { box.hidden = true; box.innerHTML = ''; return; }
  const c = _eqpEntryCtx;
  const primary = EQP_PRIMARY_LABEL[c.primary] || '장비 품질';
  const from = c.src === 'home' ? '모닝 브리핑에서 이동' : '관제 진단에서 이동';
  box.innerHTML = `
    <span class="eqp-ctx-step">탐지 → 진단 완료</span>
    <span class="eqp-ctx-text">${from} · <b>${c.bld_nm || c.bld_cd}</b> · 주원인: <b>${primary}</b>
      — 진단이 끝났습니다. 확인 후 발행만 승인하세요.</span>
    <button class="eqp-ctx-close" onclick="eqpCloseCtxBanner()" title="배너 닫기" aria-label="배너 닫기">&times;</button>`;
  box.hidden = false;
}

function eqpCloseCtxBanner() {
  _eqpEntryCtx = null;
  const box = document.getElementById('eqp-ctx-banner');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

function eqpDate8(v) { return (v || '').replace(/-/g, ''); }
function eqpDateISO(v8) { return v8 ? `${v8.slice(0, 4)}-${v8.slice(4, 6)}-${v8.slice(6, 8)}` : ''; }

// ── 좌우 패널 드래그 스플리터 (장비 탭) ─────────────────────────
// 비율(%)을 그리드 커스텀 프로퍼티(--eqp-split)로 적용 — 창 리사이즈 시
// %가 유지되고, ≤1200px 1열 스택 미디어쿼리는 CSS가 그대로 이긴다.
const EQP_SPLIT_KEY = 'c1.eqpSplitPct';
const EQP_SPLIT_MIN = 320;   // 양쪽 최소 폭(px) 가드

function eqpSplitInit() {
  const grid = document.querySelector('#tab-eqp .ops-grid');
  const bar = document.getElementById('eqp-split');
  if (!grid || !bar || bar._inited) return;
  bar._inited = true;

  const clampPct = (px, r) => {
    const gaps = 24 + (bar.offsetWidth || 10);   // grid gap 12×2 + 스플리터 폭
    const lo = EQP_SPLIT_MIN;
    const hi = Math.max(lo, r.width - EQP_SPLIT_MIN - gaps);
    return (Math.max(lo, Math.min(px, hi)) / r.width) * 100;
  };
  const apply = pct => grid.style.setProperty('--eqp-split', pct.toFixed(2) + '%');

  const saved = parseFloat(localStorage.getItem(EQP_SPLIT_KEY));
  if (!isNaN(saved) && saved > 10 && saved < 90) apply(saved);

  let cur = null;
  bar.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    bar.setPointerCapture(ev.pointerId);
    bar.classList.add('is-drag');
    document.body.classList.add('eqp-splitting');   // 드래그 중 텍스트 선택 방지
    const move = e => {
      const r = grid.getBoundingClientRect();
      cur = clampPct(e.clientX - r.left, r);
      apply(cur);
    };
    const up = () => {
      bar.classList.remove('is-drag');
      document.body.classList.remove('eqp-splitting');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      if (cur != null) localStorage.setItem(EQP_SPLIT_KEY, cur.toFixed(2));
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });

  // 더블클릭 = 기본 비율 복원 (CSS 기본값으로 회귀 + 저장값 제거)
  bar.addEventListener('dblclick', () => {
    grid.style.removeProperty('--eqp-split');
    localStorage.removeItem(EQP_SPLIT_KEY);
    cur = null;
  });

  // 창이 줄었을 때 저장 비율이 min 320px 가드를 깨면 재클램프
  window.addEventListener('resize', () => {
    const v = parseFloat(grid.style.getPropertyValue('--eqp-split'));
    if (isNaN(v)) return;
    const r = grid.getBoundingClientRect();
    if (r.width < 700) return;   // 1열 스택 구간 — CSS가 처리
    const fixed = clampPct((v / 100) * r.width, r);
    if (Math.abs(fixed - v) > 0.5) apply(fixed);
  });
}

async function eqpInit() {
  eqpSplitInit();
  if (_eqpInited) return;
  _eqpInited = true;

  // 기준일 기본값 = 오늘 (데이터 없는 날짜를 고르면 서버가 이전 최근일로 폴백)
  const dateInp = document.getElementById('eqp-base-date');
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  dateInp.value = todayISO;
  dateInp.max = todayISO;

  try {
    const f = await fetch(`${BASE_PATH}/api/eqp/filters`).then(r => r.json());
    _eqpTeamPosts = f.team_posts || {};
    _eqpDates = f.dates || [];
    const teamSel = document.getElementById('eqp-team');
    (f.teams || []).forEach(t => teamSel.add(new Option(t, t)));
    if (_eqpDates.length) dateInp.min = eqpDateISO(_eqpDates[0]);
  } catch (e) { console.warn('eqp filter load 실패', e); }

  // 진입 즉시 C-One 추천 대상 자동 추출 — 빈 표에서 사람이 조건을 찾게 하지
  // 않는다 (0819 3차 R1). 관제/브리핑 딥링크가 이미 검색을 걸었으면 생략.
  if (!_eqpSearchedOnce) eqpSearch();
}

// ── 지시서 보드 탭 (0820: 진행 보드·실적을 장비탭에서 분리) ─────
// DOM(#eqp-board·상태칩·실적 타일·조직별 실적)이 #tab-board 로 이동 —
// eqpLoadBoard/eqpLoadStats 등 기존 함수·id 는 그대로 동작한다.
let _eqpBoardInited = false;
function eqpBoardInit() {
  if (_eqpBoardInited) { eqpLoadHist30(); eqpLoadBoard(); eqpLoadStats(); eqpLoadTeamStats(); return; }
  _eqpBoardInited = true;

  document.querySelectorAll('#eqp-status-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#eqp-status-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _eqpBoardStatus = chip.dataset.s || '';
      eqpLoadBoard();
    };
  });
  document.querySelectorAll('#eqp-org-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#eqp-org-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _eqpOrg = chip.dataset.o || 'skb';
      eqpLoadTeamStats();
    };
  });

  eqpLoadHist30();
  eqpLoadBoard();
  eqpLoadStats();
  eqpLoadTeamStats();
}

// ── 최근 30일 이력 요약 (지시서 보드 탭 상단) ─────────────────
// GET /api/eqp/workitems 전체 응답을 프론트에서 issued_at 기준으로 집계.
// KPI(발행·조치완료·검증완료 개선/미개선·중단) + 일별 30칸 막대 + 팀별 상위 칩.
function eqhDayLbl(key) { return `${key.slice(5, 7)}.${key.slice(8, 10)}`; }

function eqhBarsSvg(days) {
  // t30Bars 패턴 — 인라인 SVG, 라이브러리 없음. 하루 = 발행·조치 쌍 막대.
  // 0건인 날도 옅은 스텁(2px)을 그려 30칸 리듬이 끊기지 않게 한다.
  const w = 6, pg = 1, dg = 4, h = 46;
  const colW = w * 2 + pg;
  const max = Math.max(2, ...days.map(d => Math.max(d.issued, d.resolved)));
  const bh = v => v > 0 ? Math.max(3, (v / max) * (h - 6)) : 2;
  const rects = days.map((d, i) => {
    const x = i * (colW + dg);
    const lbl = eqhDayLbl(d.key);
    // data-tip = 즉시 커스텀 툴팁(_sparkTip 공용) — 브라우저 기본 <title>은 지연이 있어 교체
    return `<rect class="eqh-bar ${d.issued ? 'eqh-bar--issued' : 'eqh-bar--zero'}"
        x="${x}" y="${(h - bh(d.issued)).toFixed(1)}" width="${w}" height="${bh(d.issued).toFixed(1)}" rx="1.5"
        data-tip="${lbl} · 발행 ${d.issued}건"></rect>
      <rect class="eqh-bar ${d.resolved ? 'eqh-bar--resolved' : 'eqh-bar--zero'}"
        x="${x + w + pg}" y="${(h - bh(d.resolved)).toFixed(1)}" width="${w}" height="${bh(d.resolved).toFixed(1)}" rx="1.5"
        data-tip="${lbl} · 조치 ${d.resolved}건"></rect>`;
  }).join('');
  const tw = days.length * (colW + dg) - dg;
  return `<svg class="eqh-bars" viewBox="0 0 ${tw} ${h}" width="100%" height="${h}"
    preserveAspectRatio="none" role="img" aria-label="최근 30일 일별 지시서 발행·조치 건수">
    <line x1="0" y1="${h - 0.5}" x2="${tw}" y2="${h - 0.5}" class="eqh-axis"/>${rects}</svg>`;
}

async function eqpLoadHist30() {
  const card = document.getElementById('eqp-hist30');
  if (!card) return;
  const data = await fetch(`${BASE_PATH}/api/eqp/workitems`).then(r => r.json()).catch(() => ({}));
  const items = data.items || [];

  // 오늘 포함 최근 30일 창 (로컬 날짜 기준 — issued_at 'YYYY-MM-DD …' 접두 매칭)
  const days = [], idx = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    idx[key] = days.length;
    days.push({ key, issued: 0, resolved: 0 });
  }

  const k = { issued: 0, resolved: 0, verified: 0, dropped: 0, imp: 0, notimp: 0 };
  const teams = {};
  items.forEach(it => {
    const ik = String(it.issued_at || '').slice(0, 10);
    const rk = String(it.resolved_at || '').slice(0, 10);
    if (ik in idx) {
      k.issued++;
      days[idx[ik]].issued++;
      if (it.resolved_at) k.resolved++;
      if (it.status === 'verified') {
        k.verified++;
        const b = it.before_metrics || {}, a = it.after_metrics || {};
        if (b.cei != null && a.cei != null) (a.cei > b.cei ? k.imp++ : k.notimp++);
      }
      if (it.status === 'dropped') k.dropped++;
      const t = it.hns_team || it.team;
      if (t) teams[t] = (teams[t] || 0) + 1;
    }
    if (rk in idx) days[idx[rk]].resolved++;   // 조치는 조치일 기준으로 칸에 반영
  });

  const rangeEl = document.getElementById('eqh-range');
  if (rangeEl) rangeEl.textContent =
    `${eqhDayLbl(days[0].key)} ~ ${eqhDayLbl(days[days.length - 1].key)} · 30일 · 총 ${k.issued}건`;

  const verSub = (k.imp + k.notimp) > 0
    ? `<small><i class="ops-good">개선 ${k.imp}</i> · <i class="ops-bad">미개선 ${k.notimp}</i></small>`
    : '<small>CEI 전후 비교 대기</small>';
  document.getElementById('eqh-kpis').innerHTML = `
    <div class="eqh-kpi"><b>${k.issued}</b><span>발행</span></div>
    <div class="eqh-kpi"><b>${k.resolved}</b><span>조치완료</span></div>
    <div class="eqh-kpi"><b>${k.verified}</b><span>검증완료</span>${verSub}</div>
    <div class="eqh-kpi"><b>${k.dropped}</b><span>중단</span></div>`;

  document.getElementById('eqh-bars').innerHTML = eqhBarsSvg(days);
  document.getElementById('eqh-bars-x').innerHTML =
    `<span>${eqhDayLbl(days[0].key)}</span><span>오늘 (${eqhDayLbl(days[days.length - 1].key)})</span>`;

  const top = Object.entries(teams).sort((a, b) => b[1] - a[1]).slice(0, 4);
  document.getElementById('eqh-teams').innerHTML = top.length
    ? '<span class="eqh-teams-lbl">팀별 발행 상위</span>'
      + top.map(([t, n]) => `<span class="eqh-chip">${_escapeHtml(t)} <b>${n}</b></span>`).join('')
    : '<span class="ops-td-sub">기간 내 팀 지정 발행이 없습니다 — 팀별 상세는 아래 조직별 실적 참조</span>';
}

function eqpTeamChanged() {
  const team = document.getElementById('eqp-team').value;
  const postSel = document.getElementById('eqp-post');
  postSel.innerHTML = '<option value="">전체 post</option>';
  (team ? (_eqpTeamPosts[team] || [])
        : [...new Set(Object.values(_eqpTeamPosts).flat())].sort())
    .forEach(p => postSel.add(new Option(p, p)));
}

// ── 일주일간 추이 스파크바 (D-1~D+7 창, 기준일 막대 강조) ──────
function eqpSpark(trend, baseDt) {
  if (!trend || trend.length < 2) return '<span class="ops-td-sub">—</span>';
  const w = 92, h = 26, pad = 2, gap = 2, minBar = 3;
  const vals = trend.map(t => t.cei);
  const min = Math.min(...vals), max = Math.max(...vals);
  // 실제 min~max 범위로 정규화 — 구간별 차이가 막대 길이에 그대로 보이게
  // (최솟값 막대는 minBar, 최댓값 막대는 최대 높이. 전부 같으면 중간 높이)
  const diff = max - min;
  const span = diff || 2;
  const lo = diff ? min : min - 1;
  // 포인트가 적을 때 슬래브처럼 넓어지지 않게 막대 폭 상한 + 중앙 정렬
  const bw = Math.min(12, (w - pad * 2 - gap * (trend.length - 1)) / trend.length);
  const x0 = (w - (bw * trend.length + gap * (trend.length - 1))) / 2;
  const bi = trend.findIndex(t => t.dt === baseDt);
  const bars = trend.map((t, i) => {
    const bh = minBar + (h - pad * 2 - minBar) * ((t.cei - lo) / span);
    // 막대 색 = 그 날짜의 CEI 등급 색 (공용 ceiGradeOf — 마커·뱃지와 동일 컷)
    const g = ((window.ceiGradeOf && window.ceiGradeOf(t.cei)) || 'D').toLowerCase();
    const cls = `eqp-spark-bar eqp-spark-g-${g}${i === bi ? ' eqp-spark-bar--base' : ''}`;
    return `<rect x="${(x0 + i * (bw + gap)).toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" class="${cls}" data-tip="${t.dt} · CEI ${t.cei} (${g.toUpperCase()})"></rect>`;
  }).join('');
  return `<svg class="eqp-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
    role="img" aria-label="CEI 추이 ${vals[0]} → ${vals[vals.length - 1]}">${bars}</svg>`;
}

// 추이 셀 — 스파크바 + 현재 CEI 숫자·전일 대비 화살표 (직관화, P4-1)
function eqpSparkCell(trend) {
  const spark = eqpSpark(trend, _eqpBaseDt);
  if (!trend || !trend.length) return spark;
  let bi = trend.findIndex(t => t.dt === _eqpBaseDt);
  if (bi < 0) bi = trend.length - 1;
  const cur = trend[bi];
  const prev = bi > 0 ? trend[bi - 1] : null;
  const d = prev ? +(cur.cei - prev.cei).toFixed(1) : null;
  const arrow = d == null || d === 0 ? ''
    : ` <span class="${d > 0 ? 'ops-good' : 'ops-bad'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
  return `<span class="eqp-spark-cell">${spark}
    <span class="eqp-spark-num" title="기준일 CEI (전일 대비)"><b>${cur.cei}</b>${arrow}</span></span>`;
}

// 스파크바 즉시 툴팁 — 막대에 마우스를 올리면 날짜·CEI 숫자 표시 (장비·작업 탭 공용)
const _sparkTip = document.createElement('div');
_sparkTip.className = 'spark-tip';
_sparkTip.hidden = true;
document.addEventListener('mousemove', e => {
  // 스파크바(장비·작업) + 30일 이력 막대(eqh-bar) 공용 — data-tip 있는 막대면 즉시 표시
  const bar = e.target.closest ? e.target.closest('.eqp-spark-bar, .eqh-bar') : null;
  if (!bar || !bar.dataset.tip) {
    if (!_sparkTip.hidden) _sparkTip.hidden = true;
    return;
  }
  if (!_sparkTip.isConnected) document.body.appendChild(_sparkTip);
  _sparkTip.textContent = bar.dataset.tip;
  _sparkTip.hidden = false;
  _sparkTip.style.left = `${e.clientX + 12}px`;
  _sparkTip.style.top = `${e.clientY - 30}px`;
});

// ── 조치 대상 (건물) 추출 ─────────────────────────────────────
let _eqpSearchedOnce = false;
let _eqpNotReadyRetry = 0;   // 재기동 직후 데이터 미적재 재시도 카운터

async function eqpSearch() {
  _eqpSearchedOnce = true;
  const bldRaw = document.getElementById('eqp-blds').value.trim();
  const body = {
    hns_team: document.getElementById('eqp-team').value,
    hns_post: document.getElementById('eqp-post').value,
    base_dt: eqpDate8(document.getElementById('eqp-base-date').value),
    bld_cds: bldRaw ? bldRaw.split(/[\s,;]+/).filter(Boolean) : [],
    limit: 50,
  };
  // 수동 재검색(자동 진입이 아닌 검색)이면 관제 컨텍스트 배너 해제
  if (!_eqpAutoOpenBld) eqpCloseCtxBanner();
  eqpHideEquips();  // 재검색은 항상 목록 뷰에서 시작 (진단 뷰였다면 복귀 + 상태 초기화)
  const tbody = document.getElementById('eqp-target-body');
  tbody.innerHTML = skelTableRows(6, 6, '조치 대상 건물 추출 중…');
  // 로딩 중에는 이전 검색의 자율복구 스트립을 감춤 — 응답 후 새 값으로 다시 표시
  const arBoxLoading = document.getElementById('eqp-ar-report');
  if (arBoxLoading) arBoxLoading.hidden = true;
  try {
    const data = await fetch(`${BASE_PATH}/api/eqp/targets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    // 재기동 직후 장비 데이터 미적재 — 0건으로 그리지 않고 재시도 (0820)
    if (data && data.ready === false) {
      if ((_eqpNotReadyRetry = (_eqpNotReadyRetry || 0) + 1) <= 60) {
        tbody.innerHTML = skelTableRows(6, 6, '서버 데이터 적재 중 — 잠시 뒤 자동으로 다시 시도합니다…');
        setTimeout(eqpSearch, 10000);
        return;
      }
    }
    _eqpNotReadyRetry = 0;
    _eqpTargets = data.targets || [];
    _eqpBaseDt = data.base_dt || body.base_dt;
    // 기준일 미지정 검색(관제 진입)이면 서비스가 고른 기준일을 입력창에 반영
    if (!body.base_dt && data.base_dt) {
      const dtInp = document.getElementById('eqp-base-date');
      if (dtInp) dtInp.value = eqpDateISO(String(data.base_dt));
    }
    document.getElementById('eqp-target-meta').textContent =
      data.base_dt ? `기준일 ${data.base_dt} · 대상선정 ${data.matched}건 · 건물을 선택하면 장비별 진단` : '';
    if (!_eqpTargets.length) {
      // 관제 진단에서 넘어왔는데 대상이 없으면 — 빈 표 대신 맥락 있는 안내
      // (배너의 "진단 완료" 주장과 모순되는 dead-end 방지)
      const c = _eqpAutoOpenBld ? _eqpEntryCtx : null;
      _eqpAutoOpenBld = null;
      const arBox0 = document.getElementById('eqp-ar-report');
      if (arBox0) arBox0.hidden = true;   // 이전 검색의 자율복구 리포트 잔재 제거
      tbody.innerHTML = `<tr><td colspan="6" class="ops-empty">${c
        ? `${c.bld_nm || c.bld_cd} — 기준일 데이터에 장비 단위 대상이 아직 없습니다. 기준일을 변경하거나 다른 건물을 선택해 주세요.`
        : (data.empty_reason || '조건에 맞는 대상이 없습니다')}</td></tr>`;
      return;
    }
    // 새벽 자율복구 결과 리포트 — 아침 출근 시나리오 (필터 스코프 합계)
    const arBox = document.getElementById('eqp-ar-report');
    const ar = data.ar_report || {};
    if (arBox) {
      if (ar.tried) {
        // 문구·버튼 정렬 (사용자 피드백 0821): 자연스러운 한 문장 + 버튼은 우측 끝
        arBox.innerHTML = `<span class="eqp-ar-report-tx"><b>지난밤 Auto-reset 결과</b> —
          시도 <b>${ar.tried.toLocaleString('ko-KR')}대</b> 중
          <b class="ops-good">${ar.ok.toLocaleString('ko-KR')}대 복귀</b>,
          <b class="ops-bad">${ar.fail.toLocaleString('ko-KR')}대 미복구</b>.
          ${ar.fail ? '미복구 장비는 지시서(Ticket) 발행 대상입니다.'
                    : '전 건 복귀 — CEI 효과검증으로 추적 중입니다.'}</span>
          <button class="ops-btn eqp-ar-report-btn" onclick="arReportOpen()">상세 리포트</button>`;
        arBox.hidden = false;
      } else {
        arBox.hidden = true;
      }
    }
    tbody.innerHTML = _eqpTargets.map((t, i) => `
      <tr class="eqp-target-row" data-i="${i}" onclick="eqpSelectBld(${i}, this)">
        <td class="ops-td-sub">${t.bld_cd}</td>
        <td class="ops-td-bld"><b>${t.bld_nm}</b>
          ${t.equipless ? '<span class="eqp-arc" title="장비 인벤토리(장비 마스터) 미등재 — 관제와 동일한 건물 단위 데이터로 표시">건물 단위</span>' : ''}
          <span class="ops-td-sub">${t.hns_team}${t.hns_post ? ' · ' + t.hns_post : ''}</span>
          ${t.ar_ok || t.ar_fail ? `<span class="eqp-arc-line">
            ${t.ar_ok ? `<span class="eqp-arc eqp-arc--ok">자율복구 복귀 ${t.ar_ok}대</span>` : ''}
            ${t.ar_fail ? `<span class="eqp-arc eqp-arc--fail">미복구 ${t.ar_fail}대 — 발행 대상</span>` : ''}
          </span>` : ''}</td>
        <td class="${t.cd_cnt ? 'ops-bad' : ''}">${t.cd_cnt}명</td>
        <td>${t.voc}</td>
        <td><b>${t.score}</b></td>
        <td>${eqpSparkCell(t.trend)}</td>
      </tr>`).join('');
    // 관제 진입 시 해당 건물 행 자동 선택 → 장비별 진단까지 한 번에 펼침 (추가 클릭 불필요)
    // innerHTML 직후라 행이 이미 DOM에 있음 — 타이머 없이 동기 호출로 타이밍 문제 회피
    if (_eqpAutoOpenBld) {
      const ai = _eqpTargets.findIndex(t => String(t.bld_cd) === String(_eqpAutoOpenBld));
      _eqpAutoOpenBld = null;
      if (ai >= 0) {
        const rowEl = tbody.querySelector(`.eqp-target-row[data-i="${ai}"]`);
        if (rowEl) eqpSelectBld(ai, rowEl);
      } else {
        _eqpAutoPick = false;
      }
    }
  } catch (e) {
    _eqpAutoOpenBld = null;
    _eqpAutoPick = false;
    tbody.innerHTML = '<tr><td colspan="6" class="ops-empty">추출 실패 — 네트워크 확인</td></tr>';
  }
}

// ── 건물 선택 → 토폴로지 진단 (드릴다운 화면 전환) ─────────────
// 아코디언(행 삽입) 방식 폐지 — 목록 뷰(#eqp-list-view)와 진단 뷰
// (#eqp-detail-view)를 통째로 전환한다. 스티키 테이블 헤더와의 겹침이
// 구조적으로 불가능하고, 복귀 시 검색 결과·필터·스크롤이 그대로 산다.
let _eqpOpenIdx = null;
let _eqpListScroll = 0;   // 진단 진입 시점의 목록 스크롤 위치 (복귀 시 복원)

function eqpShowDetail() {
  const lv = document.getElementById('eqp-list-view');
  const dv = document.getElementById('eqp-detail-view');
  if (!lv || !dv) return;
  const wrap = lv.querySelector('.ops-tbl-wrap');
  _eqpListScroll = wrap ? wrap.scrollTop : 0;
  lv.hidden = true;
  dv.hidden = false;
}

// [← 대상 목록] — 검색 결과·필터 상태·스크롤 위치 유지, 진단했던 행은
// is-selected 하이라이트가 남아 있어 어디를 봤는지 바로 보인다.
function eqpBackToList() {
  eqpTtHide();
  clearTimeout(_eqpScanTimer);
  const lv = document.getElementById('eqp-list-view');
  const dv = document.getElementById('eqp-detail-view');
  if (!lv || !dv) return;
  dv.hidden = true;
  lv.hidden = false;
  const wrap = lv.querySelector('.ops-tbl-wrap');
  if (wrap) wrap.scrollTop = _eqpListScroll;
}

// 진단 상태 초기화 + 목록 뷰 복귀 — 재검색(eqpSearch) 직전에 호출
function eqpHideEquips() {
  _eqpOpenIdx = null;
  clearTimeout(_eqpScanTimer);
  _eqpScanDone = false;
  _eqpStepNotes = [];
  eqpTtHide();
  document.querySelectorAll('.eqp-target-row').forEach(r => r.classList.remove('is-selected'));
  const steps = document.getElementById('eqp-steps');
  if (steps) steps.innerHTML = '';
  const lv = document.getElementById('eqp-list-view');
  const dv = document.getElementById('eqp-detail-view');
  if (dv) dv.hidden = true;
  if (lv) lv.hidden = false;
  _eqpEquips = [];
  eqpInsightReset();
}

// 누적 카운터(BIP/CRC — 실데이터는 수억 단위) 축약 표기
function eqpFmtCnt(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '억';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '만';
  return String(n);
}

function eqpFmtDetail(d) {
  if (!d) return '';
  const parts = [];
  if (d.bip_error) parts.push(`BIP ${eqpFmtCnt(d.bip_error)}`);
  if (d.crc) parts.push(`CRC ${eqpFmtCnt(d.crc)}`);
  if (d.onu_power) parts.push(`ONT ${d.onu_power}dBm`);
  return parts.join(' · ');
}

// 장비별 자동 진단 등급 — CEI·C·D 가입자·열위 factor 종합.
// 기준은 기존 UI 컨벤션(cei<80 = bad 강조, +5 스케일)과 동일 선상.
function eqpGrade(e) {
  if ((e.cei != null && e.cei < 80) || (e.cd_cnt || 0) > 0) return { label: '위험', cls: 'eqp-grade--bad' };
  if ((e.cei != null && e.cei < 90) || (e.factors || []).length) return { label: '주의', cls: 'eqp-grade--warn' };
  return { label: '정상', cls: 'eqp-grade--good' };
}

// 세부 factor를 값 포함 배지로 — 진단 근거가 항상 펼쳐져 보이게 (클릭 불필요)
function eqpFactorBadges(e) {
  const d = e.detail || {};
  const fs = e.factors || [];
  const out = [];
  if (fs.includes('BIP')) out.push(`BIP ${eqpFmtCnt(d.bip_error || 0)}`);
  if (fs.includes('광레벨')) out.push(`광레벨 ${d.onu_power}dBm`);
  if (fs.includes('CRC')) out.push(`CRC ${eqpFmtCnt(d.crc || 0)}`);
  if (!out.length) return '<span class="ops-factor-badge">열위 없음</span>';
  return out.map(t => `<span class="ops-factor-badge ops-factor-badge--bad">${t}</span>`).join('');
}

async function eqpSelectBld(i, rowEl) {
  const t = _eqpTargets[i];
  if (!t) return;
  _eqpOpenIdx = i;
  // 진단했던 행 표시 — 복귀 시 하이라이트로 남는다
  document.querySelectorAll('.eqp-target-row').forEach(r => r.classList.remove('is-selected'));
  if (rowEl) rowEl.classList.add('is-selected');

  // 목록 → 진단 뷰 전환 (카드 전체 폭) — 우측 장비별 정보도 초기화
  eqpInsightReset();
  eqpShowDetail();
  document.getElementById('eqp-dx-title').textContent = t.bld_nm || t.bld_cd;
  document.getElementById('eqp-dx-meta').textContent =
    `${t.bld_cd}${t.hns_team ? ` · ${t.hns_team}${t.hns_post ? '/' + t.hns_post : ''}` : ''}` +
    ` · 기준일 ${eqpDateISO(String(_eqpBaseDt || '')) || '—'}`;
  const box = document.getElementById('eqp-steps');
  box.scrollTop = 0;
  // 장비 마스터 미등재(TOT 조인 보강) 건물 — 장비 러너북 대신 건물 단위 안내
  if (t.equipless) {
    _eqpAutoPick = false;
    _eqpAutoIssue = false;
    _eqpEquips = [];
    box.innerHTML = `
      <div class="eqp-equipless">
        <div class="eqp-equipless-hd">건물 단위 데이터 — 장비 인벤토리 미등재</div>
        <p>이 건물은 장비 마스터(L2/L3 인벤토리)에 등재된 장비가 없어,
        관제와 동일한 <b>건물 단위 품질 데이터</b>로 표시됩니다.
        장비 단위 토폴로지 진단·자율복구 이관·지시서 발행은 제공되지 않습니다.</p>
        <div class="eqp-equipless-kpis">
          <span>CEI ${t.cei != null && window.ceiBadgeHtml ? ceiBadgeHtml(t.cei, 1) : (t.cei ?? '—')}</span>
          <span>C·D <b class="${t.cd_cnt ? 'ops-bad' : ''}">${t.cd_cnt}명</b></span>
          <span>VoC <b>${t.voc}</b></span>
          <span>가입자 <b>${(t.svc_cnt ?? 0).toLocaleString('ko-KR')}</b></span>
        </div>
        <button class="ops-btn" onclick="eqpGoControl('${String(t.bld_cd)}')">관제에서 AI 분석 →</button>
      </div>`;
    return;
  }
  box.innerHTML = _ldgBlock('장비·회선 데이터 수집 중…');
  try {
    const data = await fetch(`${BASE_PATH}/api/eqp/equips?bld_cd=${encodeURIComponent(t.bld_cd)}&base_dt=${_eqpBaseDt}&bld_nm=${encodeURIComponent(t.bld_nm || '')}`)
      .then(r => r.json());
    _eqpEquips = data.equips || [];
    if (!_eqpEquips.length) {
      _eqpAutoPick = false;
      _eqpAutoIssue = false;
      box.innerHTML = '<div class="ops-empty">장비 정보가 없습니다</div>';
      return;
    }
    // 단계형 토폴로지 진단 러너북 — STEP 1 스캔 연출 후 STEP 2~4 활성
    eqpRenderSteps();
  } catch (err) {
    _eqpAutoPick = false;
    _eqpAutoIssue = false;
    box.innerHTML = '<div class="ops-empty">장비 조회 실패</div>';
  }
}

// ============================================================
// 단계형 토폴로지 진단 러너북 (STEP 1~4) — 0820 재구성
// NOC/OSS 러너북: 위→아래 순서대로 읽고 처리한다.
//   STEP 1 토폴로지 진단(스캔) → STEP 2 개별 회선(자율복구 이관)
//   → STEP 3 OLT-ONU 구간 점검(지시서) → STEP 4 ONU 점검(세부이력/지시서)
// 분류 근거 — 토폴로지 직접 필드가 없어 레벨·C·D 회선 분포·물리 지표로 판정:
//   · bad  = eqpGrade 위험 (cei<80 || cd_cnt>0)
//   · 개별 = factors 없음 · Bad 회선(C·D) 1회선 이하 → 개별 회선 이슈 → 자율복구
//   · 구간 = factors 없음 · Bad 회선 2회선 이상 → 다회선 동시 열위(상위 구간 의심)
//   · ONU  = factors(BIP/광레벨/CRC) 존재 → 장비 자체 물리 지표 이상
// ============================================================
let _eqpScanTimer = null;
let _eqpScanDone = false;
let _eqpStepNotes = [];       // 이관·발행 진행 안내 누적 (러너북 하단)
let _eqpStep2Confirm = false; // STEP 2 인라인 확인("이관하겠습니까?") 표시 여부
let _eqpRevealTimer = null;   // STEP 순차 등장 연출 — 1회성, 재렌더 시 재생 안 함

// STEP 카드 순차 등장 연출 — #eqp-steps에 1회성 클래스 부여 후 자동 제거.
// scan=true: 스캔 중 pending 카드 짧은 간격 / false: 진단 확정 단계별 등장.
// 재렌더(eqpStepsRefresh)는 클래스를 먼저 지우므로 애니메이션이 반복되지 않는다.
function eqpStepsReveal(scan) {
  const box = document.getElementById('eqp-steps');
  if (!box) return;
  clearTimeout(_eqpRevealTimer);
  box.classList.remove('is-reveal', 'is-reveal--scan');
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  void box.offsetWidth; // 연속 부여 시에도 애니메이션 재시작 보장
  box.classList.add('is-reveal');
  if (scan) box.classList.add('is-reveal--scan');
  _eqpRevealTimer = setTimeout(() =>
    box.classList.remove('is-reveal', 'is-reveal--scan'), scan ? 1100 : 2100);
}

function eqpStepClassify() {
  const eqs = _eqpEquips || [];
  const recovered = eqs.filter(e =>
    e.cei_prev != null && e.cei_prev < 80 && (e.cei ?? 100) >= 80);
  const bad = eqs.filter(e => eqpGrade(e).cls === 'eqp-grade--bad');
  const solo = bad.filter(e => !(e.factors || []).length && (e.cd_cnt || 0) <= 1);
  const seg = bad.filter(e => !(e.factors || []).length && (e.cd_cnt || 0) >= 2);
  const onu = bad.filter(e => (e.factors || []).length > 0);
  return { total: eqs.length, recovered, bad, solo, seg, onu };
}

// 건물 선택 직후 — STEP 1 스캔 연출(약 1초) 후 전 스텝 활성
function eqpRenderSteps() {
  clearTimeout(_eqpScanTimer);
  _eqpScanDone = false;
  _eqpStep2Confirm = false;
  _eqpStepNotes = [];
  eqpStepsReveal(true);
  eqpStepsPaint();
  _eqpScanTimer = setTimeout(() => {
    _eqpScanDone = true;
    eqpStepsReveal(false);
    eqpStepsPaint();
    eqpStepsAfterScan();
  }, 1000);
}

// 조치 반영 재렌더 — 스캔 완료 전에는 무시 (연출 중 덮어쓰기 방지)
// 재렌더는 순차 등장 없이 즉시 표시 (같은 대상에서 애니메이션 반복 방지)
function eqpStepsRefresh() {
  if (!_eqpScanDone) return;
  clearTimeout(_eqpRevealTimer);
  const box = document.getElementById('eqp-steps');
  if (box) box.classList.remove('is-reveal', 'is-reveal--scan');
  eqpStepsPaint();
}

// 헤드라인의 큰 건수 — "N식"
function eqpStepN(n, bad) {
  return `<b class="eqp-step-n ${bad && n ? 'eqp-step-n--bad' : ''}">${n}</b><span class="eqp-step-unit">식</span>`;
}

function eqpStepRowState(e) {
  if (e._issued) return '<span class="eqp-grade eqp-grade--issued">지시서 발행</span>';
  if (e._resv) return '<span class="eqp-grade eqp-grade--resv">자율복구 예약</span>';
  return '<span class="ops-td-sub">대기</span>';
}

// 물리 지표 셀 — null 만 '—', 0 은 '0' 그대로. 열위 factor 해당 시 빨강 강조.
function eqpPhysCell(val, isBad, fmt) {
  if (val == null) return '<td class="ops-td-sub">—</td>';
  return `<td class="eqp-st-phys ${isBad ? 'ops-bad' : ''}">${fmt ? fmt(val) : val}</td>`;
}

// 스텝 공용 컴팩트 표 — TID(mono)·레벨·CEI·C·D·VoC·BIP·광레벨·CRC
// (물리 지표는 hover 없이 바로 보이게 컬럼으로 노출, 0820 대개편)
// 행 클릭 = 우측 "장비별 정보" 패널 (체크박스·세부이력은 전파 차단)
function eqpStepTbl(list, opts = {}) {
  const head = `<thead><tr>
    ${opts.chk ? '<th class="eqp-st-chkcol"><input type="checkbox" onchange="eqpStep4CheckAll(this)" title="전체 선택" onclick="event.stopPropagation()"></th>' : ''}
    <th>TID</th><th>레벨</th><th>CEI</th>
    <th title="CEI C·D등급 가입자 = Bad 회선 수">C·D</th><th>VoC</th>
    <th title="BIP 에러 누적">BIP</th><th title="ONT 광 인풋 레벨 (dBm)">광레벨</th><th title="CRC 에러 누적">CRC</th>
    <th title="모델 ① 장비 이상탐지(1D CNN AutoEncoder) — 재구성 오차 기반 이상 스코어 0~100">AI 스코어</th>
    <th>상태</th>${opts.hist ? '<th class="eqp-st-histcol"></th>' : ''}
  </tr></thead>`;
  const rows = list.map(e => {
    const j = _eqpEquips.indexOf(e);
    const d = e.detail || {};
    const fs = e.factors || [];
    const sel = _eqpInsSelId && e.equip_id === _eqpInsSelId ? ' is-selected' : '';
    return `<tr class="eqp-tt-row${sel}" data-j="${j}" onclick="eqpInsightSelect(${j})"
      title="클릭하면 우측에 장비별 정보(가입자·물리 지표·토폴로지) 표시">
      ${opts.chk ? `<td class="eqp-st-chkcol" onclick="event.stopPropagation()">${e._issued || e._resv ? ''
        : `<input type="checkbox" class="eqp-row-chk" data-j="${j}" onchange="eqpUpdateSelCnt()">`}</td>` : ''}
      <td class="eqp-st-tid"><span class="eqp-st-tid-tx" title="${_escapeHtml(String(e.tid || e.nm || e.equip_id))}">${e.tid || e.nm || e.equip_id}</span></td>
      <td>${e.level || '—'}</td>
      <td>${window.ceiBadgeHtml(e.cei)}</td>
      <td class="${e.cd_cnt ? 'ops-bad' : ''}">${e.cd_cnt ?? 0}</td>
      <td>${e.voc ?? 0}</td>
      ${eqpPhysCell(d.bip_error, fs.includes('BIP'), eqpFmtCnt)}
      ${eqpPhysCell(d.onu_power, fs.includes('광레벨'), v => v + 'dBm')}
      ${eqpPhysCell(d.crc, fs.includes('CRC'), eqpFmtCnt)}
      <td>${aiScoreCellHtml(e)}</td>
      <td>${eqpStepRowState(e)}</td>
      ${opts.hist ? `<td class="eqp-st-histcol"><button class="ops-btn eqp-st-mini" onclick="event.stopPropagation(); eqpArHistory(${j})"
        title="장비 이력 — 전후 지표·지속성">세부이력</button></td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="eqp-st-tblwrap"><table class="ops-tbl eqp-st-tbl">${head}<tbody>${rows}</tbody></table></div>`;
}

function eqpStepCard(n, title, state, stateLbl, inner) {
  return `<div class="eqp-step ${state}">
    <div class="eqp-step-rail"><span class="eqp-step-badge">${n}</span></div>
    <div class="eqp-step-card">
      <div class="eqp-step-hd">
        <span class="eqp-step-kicker">STEP ${n}</span>
        <span class="eqp-step-title">${title}</span>
        <span class="eqp-step-state">${stateLbl}</span>
      </div>
      ${inner}
    </div>
  </div>`;
}

function eqpStepsPaint() {
  const box = document.getElementById('eqp-steps');
  if (!box) return;
  eqpTtHide();   // 행이 갈리므로 떠 있는 TMI 툴팁 제거
  // 재렌더 전 체크 상태 보존 (STEP 4 선택)
  const keep = new Set(eqpSelected().map(e => e.equip_id));
  const c = eqpStepClassify();
  const baseISO = eqpDateISO(String(_eqpBaseDt || '')) || '—';

  // ── STEP 1 — 토폴로지 진단 (스캔 중) ──
  if (!_eqpScanDone) {
    const pend = (n, title) => eqpStepCard(n, title, 'is-pending', '대기',
      '<div class="eqp-step-sub">STEP 1 진단 완료 후 분류됩니다</div>');
    box.innerHTML = eqpStepCard(1, '토폴로지 진단', 'is-active', '진행 중', `
      <div class="eqp-step-headline">토폴로지 진단을 시행합니다.</div>
      <div class="eqp-scan"><span class="eqp-scan-track"></span>
        <span>OLT–ONU 구성 · C·D 회선 분포 · 물리 지표(BIP/광레벨/CRC) 스캔 중…</span></div>`)
      + pend(2, '개별 회선 → 자율복구') + pend(3, 'OLT-ONU 구간 점검') + pend(4, 'ONU 점검');
    return;
  }

  const recTxt = c.recovered.length
    ? ` · 지난밤 자율복구 복귀 <b class="ops-good">${c.recovered.length}대</b> <span class="ops-td-sub">(CEI 효과검증 추적 중)</span>` : '';
  const basis = `<div class="eqp-step-sub">판정 근거: 레벨 · C·D 회선 분포 · 물리 지표(BIP/광레벨/CRC) 기반 분류 · 기준일 ${baseISO}
    · ${modelBadgeHtml('anomaly', '이상 스코어')} ${modelBadgeHtml('action', '권고 분류')}</div>`;

  // ── Bad 장비 0대 — 전 장비 정상. 요약 + 장비 목록 표 (행 클릭 →
  //    우측 장비별 정보 — 정상 건물에서도 장비 단위 확인 가능, 0820) ──
  if (!c.bad.length) {
    box.innerHTML = eqpStepCard(1, '토폴로지 진단', 'is-done', '완료', `
      <div class="eqp-step-headline">이 건물은 전 장비 정상 — 조치 불필요</div>
      <div class="eqp-step-sub">토폴로지 진단 완료 — 장비 ${c.total}대 · Bad 장비 0대${recTxt}</div>
      ${basis}
      ${_eqpEquips.length ? `<div class="eqp-step-sub" style="margin-top:8px">장비 목록 — 행을 클릭하면 우측에 장비별 정보가 표시됩니다</div>
      ${eqpStepTbl(_eqpEquips, { hist: true })}` : ''}`);
    return;
  }

  const s1 = eqpStepCard(1, '토폴로지 진단', 'is-done', '완료', `
    <div class="eqp-step-headline">토폴로지 진단 완료 — 장비 <b>${c.total}대</b> ·
      Bad 장비 <b class="ops-bad">${c.bad.length}대</b>${recTxt}</div>
    ${basis}`);

  // ── STEP 2 — 개별 회선 → 자율복구 이관 ──
  const soloPend = c.solo.filter(e => !e._resv && !e._issued);
  const s2done = c.solo.length > 0 && !soloPend.length;
  let s2inner, s2state, s2lbl;
  if (!c.solo.length) {
    s2inner = '<div class="eqp-step-sub eqp-step-none">해당 없음 — 단일 Bad 회선 장비가 없습니다</div>';
    s2state = 'is-idle'; s2lbl = '해당 없음';
  } else {
    const act = s2done
      ? '<div class="eqp-step-doneline"><b class="ops-good">이관 완료</b> — 자율복구 Agent가 금일 야간 배치에서 원격 리셋 수행, CEI 효과검증으로 추적합니다.</div>'
      : _eqpStep2Confirm
        ? `<div class="eqp-step-confirm">자율복구 Agent로 이관하겠습니까?
             <button class="ops-btn ops-btn--primary" onclick="eqpStep2Go()">이관</button>
             <button class="ops-btn" onclick="eqpStep2Cancel()">취소</button></div>`
        : `<div class="eqp-step-act">
             <button class="ops-btn ops-btn--primary" onclick="eqpStep2Ask()">자율복구 Agent로 이관 (${soloPend.length}대)</button>
             <span class="eqp-step-hint">원격 포트 리셋 — 현장 출동 없이 처리</span></div>`;
    s2inner = `
      <div class="eqp-step-headline">장비별 Bad 회선이 1회선만 존재하는 장비는 ${eqpStepN(c.solo.length, true)}입니다</div>
      <div class="eqp-step-sub">개별 회선 이슈 — 원격 복구로 처리 가능</div>
      ${eqpStepTbl(c.solo)}
      ${act}`;
    s2state = s2done ? 'is-done' : 'is-active';
    s2lbl = s2done ? '이관 완료' : '조치 필요';
  }
  const s2 = eqpStepCard(2, '개별 회선 → 자율복구', s2state, s2lbl, s2inner);

  // ── STEP 3 — OLT-ONU 구간 점검 (다회선 동시 열위) ──
  const segPend = c.seg.filter(e => !e._issued && !e._resv);
  const s3done = c.seg.length > 0 && !segPend.length;
  let s3inner, s3state, s3lbl;
  if (!c.seg.length) {
    s3inner = '<div class="eqp-step-sub eqp-step-none">해당 없음 — 다회선 동시 열위 장비가 없습니다</div>';
    s3state = 'is-idle'; s3lbl = '해당 없음';
  } else {
    const act = s3done
      ? '<div class="eqp-step-doneline"><b class="ops-good">발행 완료</b> — FMS 연계·담당 Post 자동 할당. 진행 보드에서 CEI 효과검증으로 추적합니다.</div>'
      : `<div class="eqp-step-act">
           <button class="ops-btn ops-btn--primary" onclick="eqpStep3Issue()">지시서 발행 (구간 점검 · ${segPend.length}대)</button>
           <span class="eqp-step-hint">발행 즉시 FMS 연계 · Post 자동 할당</span></div>`;
    s3inner = `
      <div class="eqp-step-headline">OLT-ONU 구간 점검이 필요한 장비는 ${eqpStepN(c.seg.length, true)}입니다</div>
      <div class="eqp-step-sub">다회선 동시 열위 — 상위 구간(OLT-ONU) 이슈 의심</div>
      ${eqpStepTbl(c.seg)}
      ${act}`;
    s3state = s3done ? 'is-done' : 'is-active';
    s3lbl = s3done ? '발행 완료' : '조치 필요';
  }
  const s3 = eqpStepCard(3, 'OLT-ONU 구간 점검', s3state, s3lbl, s3inner);

  // ── STEP 4 — ONU 점검 (물리 지표 이상, 세부이력/선택 발행) ──
  const onuPend = c.onu.filter(e => !e._issued && !e._resv);
  const s4done = c.onu.length > 0 && !onuPend.length;
  let s4inner, s4state, s4lbl;
  if (!c.onu.length) {
    s4inner = '<div class="eqp-step-sub eqp-step-none">해당 없음 — 물리 지표 이상 장비가 없습니다</div>';
    s4state = 'is-idle'; s4lbl = '해당 없음';
  } else {
    const act = s4done
      ? '<div class="eqp-step-doneline"><b class="ops-good">발행 완료</b> — FMS 연계·담당 Post 자동 할당. 진행 보드에서 CEI 효과검증으로 추적합니다.</div>'
      : `<div class="eqp-step-act">
           <button id="eqp-step4-issue" class="ops-btn ops-btn--primary" onclick="eqpIssue()" disabled>지시서 발행 (선택 0대)</button>
           <span class="eqp-step-hint">세부이력으로 확인 후 대상 장비를 선택해 발행</span></div>`;
    s4inner = `
      <div class="eqp-step-headline">ONU 점검이 필요한 장비는 ${eqpStepN(c.onu.length, true)}입니다</div>
      <div class="eqp-step-sub">BIP·광레벨·CRC 물리 지표 이상 — 장비(ONU) 자체 점검 필요</div>
      ${eqpStepTbl(c.onu, { chk: true, hist: true })}
      ${act}`;
    s4state = s4done ? 'is-done' : 'is-active';
    s4lbl = s4done ? '발행 완료' : '조치 필요';
  }
  const s4 = eqpStepCard(4, 'ONU 점검', s4state, s4lbl, s4inner);

  const notes = _eqpStepNotes.length
    ? `<div class="eqp-step-note" id="eqp-ai-sum-note">${_eqpStepNotes.map(n => `<div>${n}</div>`).join('')}</div>` : '';
  box.innerHTML = s1 + s2 + s3 + s4 + notes;

  // 체크 상태 복원 + 발행 버튼 동기화
  document.querySelectorAll('#eqp-steps .eqp-row-chk').forEach(chk => {
    const e = _eqpEquips[Number(chk.dataset.j)];
    if (e && keep.has(e.equip_id)) chk.checked = true;
  });
  eqpUpdateSelCnt();
}

// 스캔 완료 직후 — 관제/AR 자동 진입 처리 (AI 대상선정, 사람은 승인만)
function eqpStepsAfterScan() {
  const c = eqpStepClassify();
  if (_eqpAutoPick) {
    _eqpAutoPick = false;
    // ONU 점검(STEP 4) 대상 사전 선택
    document.querySelectorAll('#eqp-steps .eqp-row-chk').forEach(chk => {
      const e = _eqpEquips[Number(chk.dataset.j)];
      if (e && c.onu.includes(e)) chk.checked = true;
    });
    eqpUpdateSelCnt();
  }
  if (_eqpAutoIssue) {
    _eqpAutoIssue = false;
    const sel = eqpSelected();
    if (sel.length) eqpIssue();
    else {
      // 선택이 없으면 구간·ONU 점검 대상 전체로 발행 미리보기
      const lst = [...c.seg, ...c.onu].filter(e => !e._issued && !e._resv);
      if (lst.length) eqpIssue(lst);
    }
  }
}

// ── STEP 2 액션 — 인라인 확인 후 자율복구 Agent 이관 ──────────
function eqpStep2Ask() { _eqpStep2Confirm = true; eqpStepsRefresh(); }
function eqpStep2Cancel() { _eqpStep2Confirm = false; eqpStepsRefresh(); }
function eqpStep2Go() {
  _eqpStep2Confirm = false;
  const list = eqpStepClassify().solo.filter(e => !e._resv && !e._issued);
  eqpAutoResetFor(list);
}

// ── STEP 3 액션 — 구간 점검 지시서 발행 (기존 eqpIssue 흐름 재사용) ──
function eqpStep3Issue() {
  const list = eqpStepClassify().seg.filter(e => !e._issued && !e._resv);
  if (list.length) eqpIssue(list);
}

function eqpStep4CheckAll(el) {
  document.querySelectorAll('#eqp-steps .eqp-row-chk').forEach(c => { c.checked = el.checked; });
  eqpUpdateSelCnt();
}

// 진행 안내 누적 — 이관/발행이 연달아 일어나도 앞 메시지를 지우지 않는다
function eqpSumNote(text) {
  _eqpStepNotes.push(text);
  const note = document.getElementById('eqp-ai-sum-note');
  if (note) note.innerHTML = _eqpStepNotes.map(n => `<div>${n}</div>`).join('');
}

// 자율복구 Agent 이관 — 대상 장비를 큐에 예약 (시연 목업: 야간 배치 수행
// → CEI 효과검증). 예약된 장비는 발행 대상에서 제외된다.
function eqpAutoResetFor(list) {
  if (!list || !list.length) return;
  list.forEach(e => { e._resv = true; });
  eqpSumNote(`자율복구 Agent에 ${list.length}대 이관했습니다 — 금일 야간 배치에서 원격 리셋 수행 후 CEI 효과검증 결과가 Reset 개선현황에 반영됩니다.`);
  eqpStepsRefresh();
}

function eqpSelected() {
  return [...document.querySelectorAll('.eqp-row-chk:checked')]
    .map(c => _eqpEquips[Number(c.dataset.j)]).filter(Boolean);
}

function eqpUpdateSelCnt() {
  const n = eqpSelected().length;
  const btn = document.getElementById('eqp-step4-issue');
  if (btn) {
    btn.disabled = !n;
    btn.textContent = `지시서 발행 (선택 ${n}대)`;
  }
}

// ── 지시서 발행 (장비단위) — 미리보기(시연 1-5) 후 발행 ───────
// 장비별 조치 제언 — factor 기반 규칙. "경험 없는 사람도 이대로 따라 하면
// 해결" 수준의 문장으로 (57 02:29).
// ※ models.js aiActionLabel()과 같은 factor 우선순위를 공유(문장형 vs 분류형) —
//   규칙을 바꿀 땐 두 함수를 함께 수정해 권고가 어긋나지 않게 한다.
function eqpAdvice(e) {
  const fs = e.factors || [];
  const d = e.detail || {};
  const out = [];
  if (fs.includes('광레벨')) out.push(`광 인풋 레벨 ${d.onu_power}dBm 저하 — 광 커넥터 청소·접촉 점검, 개선 없으면 상위 포트 탈실장 후 재실장`);
  if (fs.includes('CRC')) out.push(`CRC ${eqpFmtCnt(d.crc || 0)} 검출 — 업링크·가입자 포트/커넥터 점검, 지속 시 카드(PON 모듈) 교체`);
  if (fs.includes('BIP')) out.push(`BIP ${eqpFmtCnt(d.bip_error || 0)} 누적 — 광선로(OJC) 구간 점검, 모듈 교체 검토`);
  if (!out.length && (e.cd_cnt || 0) >= 4)
    out.push(`C·D 가입자 ${e.cd_cnt}명 다발 지속 — 현장 구간 점검(분기 포트·커넥터·세대 인입), 리셋 이력에도 미복구 시 장비 대개체 검토`);
  if (!out.length) out.push('열위 factor 미특정 — 원격 리셋(자율복구) 우선 시도, 리셋에도 미복구 시 장비 대개체 검토');
  return out;
}

let _eqpPendingIssue = null;

// 지시서 카드의 AI 판단 근거 블록 — 사용 모델·버전·이상 스코어·주 기여 팩터·신뢰도.
// 스코어/기여도는 models.js 결정 로직 재사용 — 장비 목록·인사이트 패널과 항상 동일 수치.
function _eqpIssAiBasis(e) {
  const sc = aiAnomalyScore(e);
  const top = aiFactorContrib(e).filter(c => c.w < 0).slice(0, 3);
  const topTxt = top.length
    ? top.map(c => `${c.name}${c.val ? ` ${c.val}` : ''} (${c.w.toFixed(2)})`).join(' · ')
    : '주 기여 팩터 미특정 (원인불명 — 리셋 우선)';
  const am = AI_MODELS.anomaly;
  return `
    <div>${am.algo.split('(')[0].trim()} ${am.ver} 이상 스코어 <b>${sc}</b> → 주 기여 팩터: ${topTxt}</div>
    <div style="margin-top:4px">조치 권고 분류: <b>${aiActionLabel(e)}</b></div>
    <div class="eqp-iss-ai-badges">
      ${modelBadgeHtml('anomaly', `이상 스코어 ${sc}`)}
      ${modelBadgeHtml('action', `신뢰도 ${aiActionConfidence(e)}%`)}
    </div>`;
}

// ── 자율복구 수행 이력 모달 (시연 1-6) ────────────────────────
// 초록 '자율복구 복귀' 배지 클릭 → 지난밤 수행·전후 비교·지속성 화면 1장.
async function eqpArHistory(j) {
  const e = _eqpEquips[j];
  if (!e) return;
  const d = await fetch(`${BASE_PATH}/api/eqp/equip-history?equip_id=${encodeURIComponent(e.equip_id)}&bld_cd=${encodeURIComponent(e.bld_cd || '')}`)
    .then(r => r.json()).catch(() => null);
  const items = (d && d.items) || [];
  const bi = items.findIndex(it => it.strd_dt === _eqpBaseDt);
  const cur = bi >= 0 ? items[bi] : items[items.length - 1];
  const prev = bi > 0 ? items[bi - 1] : (items.length > 1 ? items[items.length - 2] : null);
  const delta = cur && prev ? (cur.cei - prev.cei) : null;
  const at = arRunTime(e.equip_id);
  const fmtDt = s => s ? `${s.slice(4, 6)}/${s.slice(6, 8)}` : '—';

  document.getElementById('eqp-ar-title').textContent = e.tid || e.nm || e.equip_id;
  document.getElementById('eqp-ar-body').innerHTML = `
    <div class="eqp-iss-rows">
      <div class="eqp-iss-row"><span>수행</span><div>지난밤 <b>${at}</b> · 자율복구 Agent · <b>포트 리셋(원격)</b> — 현장 출동 없이 복구</div></div>
      <div class="eqp-iss-row"><span>조치 전 (${fmtDt(prev?.strd_dt)})</span>
        <div><span class="eqp-grade eqp-grade--bad">위험</span> CEI <b>${prev ? prev.cei : '—'}</b> · C·D 가입자 ${prev ? prev.cd_cnt : '—'}명${prev && prev.voc ? ` · VoC ${prev.voc}` : ''}</div></div>
      <div class="eqp-iss-row"><span>조치 후 (${fmtDt(cur?.strd_dt)})</span>
        <div><span class="eqp-grade eqp-grade--good">정상</span> CEI <b>${cur ? cur.cei : '—'}</b>${delta != null ? ` <b class="${delta > 0 ? 'ops-good' : 'ops-bad'}">(${delta > 0 ? '+' : ''}${delta.toFixed(1)})</b>` : ''} · C·D 가입자 ${cur ? cur.cd_cnt : '—'}명</div></div>
      <div class="eqp-iss-row"><span>전후 비교</span>
        <div>
          <div class="eqp-ar-chartwrap"><canvas id="eqp-ar-chart"></canvas></div>
          <div class="ops-td-sub" id="eqp-ar-pred-note"></div>
        </div></div>
      <div class="eqp-iss-row"><span>지속성</span>
        <div>${eqpSpark(items.map(it => ({ dt: it.strd_dt, cei: it.cei })), _eqpBaseDt)}
          <div class="ops-td-sub">${_eqpArRelapse(items, bi)} 리셋 이후 CEI 유지 여부를 D+7까지 CEI 효과검증으로 추적합니다.</div></div></div>
      <div class="eqp-iss-row"><span>결과 축적</span><div>수행 이력·전후 지표는 자율복구 결과로 축적되어 대상선정 학습에 반영됩니다.</div></div>
    </div>`;
  const modal = document.getElementById('eqp-ar-modal');
  modal.classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: modal });
  _eqpArDrawChart(items, bi >= 0 ? bi : items.length - 1);
}

// 복구 지속성 — 리셋(기준일) 이후 재악화 여부를 명시 (재하락 시 경고)
function _eqpArRelapse(items, bi) {
  const after = bi >= 0 ? items.slice(bi + 1) : [];
  if (!after.length) return '<b class="ops-good">재악화 없음</b> —';
  const bad = after.filter(it => it.cei != null && it.cei < 80);
  return bad.length
    ? `<b class="ops-bad">재악화 감지 (${bad.length}일)</b> — 재하락 시 현장 지시서 발행 대상.`
    : '<b class="ops-good">재악화 없음 — 복구 유지 중</b> —';
}

// 전후 비교 차트 — 실제 CEI(실선) vs 모델 예측(점선) 오버레이.
// 예측선: 리셋 시점 CEI에서 모델 기대 개선폭(잔여 결손의 80%)만큼 회복하는 선.
// "모델 예측 대비 실제 개선폭"은 (실제 개선 - 예측 개선) / 예측 개선.
let _eqpArChart = null;
function _eqpArDrawChart(items, bi) {
  const cv = document.getElementById('eqp-ar-chart');
  if (!cv || !window.Chart || items.length < 2) return;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  const fmtDt = s => s ? `${s.slice(4, 6)}/${s.slice(6, 8)}` : '';
  const prevIdx = Math.max(0, bi - 1);
  const prevCei = items[prevIdx]?.cei;
  const predGain = prevCei != null ? Math.round((AI_T.ceiTarget - prevCei) * 0.8 * 10) / 10 : null;
  const predLevel = prevCei != null ? Math.min(AI_T.ceiTarget, Math.round((prevCei + predGain) * 10) / 10) : null;
  const actual = items.map(it => it.cei);
  const pred = items.map((it, i) =>
    predLevel == null ? null : i < prevIdx ? null : i === prevIdx ? prevCei : predLevel);
  if (_eqpArChart) { _eqpArChart.destroy(); _eqpArChart = null; }
  _eqpArChart = new Chart(cv, {
    type: 'line',
    data: {
      labels: items.map(it => fmtDt(it.strd_dt)),
      datasets: [
        { label: '실제 CEI', data: actual, borderColor: css('--grade-b'), backgroundColor: 'transparent', tension: 0.25, pointRadius: 3 },
        { label: '모델 예측', data: pred, borderColor: css('--grade-c'), backgroundColor: 'transparent', borderDash: [6, 4], tension: 0, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 18 } } },
      scales: { y: { suggestedMin: 60, suggestedMax: 95 } },
    },
  });
  const note = document.getElementById('eqp-ar-pred-note');
  if (note) {
    const actGain = items[bi]?.cei != null && prevCei != null
      ? Math.round((items[bi].cei - prevCei) * 10) / 10 : null;
    const diffPct = predGain && actGain != null ? Math.round((actGain - predGain) / predGain * 100) : null;
    note.innerHTML = `점선 = 모델 예측(개선 추이 예측 ${AI_MODELS.forecast.ver}) · 실선 = 실제 CEI${
      diffPct != null ? ` — 모델 예측 대비 실제 개선폭 <b class="${diffPct >= 0 ? 'ops-good' : 'ops-bad'}">${diffPct > 0 ? '+' : ''}${diffPct}%</b>` : ''}
      ${modelBadgeHtml('forecast')}`;
  }
}

function eqpArClose() {
  document.getElementById('eqp-ar-modal').classList.remove('open');
}

async function eqpIssue(list) {
  // list 지정(STEP 3 구간 점검 등) 시 그 대상으로, 없으면 STEP 4 선택 장비로
  const sel = (list && list.length) ? list : eqpSelected();
  if (!sel.length) { alert('발행할 장비를 선택하세요.'); return; }
  _eqpPendingIssue = sel;

  // 최근 7일 작업(SWING) — 작업정보 원천(쿼리 3)을 건물 기준으로 조회,
  // 날짜·작업분류로 요약 (예: "08/14 리부팅 · 08/16 Config — 총 2건")
  let workLine = '최근 7일 작업·고장 이력 없음';
  try {
    const w = await fetch(`${BASE_PATH}/api/eqp/bld-work?bld_cd=${encodeURIComponent(sel[0].bld_cd)}&base_dt=${_eqpBaseDt}&days=7`)
      .then(r => r.json());
    const items = (w && w.items) || [];
    if (items.length) {
      const fmt = s => `${String(s).slice(4, 6)}/${String(s).slice(6, 8)}`;
      const shown = items.slice(0, 4).map(it =>
        `<span title="${_escapeHtml(it.oper_nm || '')}">${fmt(it.dt)} ${_escapeHtml(it.mcl || '작업')}</span>`).join(' · ');
      workLine = `${shown}${items.length > 4 ? ` <span class="ops-td-sub">외 ${items.length - 4}건</span>` : ''} — 총 ${items.length}건`;
    }
  } catch (e) { /* 작업이력 조회 실패해도 미리보기는 연다 */ }

  const body = document.getElementById('eqp-iss-body');
  body.innerHTML = sel.map((e, k) => {
    const g = eqpGrade(e);
    const delta = e.cei_prev != null && e.cei != null ? (e.cei - e.cei_prev) : null;
    return `
    <div class="eqp-iss-card">
      <div class="eqp-iss-card-hd">
        <span class="eqp-grade ${g.cls}">${g.label}</span>
        <b>${e.tid || e.nm || e.equip_id}</b>
        <span class="ops-factor-badge">${e.level}</span>
        ${e.nm ? `<span class="ops-td-sub">${e.nm}</span>` : ''}
      </div>
      <div class="eqp-iss-rows">
        <div class="eqp-iss-row"><span>대상 위치</span><div>${e.bld_nm || e.bld_cd}${e.hns_team ? ` · ${e.hns_team}${e.hns_post ? '/' + e.hns_post : ''}` : ''}</div></div>
        <div class="eqp-iss-row"><span>종합 진단</span><div>CEI <b>${e.cei ?? '—'}</b>${delta != null && delta !== 0 ? ` <span class="${delta > 0 ? 'ops-good' : 'ops-bad'}">(전일 대비 ${delta > 0 ? '+' : ''}${delta.toFixed(1)})</span>` : ''} · C·D 가입자 ${e.cd_cnt}명 · VoC ${e.voc} · ${eqpFmtDetail(e.detail) || '열위 factor 없음'}</div></div>
        <div class="eqp-iss-row"><span>최근 7일 작업 (SWING)</span><div>${workLine}</div></div>
        <div class="eqp-iss-row"><span>원인·조치 제언</span><div>${eqpAdvice(e).map(a => `· ${a}`).join('<br>')}</div></div>
        <div class="eqp-iss-row"><span>데이터 출처</span><div>LDAS 5분 시계열 · AQUA CEI(D-1) · SWING 작업이력 · FOMS 조치이력 · ADAMS 자율복구 실적</div></div>
        <div class="eqp-iss-row eqp-iss-row--ai"><span>AI 판단 근거</span><div>${_eqpIssAiBasis(e)}</div></div>
      </div>
      <div class="eqp-iss-card-ft" id="eqp-iss-card-ft-${k}">
        ${e._issued
          ? '<span class="eqp-arc eqp-arc--ok">발행 완료 · FMS 연계</span>'
          : `<button class="ops-btn ops-btn--primary" onclick="eqpIssueOne(${k})">이 장비 발행 (FMS 연계)</button>`}
      </div>
    </div>`;
  }).join('');
  const modal = document.getElementById('eqp-issue-modal');
  modal.classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: modal });
  _eqpIssSyncAll();
}

// 장비별 개별 발행 (0820) — 카드 단위로 하나씩 FMS 연계 발행.
// 성공 시 카드가 '발행 완료' 상태로 바뀌고 모달은 열린 채 유지 —
// 남은 장비를 이어서 하나씩 발행하거나 하단 [전체 발행]으로 마감.
async function eqpIssueOne(k) {
  const e = (_eqpPendingIssue || [])[k];
  if (!e || e._issued) return;
  const ft = document.getElementById(`eqp-iss-card-ft-${k}`);
  if (ft) ft.innerHTML = '<span class="ops-td-sub">FMS 연계 발행 중…</span>';
  await _eqpIssueSend([e]);
  if (ft) {
    ft.innerHTML = e._issued
      ? '<span class="eqp-arc eqp-arc--ok">발행 완료 · FMS 연계 — 진행 보드에서 추적</span>'
      : `<button class="ops-btn ops-btn--primary" onclick="eqpIssueOne(${k})">재시도 — 이 장비 발행 (FMS 연계)</button>`;
  }
  _eqpIssSyncAll();
}

// 하단 전체 발행 버튼 상태 동기화 — 남은(미발행) 장비 수 표기
function _eqpIssSyncAll() {
  const btn = document.getElementById('eqp-iss-all-btn');
  if (!btn) return;
  const remain = (_eqpPendingIssue || []).filter(e => !e._issued).length;
  if (remain > 0) {
    btn.disabled = false;
    btn.onclick = eqpIssueConfirm;
    btn.innerHTML = `<i data-lucide="send"></i> 전체 발행 (${remain}대 · FMS 연계)`;
  } else {
    // 전 건 발행 완료 — dead-end 방지: 관제 복귀 버튼으로 전환 (골든 패스 마감)
    btn.disabled = false;
    btn.innerHTML = '발행 완료 — 관제 화면으로 복귀';
    btn.onclick = () => {
      eqpIssueCancel();
      const b = document.getElementById('snav-main');
      if (b) b.click();
    };
  }
  if (window.lucide) lucide.createIcons({ rootElement: btn });
}

function eqpIssueCancel() {
  _eqpPendingIssue = null;
  document.getElementById('eqp-issue-modal').classList.remove('open');
}

async function eqpIssueConfirm() {
  // 개별 발행분은 제외하고 남은 장비만 일괄 발행
  const sel = (_eqpPendingIssue || []).filter(e => !e._issued);
  eqpIssueCancel();
  if (sel.length) await _eqpIssueSend(sel);
}

async function _eqpIssueSend(sel) {
  const targets = sel.map(e => ({
    ...e,
    equip_nm: e.tid || e.nm || e.equip_id,
    score: e.cd_cnt,   // 장비 우선도 근사 — C·D 가입자 수
    // 우측 보드 카드의 세부 Factor·조치 제언 표기 — guides 포맷 재사용
    guides: [
      { name: '세부 Factor', guide_106: eqpFmtDetail(e.detail) || '열위 없음' },
      { name: '조치 제언', guide_106: eqpAdvice(e).join(' / ') },
    ],
  }));
  const res = await fetch(`${BASE_PATH}/api/eqp/workitems`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets, base_dt: _eqpBaseDt }),
  }).then(r => r.json());
  if (res.ok) {
    // alert 대신 화면 안 피드백 — 발행 장비 _issued 마킹 후 러너북 재렌더
    // (해당 스텝 카드가 '발행 완료' 상태로 전환) + 진행 안내 누적.
    const ids = new Set(sel.map(e => e.equip_id));
    (_eqpEquips || []).forEach(e => { if (ids.has(e.equip_id)) e._issued = true; });
    sel.forEach(e => { e._issued = true; });
    document.querySelectorAll('.eqp-row-chk:checked').forEach(chk => {
      const e = _eqpEquips[Number(chk.dataset.j)];
      if (e && ids.has(e.equip_id)) chk.checked = false;
    });
    eqpSumNote(`지시서 ${res.issued}건을 발행했습니다${res.duplicated ? ` (중복 ${res.duplicated}건 제외)` : ''} — FMS 연계·담당 Post 자동 할당 완료. 조치 결과는 진행 보드에서 CEI 효과검증으로 추적됩니다.`);
    eqpStepsRefresh();
    eqpLoadBoard(); eqpLoadStats();
    // 관제 AI 추천 리스트에 발행완료 상태 반영 + 토스트 (④→① 상태 환류)
    if (typeof ctlMarkIssued === 'function') ctlMarkIssued(sel.map(e => e.bld_cd));
    if (typeof aiToast === 'function') aiToast(`지시서 ${res.issued}건 발행 완료 — FMS 연계 · 담당 Post 자동 할당`);
  } else {
    alert(res.error || '발행 실패');
  }
}

// ── 지시서 진행 보드 ──────────────────────────────────────────
// 보기 전환 — 'list'(한 줄 요약, 누적 조회용) / 'card'(자세히). 선택 기억.
let _eqpBoardView = (() => { try { return localStorage.getItem('c1.board.view') || 'list'; } catch (e) { return 'list'; } })();

function eqpBoardSetView(v) {
  _eqpBoardView = v;
  try { localStorage.setItem('c1.board.view', v); } catch (e) {}
  eqpLoadBoard();
}

function _eqpBoardSyncViewTg() {
  document.querySelectorAll('#eqp-board-viewtg .ops-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.view === _eqpBoardView));
}

// 리스트 행 액션 — 카드와 같은 함수 재사용 (결과등록/재진단/중단)
function _eqpBoardRowActions(it) {
  if (it.status === 'issued')
    return `<button class="ops-btn eqp-st-mini" onclick="eqpResolve(${it.id})">결과 등록</button>
      <button class="ops-btn eqp-st-mini ops-btn--ghost" onclick="eqpDrop(${it.id})">중단</button>`;
  if (it.status === 'resolved')
    return `<button class="ops-btn eqp-st-mini ops-btn--primary" onclick="eqpVerify(${it.id})">재진단</button>`;
  return '';
}

async function eqpLoadBoard() {
  const box = document.getElementById('eqp-board');
  _eqpBoardSyncViewTg();
  if (!box.querySelector('.ops-item') && !box.querySelector('.eqp-bl-tbl'))
    box.innerHTML = skelCards(2, '지시서 불러오는 중…');
  const q = _eqpBoardStatus ? `?status=${_eqpBoardStatus}` : '';
  const data = await fetch(`${BASE_PATH}/api/eqp/workitems${q}`).then(r => r.json()).catch(() => ({}));
  const items = data.items || [];
  window._eqpItemNames = Object.fromEntries(items.map(i => [i.id, i.equip_nm || i.equip_id]));
  if (!items.length) {
    box.innerHTML = '<div class="ops-empty">지시서가 없습니다</div>';
    return;
  }
  // ── 리스트 보기 — 한 건 = 한 줄 (누적 건 빠른 조회) ──
  if (_eqpBoardView === 'list') {
    const rows = items.map(it => {
      const st = EQP_STATUS_META[it.status] || { label: it.status, cls: '' };
      const b = it.before_metrics || {}, a = it.after_metrics || {};
      const delta = (b.cei != null && a.cei != null) ? (a.cei - b.cei) : null;
      return `<tr>
        <td><span class="ops-status ${st.cls}">${st.label}</span></td>
        <td class="eqp-st-tid"><span class="eqp-st-tid-tx" title="${_escapeHtml(String(it.equip_nm || it.equip_id))}">${_escapeHtml(String(it.equip_nm || it.equip_id))}</span></td>
        <td class="ops-td-sub">${_escapeHtml(String(it.bld_nm || it.bld_cd || ''))}${it.hns_team ? ' · ' + _escapeHtml(String(it.hns_team)) : ''}</td>
        <td class="ops-td-sub">${(it.issued_at || '—').slice(0, 16)}</td>
        <td>${b.cei != null ? window.ceiBadgeHtml(b.cei) : '<span class="ops-td-sub">—</span>'}</td>
        <td>${delta != null
          ? `${window.ceiBadgeHtml(a.cei)} <b class="${delta > 0 ? 'ops-good' : (delta < 0 ? 'ops-bad' : '')}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</b>`
          : '<span class="ops-td-sub">—</span>'}</td>
        <td class="eqp-bl-actions">${_eqpBoardRowActions(it)}</td>
      </tr>`;
    }).join('');
    box.innerHTML = `<div class="ops-tbl-wrap eqp-bl-wrap"><table class="ops-tbl eqp-bl-tbl">
      <thead><tr><th>상태</th><th>장비</th><th>건물 · 팀</th><th>발행</th><th>발행시 CEI</th><th>재진단</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="ops-td-sub" style="margin-top:6px">세부 Factor·조치 제언·이력은 [자세히 보기]에서 확인합니다.</div>`;
    return;
  }
  box.innerHTML = items.map(it => {
    const st = EQP_STATUS_META[it.status] || { label: it.status, cls: '' };
    const b = it.before_metrics || {}, a = it.after_metrics || {};
    const delta = (b.cei != null && a.cei != null) ? (a.cei - b.cei) : null;
    const guides = (it.guides || []).slice(0, 2)
      .map(g => `<div class="ops-guide">· ${g.name}: ${g.guide_hns?.[0] || g.guide_106}</div>`).join('');
    return `
    <div class="ops-item">
      <div class="ops-item-hd">
        <span class="ops-status ${st.cls}">${st.label}</span>
        <b>${it.equip_nm || it.equip_id}</b>
        <span class="ops-td-sub">${it.bld_nm || it.bld_cd}${it.hns_team ? ' · ' + it.hns_team : ''}</span>
      </div>
      <div class="ops-item-meta">
        발행 ${it.issued_at || '—'}
        ${it.resolved_at ? ` · 조치 ${it.resolved_at}` : ''}
        ${b.cei != null ? ` · 발행시 ${window.ceiBadgeHtml(b.cei)} (${b.strd_dt || ''})` : ''}
        ${delta != null ? ` · 재진단 ${window.ceiBadgeHtml(a.cei)} <b class="${delta > 0 ? 'ops-good' : (delta < 0 ? 'ops-bad' : '')}">(${delta > 0 ? '+' : ''}${delta.toFixed(1)}점 ${delta > 0 ? '개선' : '미개선'})</b>` : ''}
      </div>
      ${guides}
      ${(it.cause_category || it.result_category) ? `<div class="ops-item-cats">
        ${it.cause_category ? `<span class="ops-cat-chip">원인 · ${it.cause_category}</span>` : ''}
        ${it.result_category ? `<span class="ops-cat-chip ops-cat-chip--action">조치 · ${it.result_category}</span>` : ''}
      </div>` : ''}
      ${it.result_note ? `<div class="ops-item-note">상세: ${_escapeHtml(it.result_note)}</div>` : ''}
      <div class="ops-item-actions">
        ${it.status === 'issued' ? `
          <button class="ops-btn" onclick="eqpResolve(${it.id})">결과 등록</button>
          <button class="ops-btn ops-btn--ghost" onclick="eqpDrop(${it.id})">중단</button>` : ''}
        ${it.status === 'resolved' ? `
          <button class="ops-btn ops-btn--primary" onclick="eqpVerify(${it.id})">재진단</button>` : ''}
        <button class="ops-btn ops-btn--ghost" onclick="eqpToggleEvents(${it.id}, this)">이력</button>
      </div>
      <div class="ops-events" id="eqp-events-${it.id}" hidden></div>
    </div>`;
  }).join('');
}

// ── 결과 등록 (모달 — ops 와 동일 카테고리, 전용 DOM) ─────────
let _eqpResolveId = null;
let _eqpCatsLoaded = false;

let _eqpActTree = [];

function eqpAct1Changed() {
  const lv1 = document.getElementById('eqp-resolve-act1').value;
  const sel2 = document.getElementById('eqp-resolve-act2');
  sel2.innerHTML = '';
  const acts = (_eqpActTree.find(t => t.name === lv1) || {}).activities || [];
  if (!acts.length) { sel2.add(new Option('— (해당 없음)', '')); return; }
  acts.forEach(a => sel2.add(new Option(a, a)));
}

async function eqpResolve(id) {
  _eqpResolveId = id;
  if (!_eqpCatsLoaded) {
    const cats = await fetch(`${BASE_PATH}/api/action-categories`).then(r => r.json()).catch(() => null);
    if (cats) {
      const cSel = document.getElementById('eqp-resolve-cause');
      const a1 = document.getElementById('eqp-resolve-act1');
      cSel.innerHTML = ''; a1.innerHTML = '';
      cats.causes.forEach(c => cSel.add(new Option(c, c)));
      _eqpActTree = cats.action_tree || [];
      _eqpActTree.forEach(t => a1.add(new Option(t.name, t.name)));
      eqpAct1Changed();
      _eqpCatsLoaded = true;
    }
  }
  document.getElementById('eqp-resolve-target').textContent =
    (window._eqpItemNames || {})[id] || `지시서 #${id}`;
  document.getElementById('eqp-resolve-note').value = '';
  document.getElementById('eqp-resolve-status').textContent = '';
  document.getElementById('eqp-resolve-modal').classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: document.getElementById('eqp-resolve-modal') });
}

function eqpCloseResolve() {
  document.getElementById('eqp-resolve-modal').classList.remove('open');
  _eqpResolveId = null;
}

async function eqpSubmitResolve() {
  if (_eqpResolveId == null) return;
  const lv1 = document.getElementById('eqp-resolve-act1').value;
  const lv2 = document.getElementById('eqp-resolve-act2').value;
  const body = {
    cause: document.getElementById('eqp-resolve-cause').value,
    action: lv2 ? `${lv1}/${lv2}` : lv1,
    note: document.getElementById('eqp-resolve-note').value.trim(),
  };
  const res = await fetch(`${BASE_PATH}/api/workitems/${_eqpResolveId}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
  if (res.ok) {
    eqpCloseResolve();
    eqpLoadBoard(); eqpLoadStats(); eqpLoadTeamStats();
  } else {
    const st = document.getElementById('eqp-resolve-status');
    st.textContent = res.error || '등록 실패';
    st.className = 'mail-status error';
  }
}

async function eqpVerify(id) {
  const res = await fetch(`${BASE_PATH}/api/eqp/workitems/${id}/verify`, { method: 'POST' })
    .then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  eqpLoadBoard(); eqpLoadStats(); eqpLoadTeamStats();
}

async function eqpDrop(id) {
  const note = prompt('중단 사유');
  if (note == null) return;
  const res = await fetch(`${BASE_PATH}/api/workitems/${id}/drop`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  }).then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  eqpLoadBoard(); eqpLoadStats();
}

async function eqpToggleEvents(id, btn) {
  const box = document.getElementById(`eqp-events-${id}`);
  if (!box.hidden) { box.hidden = true; return; }
  const data = await fetch(`${BASE_PATH}/api/workitems/${id}/events`).then(r => r.json()).catch(() => ({}));
  const evs = data.events || [];
  const KO = { issued: '발행', resolved: '조치완료', verified: '검증완료', dropped: '중단' };
  box.innerHTML = evs.length
    ? evs.map(e => `<div class="ops-event">
        <span class="ops-event-at">${e.at}</span>
        ${e.from_status ? `${KO[e.from_status] || e.from_status} → ` : ''}<b>${KO[e.to_status] || e.to_status}</b>
        ${e.note ? `<span class="ops-td-sub"> · ${_escapeHtml(e.note)}</span>` : ''}
      </div>`).join('')
    : '<div class="ops-td-sub">이력이 없습니다</div>';
  box.hidden = false;
}

// ── KPI 4타일 — 지시서발행 / 조치완료 / 개선 / 미개선 ─────────
async function eqpLoadStats() {
  const s = await fetch(`${BASE_PATH}/api/eqp/work-stats`).then(r => r.json()).catch(() => null);
  if (!s) return;
  document.getElementById('eqs-issued').textContent = s.issued_total ?? 0;
  document.getElementById('eqs-resolved').textContent = s.resolved ?? 0;
  document.getElementById('eqs-improved').textContent = s.improved ?? 0;
  document.getElementById('eqs-notimp').textContent = s.not_improved ?? 0;
}

// ── 조직별 실적 (SKB/HNS 토글) ───────────────────────────────
async function eqpLoadTeamStats() {
  const data = await fetch(`${BASE_PATH}/api/eqp/work-stats-by-team?org=${_eqpOrg}`)
    .then(r => r.json()).catch(() => null);
  const body = document.getElementById('eqp-team-stats');
  if (!data || !(data.teams || []).length) {
    body.innerHTML = '<tr><td colspan="5" class="ops-empty">지시서 실적이 쌓이면 표시됩니다</td></tr>';
    return;
  }
  body.innerHTML = data.teams.map(t => {
    const cei = (t.avg_cei_before != null && t.avg_cei_after != null)
      ? `${t.avg_cei_before} → ${t.avg_cei_after}
         <b class="${t.avg_cei_delta > 0 ? 'ops-good' : (t.avg_cei_delta < 0 ? 'ops-bad' : '')}">(${t.avg_cei_delta > 0 ? '+' : ''}${t.avg_cei_delta}점)</b>`
      : '—';
    return `
    <tr>
      <td><b>${t.team}</b></td>
      <td>${t.total}</td>
      <td>${t.resolved + t.verified}</td>
      <td>${t.improved}건</td>
      <td>${cei}</td>
    </tr>`;
  }).join('');
}

// ── 새벽 자율복구 상세 레포트 (0819 3차 R3) — 홈·장비 탭 공용 ──
// 수행 시각 — 장비 ID 기반 결정적 (야간 배치 02~03시대, 시연 목업)
function arRunTime(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `0${2 + (h % 2)}:${String(h % 60).padStart(2, '0')}`;
}

// 최근 30일 Auto-reset 이력 — /api/ar-hist?days=30 (일별 성공/실패 적층 바 +
// 합계 KPI). 새벽 레포트 모달 하단 섹션 (항목 5).
function arHist30Html(h) {
  const days = (h && h.ready && h.daily) || [];
  if (!days.length) return '';
  const w = 10, gap = 3, ht = 54;
  const max = Math.max(1, ...days.map(d => d.ok + d.fail));
  const bars = days.map((d, i) => {
    const tried = d.ok + d.fail;
    const bh = tried ? Math.max(3, (tried / max) * (ht - 6)) : 2;
    const okh = tried ? bh * (d.ok / tried) : 0;
    const x = i * (w + gap);
    const rate = tried ? Math.round((d.ok / tried) * 1000) / 10 : null;
    const lbl = `${d.dt.slice(4, 6)}/${d.dt.slice(6, 8)} · 시도 ${tried.toLocaleString('ko-KR')}` +
      ` · 성공 ${d.ok.toLocaleString('ko-KR')}${rate != null ? ` (${rate}%)` : ''}` +
      ` · 실패 ${d.fail.toLocaleString('ko-KR')} · 미실행 ${(d.skip || 0).toLocaleString('ko-KR')}`;
    return `<g><title>${lbl}</title>
      <rect class="arh-ok" x="${x}" y="${(ht - okh).toFixed(1)}" width="${w}" height="${okh.toFixed(1)}"/>
      <rect class="arh-fail" x="${x}" y="${(ht - bh).toFixed(1)}" width="${w}" height="${(bh - okh).toFixed(1)}"/></g>`;
  }).join('');
  const tw = days.length * (w + gap) - gap;
  const fmt = s => `${s.slice(4, 6)}/${s.slice(6, 8)}`;
  const tried30 = (h.ok || 0) + (h.fail || 0);
  return `
    <div class="eqp-ins-sec-hd arh-hd">최근 30일 이력
      <span class="ops-td-sub">${fmt(days[0].dt)} ~ ${fmt(days[days.length - 1].dt)} · 배치 ${h.batch_days || days.length}일 · 일별 성공/실패</span></div>
    <div class="arh-row">
      <svg class="arh-bars" viewBox="0 0 ${tw} ${ht}" preserveAspectRatio="none" role="img"
        aria-label="최근 30일 일별 Auto-reset 성공·실패 건수">${bars}</svg>
      <div class="arh-kpis">
        <span>30일 총 시도 <b>${tried30.toLocaleString('ko-KR')}회</b></span>
        <span>성공률 <b class="${(h.rate || 0) >= 90 ? 'ops-good' : ''}">${h.rate != null ? h.rate + '%' : '—'}</b></span>
        <span class="ops-td-sub">성공 ${(h.ok || 0).toLocaleString('ko-KR')} · 실패 ${(h.fail || 0).toLocaleString('ko-KR')} · 미실행 ${(h.skip || 0).toLocaleString('ko-KR')}</span>
      </div>
    </div>`;
}

async function arReportOpen() {
  const modal = document.getElementById('ar-report-modal');
  const body = document.getElementById('ar-report-body');
  const meta = document.getElementById('ar-report-meta');
  body.innerHTML = _ldgBlock('자율복구 수행 내역 불러오는 중…');
  modal.classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: modal });
  const [d, h30] = await Promise.all([
    fetch(`${BASE_PATH}/api/eqp/ar-detail`).then(r => r.json()).catch(() => null),
    fetch(`${BASE_PATH}/api/ar-hist?days=30`).then(r => r.json()).catch(() => null),
  ]);
  const hist30 = arHist30Html(h30);
  if (!d || !d.ready) {
    body.innerHTML = '<div class="ops-empty">수행 내역을 불러오지 못했습니다</div>' + hist30;
    return;
  }
  const items = d.items || [];
  if (meta) meta.textContent = `— 기준일 ${eqpDateISO(String(d.base_dt || ''))}`;
  if (!items.length) {
    body.innerHTML = '<div class="ops-empty">지난밤 자율복구 수행 내역이 없습니다</div>' + hist30;
    return;
  }
  const rows = items.map(it => {
    const dlt = Math.round((it.cei - it.prev_cei) * 10) / 10;
    return `
    <tr class="${it.ok ? '' : 'ar-rep-row--fail'}">
      <td>${it.ok
        ? '<span class="eqp-grade eqp-grade--good">복구</span>'
        : '<span class="eqp-grade eqp-grade--bad">미복구</span>'}</td>
      <td class="ops-td-bld"><b>${it.tid || it.nm || it.equip_id}</b>
        <span class="ops-td-sub">${it.bld_nm}${it.hns_team ? ' · ' + it.hns_team : ''}</span></td>
      <td>${arRunTime(it.equip_id)}</td>
      <td>${it.ok ? '포트 리셋(원격)' : '리셋 시도 — 미복구'}</td>
      <td><span class="ops-td-sub">${it.prev_cei}</span> → <b class="${it.ok ? 'ops-good' : 'ops-bad'}">${it.cei}</b>
        ${dlt ? `<span class="${dlt > 0 ? 'ops-good' : 'ops-bad'}">(${dlt > 0 ? '+' : ''}${dlt})</span>` : ''}</td>
      <td class="${it.cd_cnt ? 'ops-bad' : ''}">${it.prev_cd} → ${it.cd_cnt}명</td>
      <td>${it.ok
        ? '<span class="ops-td-sub">CEI 효과검증 추적</span>'
        : `<button class="ops-btn" onclick="arReportGo('${it.bld_cd}', '${String(it.bld_nm || '').replace(/['"\\]/g, '')}')">발행 검토 →</button>`}</td>
    </tr>`;
  }).join('');
  body.innerHTML = `
    <div class="ar-rep-sum">
      지난밤 Auto-reset <b>${(d.total ?? 0).toLocaleString('ko-KR')}대</b> 시도 ·
      <b class="ops-good">복귀 ${(d.ok ?? 0).toLocaleString('ko-KR')}</b> ·
      <b class="ops-bad">미복구 ${(d.fail ?? 0).toLocaleString('ko-KR')}</b>.
      미복구는 지시서(Ticket) 발행 대상입니다.
    </div>
    ${hist30}
    <div class="ops-tbl-wrap ar-rep-wrap">
      <table class="ops-tbl">
        <thead><tr>
          <th>결과</th><th>장비 (TID)</th><th>수행 시각</th><th>조치</th>
          <th>CEI 전 → 후</th><th>C·D 전 → 후</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function arReportClose() {
  document.getElementById('ar-report-modal').classList.remove('open');
}

// 건물 단위(장비 미등재) 건물 — 관제 지도에서 이어서 보기
function eqpGoControl(bldCd) {
  const btn = document.getElementById('snav-main');
  if (btn) btn.click();
  setTimeout(() => {
    if (typeof selectBuildingOnMap === 'function') selectBuildingOnMap(String(bldCd));
  }, 400);
}

// 미복구 행 [진단 →] — 레포트를 닫고 장비 탭 해당 건물 자동 진단으로
function arReportGo(bldCd, bldNm) {
  arReportClose();
  const btn = document.getElementById('snav-eq-ops');
  if (btn) btn.click();
  eqpEnterFromControl({ bld_cd: String(bldCd), bld_nm: bldNm || '', primary: 'equip', src: 'ar' });
}

// ============================================================
// 장비 행 TMI 툴팁 — 러너북 스텝 표(STEP 2/3/4) hover (0820)
// 150ms 지연 표시 · 행 기준 고정 위치 · 뷰포트 가장자리 상하 플립
// 주간 추이는 /api/eqp/equip-history lazy fetch (장비당 1회 캐시)
// ============================================================
const _eqpTtHist = {};        // equip_id → history items 캐시
let _eqpTtTimer = null;       // 150ms 표시 지연 타이머
let _eqpTtRowEl = null;       // 현재 hover 중인 행
let _eqpTtEq = null;          // 현재 표시 중인 장비 (비동기 갱신 가드)
let _eqpTtBox = null;         // 싱글턴 툴팁 요소

function _eqpTtEl() {
  if (!_eqpTtBox) {
    _eqpTtBox = document.createElement('div');
    _eqpTtBox.className = 'eqp-tt';
    _eqpTtBox.hidden = true;
    document.body.appendChild(_eqpTtBox);
  }
  return _eqpTtBox;
}

function eqpTtHide() {
  clearTimeout(_eqpTtTimer);
  _eqpTtRowEl = null;
  _eqpTtEq = null;
  if (_eqpTtBox) _eqpTtBox.hidden = true;
}

document.addEventListener('mouseover', ev => {
  const row = ev.target.closest ? ev.target.closest('.eqp-tt-row') : null;
  if (row === _eqpTtRowEl) return;
  clearTimeout(_eqpTtTimer);
  if (!row) { eqpTtHide(); return; }
  _eqpTtRowEl = row;
  const e = _eqpEquips[Number(row.dataset.j)];
  if (!e) return;
  // 스치기만 하면 뜨지 않게 150ms 지연
  _eqpTtTimer = setTimeout(() => {
    if (_eqpTtRowEl === row) eqpTtShow(row, e);
  }, 150);
});
// 스크롤 시 위치가 어긋나므로 즉시 숨김 (캡처 단계 — 내부 스크롤 포함)
document.addEventListener('scroll', () => { if (_eqpTtEq) eqpTtHide(); }, true);

function eqpTtShow(row, e) {
  const box = _eqpTtEl();
  _eqpTtEq = e;
  box.innerHTML = eqpTtHtml(e);
  box.hidden = false;
  _eqpTtPlace(row);
  eqpTtWeek(e, row);
}

// 행 기준 고정 배치 — 기본은 행 아래, 하단 잘리면 위로 플립, 좌우 클램프
function _eqpTtPlace(row) {
  const box = _eqpTtEl();
  if (box.hidden || !row.isConnected) return;
  const r = row.getBoundingClientRect();
  const bw = box.offsetWidth, bh = box.offsetHeight;
  const left = Math.min(Math.max(r.left + 24, 8), window.innerWidth - bw - 8);
  let top = r.bottom + 8;
  if (top + bh > window.innerHeight - 8) top = r.top - bh - 8;   // 상하 플립
  if (top < 8) top = 8;
  box.style.left = `${Math.max(left, 8)}px`;
  box.style.top = `${top}px`;
}

function eqpTtHtml(e) {
  const prev = e.cei_prev ?? e.cei_d1;
  const dlt = (e.cei != null && prev != null) ? Math.round((e.cei - prev) * 10) / 10 : null;
  const dltHtml = dlt == null ? ''
    : dlt === 0 ? ' <span class="ops-td-sub">전일과 동일</span>'
    : ` <span class="${dlt > 0 ? 'ops-good' : 'ops-bad'}">전일比 ${dlt > 0 ? '▲' : '▼'}${Math.abs(dlt)}</span>`;
  const d = e.detail || {};
  const fct = (e.factors || []).length
    ? e.factors.map(f => `<span class="ops-factor-badge ops-factor-badge--bad">${f}</span>`).join('')
    : '<span class="ops-td-sub">열위 없음</span>';
  return `
    <div class="eqp-tt-hd"><span class="eqp-tt-tid">${e.tid || e.equip_id}</span></div>
    <div class="eqp-tt-sub">${[e.nm, e.level, e.bld_nm,
      e.hns_team ? `${e.hns_team}${e.hns_post ? '/' + e.hns_post : ''}` : '']
      .filter(Boolean).join(' · ')}</div>
    <div class="eqp-tt-line"><span>CEI</span>
      <div>${window.ceiBadgeHtml(e.cei)}${prev != null ? ` · 전일 ${window.ceiBadgeHtml(prev)}` : ''}${dltHtml}</div></div>
    <div class="eqp-tt-line"><span>가입자</span>
      <div>${(e.svc_cnt ?? 0).toLocaleString('ko-KR')}명 · C·D <b class="${e.cd_cnt ? 'ops-bad' : ''}">${e.cd_cnt ?? 0}명</b>
        · VoC ${e.voc ?? 0}건${e.voc_30d ? ` <span class="ops-td-sub">(30일 ${e.voc_30d}건)</span>` : ''}</div></div>
    <div class="eqp-tt-line"><span>물리 지표</span>
      <div>BIP ${d.bip_error ? eqpFmtCnt(d.bip_error) : '—'} · 광레벨 ${d.onu_power ? d.onu_power + 'dBm' : '—'} · CRC ${d.crc ? eqpFmtCnt(d.crc) : '—'}</div></div>
    <div class="eqp-tt-line"><span>열위 factor</span>
      <div>${fct}${e.equip_rk ? ` <span class="ops-td-sub">· 관리 우선순위 ${e.equip_rk}위</span>` : ''}</div></div>
    <div class="eqp-tt-line"><span>주간 추이</span>
      <div id="eqp-tt-week" class="ops-td-sub">추이 불러오는 중…</div></div>`;
}

// ============================================================
// 장비별 정보 패널 (우측, 0820 대개편) — 러너북 장비 행 클릭 시
// /api/eqp/equip-insight (INF 가입자 마스터 조인) 렌더.
//   요약 지표(수치 직노출) · 토폴로지 플로우(정보센터→OLT→ONU→단말)
//   · 최근 7일 추이(CEI 라인 + 물리 지표 일별 표) · 80점 이하 고객
// ============================================================
let _eqpInsSelId = null;   // 선택 장비 equip_id (러너북 행 하이라이트)
let _eqpInsSeq = 0;        // 비동기 응답 경합 가드

function eqpInsightReset(msg) {
  _eqpInsSelId = null;
  _eqpInsSeq++;
  const meta = document.getElementById('eqp-ins-meta');
  if (meta) meta.textContent = '';
  const body = document.getElementById('eqp-ins-body');
  if (body) body.innerHTML =
    `<div class="ops-empty">${msg || '러너북에서 장비를 선택하면<br>상세가 표시됩니다'}</div>`;
}

function eqpInsDt(s) { return s ? `${String(s).slice(4, 6)}/${String(s).slice(6, 8)}` : '—'; }

// 고객번호 마스킹 — 원천이 이미 마스킹돼 있으면 그대로
function eqpMaskCust(c) {
  const s = String(c ?? '');
  if (!s || s.includes('*')) return s || '—';
  return s.length <= 3 ? s.slice(0, 1) + '**' : s.slice(0, 3) + '****';
}

// 최근 7일 CEI 미니 라인 (외부 라이브러리 없음 — t30InsLine 패턴)
// 전폭 스트레치(preserveAspectRatio none) + 점 x좌표를 아래 일별 표의
// 날짜 열 중심에 매핑 → 날짜축이 차트 바로 아래 정렬된다.
// 가독성(0820): SVG는 비율 스트레치라 텍스트를 넣으면 글자가 왜곡됨 →
// 값·y눈금 라벨은 HTML 오버레이(%. 좌표), x축 날짜는 등폭 그리드 행으로 렌더.
function eqpInsCeiLine(daily) {
  const n = (daily || []).length;
  const pts = (daily || []).map((d, k) => ({ k, dt: d.dt, cei: d.cei }))
    .filter(p => p.cei != null);
  if (pts.length < 2) return '<span class="ops-td-sub">추이 데이터 없음</span>';
  const W = 700, H = 120, PT = 18, PB = 10;   // 상단 여백 = 포인트 값 라벨 자리
  const vals = pts.map(p => p.cei);
  const min = Math.min(...vals), max = Math.max(...vals), span = Math.max(max - min, 0.1);
  const x = k => (k + 0.5) * (W / n);
  const y = v => PT + (1 - (v - min) / span) * (H - PT - PB);
  const xPct = k => ((k + 0.5) / n * 100).toFixed(2);
  const yPct = v => (y(v) / H * 100).toFixed(2);
  const fmtV = v => String(Math.round(v * 10) / 10);
  // y 눈금 — max·mid·min (라운딩 후 중복 제거)
  const ticks = [...new Set([max, (max + min) / 2, min].map(fmtV))].map(Number);
  const grid = ticks.map(t =>
    `<line x1="0" y1="${y(t).toFixed(1)}" x2="${W}" y2="${y(t).toFixed(1)}"
       class="eqp-ins-grid" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('');
  const ylbls = ticks.map(t =>
    `<span class="eqp-ins-ylbl" style="top:${yPct(t)}%">${fmtV(t)}</span>`).join('');
  // 선분·점·값 라벨 = 그 날짜 CEI 등급색 (공용 ceiGradeOf — 스파크바·마커와 동일 컷)
  const gOf = p => ((window.ceiGradeOf && window.ceiGradeOf(p.cei)) || 'D').toLowerCase();
  const segs = pts.slice(1).map((p, i) => {
    const a = pts[i];
    return `<line x1="${x(a.k).toFixed(1)}" y1="${y(a.cei).toFixed(1)}"
       x2="${x(p.k).toFixed(1)}" y2="${y(p.cei).toFixed(1)}"
       class="eqp-ins-path eqp-ins-g-${gOf(p)}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const dots = pts.map((p, i) =>
    `<circle cx="${x(p.k).toFixed(1)}" cy="${y(p.cei).toFixed(1)}" r="3"
       class="${i === pts.length - 1 ? 'eqp-ins-dot--last' : 'eqp-ins-dot'} eqp-ins-g-${gOf(p)}">
       <title>${eqpInsDt(p.dt)} · CEI ${p.cei} (${gOf(p).toUpperCase()})</title></circle>`).join('');
  const vlbls = pts.map((p, i) =>
    `<span class="eqp-ins-vlbl${i === pts.length - 1 ? ' eqp-ins-vlbl--last' : ''} eqp-ins-g-${gOf(p)}"
       style="left:${xPct(p.k)}%;top:${yPct(p.cei)}%">${fmtV(p.cei)}</span>`).join('');
  const xlbls = (daily || []).map(dd => `<span>${eqpInsDt(dd.dt)}</span>`).join('');
  return `<div class="eqp-ins-trend">
    <div class="eqp-ins-chart">
      <svg class="eqp-ins-line" viewBox="0 0 ${W} ${H}"
        preserveAspectRatio="none" role="img"
        aria-label="최근 7일 CEI 추이 ${vals[0]} → ${vals[vals.length - 1]}">
        ${grid}
        <line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" class="eqp-ins-grid" vector-effect="non-scaling-stroke"/>
        ${segs}${dots}
      </svg>
      ${ylbls}${vlbls}
    </div>
    <div class="eqp-ins-xlbls" style="grid-template-columns:repeat(${n},1fr)">${xlbls}</div>
  </div>`;
}

// 토폴로지 플로우 노드 — 이름 목록은 2개까지 + "+n" (전체는 title)
// cur=true: 현재 조회 중인 장비가 속한 노드 — 테두리 강조 + "현재 장비" 라벨.
// curNm: 목록 안에서 현재 장비 이름(TID)을 별도 강조.
function eqpInsTopoNode(cls, kicker, cnt, lines, titleAll, cur, curNm) {
  const shown = lines.slice(0, 2).map(t =>
    `<span class="eqp-topo-nm${curNm && t === curNm ? ' eqp-topo-nm--cur' : ''}" title="${_escapeHtml(t)}">${_escapeHtml(t)}</span>`).join('');
  const more = lines.length > 2 ? `<span class="ops-td-sub" title="${_escapeHtml(lines.slice(2).join('\n'))}">+${lines.length - 2}</span>` : '';
  return `<div class="eqp-topo-node ${cls}${cur ? ' eqp-topo-node--cur' : ''}" title="${_escapeHtml(titleAll || lines.join('\n'))}">
    <span class="eqp-topo-k">${kicker}${cnt != null ? ` <b>${cnt}</b>` : ''}${cur ? ' <span class="eqp-topo-curlbl">현재 장비</span>' : ''}</span>
    ${shown || '<span class="ops-td-sub">—</span>'}${more}
  </div>`;
}

// 한 줄 종합 판독문 — 규칙 기반 자동 생성 (요약 지표 + 진단 factor 재사용).
// 예: "CEI 77.3(D) — 80점 이하 5명, CRC 10건 발생. 선로 구간 점검 권장."
function eqpInsVerdict(s, rowE) {
  const g = (window.ceiGradeOf && window.ceiGradeOf(s.cei_avg)) || '';
  const issues = [];
  if (s.bad_cnt) issues.push(`80점 이하 ${s.bad_cnt}명`);
  if (s.crc) issues.push(`CRC ${eqpFmtCnt(s.crc)}건`);
  if (s.loss) issues.push(`Loss ${s.loss}건`);
  if (s.flap) issues.push(`Flap ${s.flap}회`);
  if (s.bip) issues.push(`BIP ${eqpFmtCnt(s.bip)} 누적`);
  if (s.voc) issues.push(`VoC ${s.voc}건`);
  const fs = rowE.factors || [];
  let advice;
  if (fs.includes('광레벨')) advice = '광 커넥터·선로 점검 권장.';
  else if (fs.includes('CRC') || s.crc) advice = '선로 구간 점검 권장.';
  else if (fs.includes('BIP') || s.bip) advice = '광선로(OJC) 구간 점검 권장.';
  else if (s.bad_cnt || s.loss || s.flap) advice = 'Auto-reset(원격 리셋) 우선 시도 권장.';
  else advice = '조치 불필요.';
  const bad = issues.length > 0;
  const ceiTxt = s.cei_avg != null ? `CEI ${s.cei_avg}${g ? `(${g})` : ''}` : 'CEI 미측정';
  const head = bad ? `${issues.slice(0, 3).join(', ')} 발생.` : '전 지표 정상 범위.';
  return `<div class="eqp-ins-verdict ${bad ? 'eqp-ins-verdict--bad' : 'eqp-ins-verdict--good'}"
    title="자동 판독 — 기준일 요약 지표·열위 factor 기반 (규칙 판정)">
    <b>${ceiTxt}</b> — ${head} ${advice}</div>`;
}

async function eqpInsightSelect(j) {
  const e = _eqpEquips[j];
  if (!e) return;
  eqpTtHide();   // 행 클릭과 동시에 떠 있는 TMI 툴팁 정리
  _eqpInsSelId = e.equip_id;
  // 러너북 표 하이라이트 — 전체 재렌더 없이 클래스만 갱신
  document.querySelectorAll('#eqp-steps .eqp-tt-row').forEach(r => {
    const re = _eqpEquips[Number(r.dataset.j)];
    r.classList.toggle('is-selected', !!re && re.equip_id === _eqpInsSelId);
  });
  const body = document.getElementById('eqp-ins-body');
  const meta = document.getElementById('eqp-ins-meta');
  if (!body) return;
  body.innerHTML = _ldgBlock('가입자 마스터에서 장비 정보 수집 중…');
  const seq = ++_eqpInsSeq;
  try {
    const d = await fetch(`${BASE_PATH}/api/eqp/equip-insight?equip_id=${encodeURIComponent(e.equip_id)}&bld_cd=${encodeURIComponent(e.bld_cd || '')}&base_dt=${_eqpBaseDt}&tid=${encodeURIComponent(e.tid || '')}`)
      .then(r => r.json());
    if (seq !== _eqpInsSeq) return;   // 다른 행을 이미 클릭함
    if (!d || !d.found) {
      if (meta) meta.textContent = '';
      // 백엔드가 미매핑 사유(reason)를 주면 그대로 안내 (식별 체계 불일치 /
      // INF 추출 범위 밖 등) — 없으면 기존 일반 문구 유지
      const why = (d && d.reason) ? _escapeHtml(d.reason) : '이 장비는 가입자 마스터에 매핑이 없습니다';
      // 미매핑이어도 AI 진단(행 지표 기반)은 표시 — 진단 공백(dead-end) 방지
      body.innerHTML = `<div class="ops-empty">${e.tid || e.equip_id} —<br>${why}</div>` + eqpAiBlockHtml(e);
      return;
    }
    if (meta) meta.textContent = `기준일 ${eqpDateISO(String(d.base_dt || '')) || '—'}`;
    body.innerHTML = eqpInsightHtml(d, e);
  } catch (err) {
    if (seq !== _eqpInsSeq) return;
    body.innerHTML = '<div class="ops-empty">장비 정보 조회 실패 — 네트워크 확인</div>';
  }
}

// 장비별 정보 패널 캡쳐 → 메일 (헤더 ✉의 부분 캡쳐 버전 — dashboard.js 공용 흐름)
function eqpInsMail() {
  const panel = document.getElementById('eqp-insight');
  if (!panel) return;
  const e = (_eqpEquips || []).find(x => x.equip_id === _eqpInsSelId);
  const tid = e ? (e.tid || e.nm || e.equip_id) : '';
  const dt = eqpDateISO(String(_eqpBaseDt || '')) || '';
  openMailModalFor(panel, `[C-One] 장비 진단${tid ? ' — ' + tid : ''}${dt ? ` (기준일 ${dt})` : ''}`);
}

function eqpInsightHtml(d, rowE) {
  const eq = d.equip || {};
  const s = d.summary || {};
  const daily = d.daily || [];
  const topo = d.topology || {};
  const fmtN = v => (v == null ? '—' : Number(v).toLocaleString('ko-KR'));

  // ① 헤더 — TID(mono) + 레벨·서비스·건물
  const head = `
    <div class="eqp-ins-hd">
      <span class="eqp-ins-tid">${_escapeHtml(eq.tid || rowE.tid || rowE.equip_id)}</span>
      <span class="eqp-ins-badges">
        ${eq.level ? `<span class="ops-factor-badge">${_escapeHtml(eq.level)}</span>` : ''}
        ${eq.svc_tech ? `<span class="ops-factor-badge">${_escapeHtml(eq.svc_tech)}</span>` : ''}
      </span>
      <span class="ops-td-sub">${_escapeHtml(eq.bld_nm || rowE.bld_nm || '')}</span>
    </div>`;

  // ② 요약 지표 — 수치 직접 노출 (hover 불필요) + 판정 보조 툴팁(title)
  const power = s.ont_power ?? s.f3;
  const powerBad = (rowE.factors || []).includes('광레벨')
    || (power != null && power !== 0 && power < -26);
  const tiles = [
    ['CEI', window.ceiBadgeHtml(s.cei_avg), '',
      '가입자 평균 고객체감품질지수 — 80 이하이면 C·D(열위) 구간, 개선 대상'],
    ['가입자', `${fmtN(s.svc)}명`, '', '이 장비에 물린 가입자 수'],
    ['80점 이하', `${fmtN(s.bad_cnt)}명`, s.bad_cnt ? 'ops-bad' : '',
      'CEI 80점 이하(C·D) 가입자 수 — 0명이 정상, 발생 시 개선 대상'],
    ['Loss', fmtN(s.loss), s.loss ? 'ops-bad' : '',
      '패킷 손실 발생 건수 — 0이 정상, 증가 시 구간 혼잡·선로 열화 의심'],
    ['VoC', fmtN(s.voc), s.voc ? 'ops-bad' : '',
      '고객 불만 접수 건수 — 발생 시 체감 품질 이상 신호'],
    ['RTT', s.rtt != null ? `${s.rtt}ms` : '—', '',
      '평균 왕복 지연(ms) — 낮을수록 양호'],
    ['광파워', power != null ? `${power}dBm` : '—', powerBad ? 'ops-bad' : '',
      'ONT 광 수신 레벨(dBm) — -26dBm 미만이면 광선로·커넥터 점검 필요'],
    ['CRC', s.crc != null ? eqpFmtCnt(s.crc) : '—', s.crc ? 'ops-bad' : '',
      '회선 오류 카운트 — 0이 정상, 증가 시 선로/커넥터 불량 의심'],
    ['Flap', fmtN(s.flap), s.flap ? 'ops-bad' : '',
      '링크 단절·재접속 반복 횟수 — 0이 정상, 증가 시 접촉 불량·포트 이상 의심'],
    ['BIP', s.bip != null ? eqpFmtCnt(s.bip) : '—', s.bip ? 'ops-bad' : '',
      '광구간 비트 오류 누적 — 0이 정상, 증가 시 광선로(OJC) 구간 점검'],
  ];
  const sum = `<div class="eqp-ins-sum">${tiles.map(([k, v, cls, tip]) => `
    <div class="eqp-ins-tile" title="${_escapeHtml(tip || '')}"><span class="eqp-ins-tile-k">${k}</span><b class="${cls}">${v}</b></div>`).join('')}</div>`;

  // ③ 토폴로지 그림 — 정보센터 → OLT → ONU → 단말.
  // 현재 조회 중인 장비 노드(L2=ONU, L3=OLT)를 하이라이트하고,
  // 현재 장비 TID 는 목록 맨 앞으로 올려 항상 보이게 한다.
  const curLevel = String(eq.level || rowE.level || '').toUpperCase();
  const curIsOnu = curLevel === 'L2';
  const curTid = String(eq.tid || rowE.tid || '');
  const lift = arr => (curTid && arr.includes(curTid))
    ? [curTid, ...arr.filter(t => t !== curTid)] : arr;
  const oltList = curIsOnu ? (topo.olt || []) : lift(topo.olt || []);
  const onuList = curIsOnu ? lift(topo.onu || []) : (topo.onu || []);
  const terms = (topo.terms || []).map(t => `${t.model} ×${t.cnt}`);
  const arrow = '<span class="eqp-topo-arr" aria-hidden="true">→</span>';
  const topoHtml = `
    <div class="eqp-ins-sec-hd">토폴로지</div>
    <div class="eqp-topo">
      ${eqpInsTopoNode('eqp-topo--center', '정보센터', null, topo.center ? [topo.center] : [])}
      ${arrow}${eqpInsTopoNode('eqp-topo--olt', 'OLT', oltList.length, oltList, null, !curIsOnu, !curIsOnu ? curTid : '')}
      ${arrow}${eqpInsTopoNode('eqp-topo--onu', 'ONU', onuList.length, onuList, null, curIsOnu, curIsOnu ? curTid : '')}
      ${arrow}${eqpInsTopoNode('eqp-topo--term', '단말',
        /* term_cnt = MAC 유니크 단말 총 대수 (챗봇 리포트와 동일 집계) — 없으면 모델별 합산 폴백 */
        topo.term_cnt != null ? topo.term_cnt : (topo.terms || []).reduce((a, t) => a + (t.cnt || 0), 0), terms)}
    </div>`;

  // ④ 최근 7일 추이 — CEI 라인 + 물리 지표 일별 표 (0은 0으로 표기)
  // 지표 행 라벨에 의미 툴팁 (KPI 타일과 동일 문구)
  const METRICS = [
    ['80점 이하', 'bad_cnt', null, 'CEI 80점 이하(C·D) 가입자 수 — 0명이 정상'],
    ['Loss', 'loss', null, '패킷 손실 발생 건수 — 0이 정상, 증가 시 구간 혼잡·선로 열화 의심'],
    ['CRC', 'crc', eqpFmtCnt, '회선 오류 카운트 — 0이 정상, 증가 시 선로/커넥터 불량 의심'],
    ['Flap', 'flap', null, '링크 단절·재접속 반복 횟수 — 0이 정상, 증가 시 접촉 불량·포트 이상 의심'],
    ['BIP', 'bip', eqpFmtCnt, '광구간 비트 오류 누적 — 0이 정상, 증가 시 광선로(OJC) 구간 점검'],
  ];
  const dRows = METRICS.map(([lbl, key, fmt, tip]) => `
    <tr><th title="${_escapeHtml(tip || '')}">${lbl}</th>${daily.map(dd => {
      const v = dd[key];
      return `<td class="${v ? 'eqp-ins-hot' : ''}">${v == null ? '—' : (fmt ? fmt(v) : v)}</td>`;
    }).join('')}</tr>`).join('');
  const dailyHtml = daily.length ? `
    <div class="eqp-ins-sec-hd">최근 7일 추이</div>
    ${eqpInsCeiLine(daily)}
    <div class="eqp-ins-dwrap eqp-ins-7d-wrap"><table class="eqp-ins-dtbl eqp-ins-7d">
      <thead><tr><th></th>${daily.map(dd => `<th>${eqpInsDt(dd.dt)}</th>`).join('')}</tr></thead>
      <tbody>${dRows}</tbody>
    </table></div>` : '';

  // ⑤ 80점 이하 고객 (마스킹)
  const bads = d.bad_custs || [];
  const badHtml = `
    <div class="eqp-ins-sec-hd">80점 이하 고객 ${bads.length ? `<b class="ops-bad">${bads.length}</b>` : ''}</div>
    ${bads.length ? `
    <div class="eqp-ins-dwrap"><table class="eqp-ins-dtbl eqp-ins-btbl">
      <thead><tr><th>세대</th><th>고객</th><th>CEI</th><th>Loss</th><th>CRC</th><th>BIP</th><th>광레벨</th></tr></thead>
      <tbody>${bads.map(b => `
        <tr>
          <td>${_escapeHtml(String(b.unit ?? '—'))}</td>
          <td class="eqp-st-tid">${_escapeHtml(eqpMaskCust(b.cust))}</td>
          <td>${window.ceiBadgeHtml(b.cei)}</td>
          <td class="${b.loss ? 'eqp-ins-hot' : ''}">${b.loss ?? '—'}</td>
          <td class="${b.crc ? 'eqp-ins-hot' : ''}">${b.crc != null ? eqpFmtCnt(b.crc) : '—'}</td>
          <td class="${b.bip ? 'eqp-ins-hot' : ''}">${b.bip != null ? eqpFmtCnt(b.bip) : '—'}</td>
          <td>${b.ont_power != null ? b.ont_power + 'dBm' : '—'}</td>
        </tr>`).join('')}</tbody>
    </table></div>`
    : '<div class="ops-td-sub">80점 이하(C·D) 고객이 없습니다 — 전 가입자 정상 범위</div>'}`;

  // 상단 한 줄 종합 판독문 (규칙 기반 — 항목 4)
  return head + eqpInsVerdict(s, rowE) + eqpAiBlockHtml(rowE) + sum + topoHtml + dailyHtml + badHtml;
}

// AI 진단 블록 — 이상 스코어 게이지 + 팩터 기여도(SHAP) + 조치 권고.
// 스코어·기여도·권고가 전부 같은 원천 지표(행 데이터)에서 계산되므로
// 판독문·러너북 분류와 모순 없음. 가입자 미매핑 장비에서도 표시 가능.
function eqpAiBlockHtml(rowE) {
  const aiScore = aiAnomalyScore(rowE);
  const needsAction = aiScore >= AI_T.scoreWarn || (rowE.factors || []).length || (rowE.cd_cnt || 0) > 0;
  return `
    <div class="eqp-ins-sec-hd">AI 진단</div>
    <div class="eqp-ins-ai">
      ${aiGaugeHtml(aiScore, '이상 스코어')}
      ${needsAction ? factorContribHtml(aiFactorContrib(rowE), { title: '팩터 기여도' }) : ''}
      <div class="eqp-ins-ai-rec">
        ${needsAction
          ? `권고: <b>${aiActionLabel(rowE)}</b> ${modelBadgeHtml('action', `신뢰도 ${aiActionConfidence(rowE)}%`)}`
          : '전 지표 정상 범위 — 조치 불필요'}
        ${modelBadgeHtml('anomaly', `이상 스코어 ${aiScore}`)}
      </div>
    </div>`;
}

// 주간 대비 — equip-history lazy fetch (장비당 1회 캐시), 미니 스파크 + 기간 대비
async function eqpTtWeek(e, row) {
  const paint = items => {
    const el = document.getElementById('eqp-tt-week');
    if (!el || _eqpTtEq !== e) return;
    if (!items || items.length < 2) { el.textContent = '주간 이력 없음 — 전일比 참고'; return; }
    const first = items[0], last = items[items.length - 1];
    const d7 = Math.round(((last.cei ?? 0) - (first.cei ?? 0)) * 10) / 10;
    const fmt = s => s ? `${s.slice(4, 6)}/${s.slice(6, 8)}` : '—';
    el.className = 'eqp-tt-week';
    el.innerHTML = `${eqpSpark(items.map(it => ({ dt: it.strd_dt, cei: it.cei })), _eqpBaseDt)}
      <span>${fmt(first.strd_dt)} 대비 <b class="${d7 > 0 ? 'ops-good' : d7 < 0 ? 'ops-bad' : ''}">${d7 > 0 ? '+' : ''}${d7}</b></span>`;
    _eqpTtPlace(row);   // 내용이 늘었으니 잘림 재계산
  };
  if (_eqpTtHist[e.equip_id]) { paint(_eqpTtHist[e.equip_id]); return; }
  try {
    const d = await fetch(`${BASE_PATH}/api/eqp/equip-history?equip_id=${encodeURIComponent(e.equip_id)}&bld_cd=${encodeURIComponent(e.bld_cd || '')}`)
      .then(r => r.json());
    _eqpTtHist[e.equip_id] = (d && d.items) || [];
    paint(_eqpTtHist[e.equip_id]);
  } catch (err) {
    const el = document.getElementById('eqp-tt-week');
    if (el && _eqpTtEq === e) el.textContent = '추이 조회 실패 — 전일比 참고';
  }
}
