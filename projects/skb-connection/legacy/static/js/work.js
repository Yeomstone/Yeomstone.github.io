/* ============================================================
   C-One — 작업 탭 (장비 탭과 동일 구성)
   조치 대상(작업 그룹) → 행 클릭 아코디언(영향 장비) →
   장비단위 지시서(domain='work') → 진행 보드 → 조직별 실적.
   데이터: /api/work/records — 작업×장비 레코드, q/cd = 작업일 D-1~D+7.
   ============================================================ */

const WK_STATUS_META = WORKITEM_STATUS_META;   // 공용 정의(dashboard.js) 참조
const WK_OFFSETS = ['-1', '0', '1', '2', '3', '4', '5', '6', '7'];

let _wkInited = false;
let _wkRecords = [];
let _wkGroups = [];
let _wkLv3 = '';
let _wkBoardStatus = '';
let _wkOrg = 'skb';
let _wkOpenIdx = null;

function wkDate8(v) { return (v || '').replace(/-/g, ''); }
function wkOffLabel(o) { return o === '-1' ? 'D-1' : (o === '0' ? 'D-day' : `D+${o}`); }

async function workInit() {
  if (_wkInited) { wkLoadStats(); wkLoadBoard(); wkLoadInsights(); return; }
  _wkInited = true;

  const dateInp = document.getElementById('wk-base-date');
  const today = new Date();
  dateInp.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  document.querySelectorAll('#wk-lv3-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#wk-lv3-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _wkLv3 = chip.dataset.v || '';
      if (_wkRecords.length) wkRenderTargets();
    };
  });
  document.querySelectorAll('#wk-status-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#wk-status-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _wkBoardStatus = chip.dataset.s || '';
      wkLoadBoard();
    };
  });
  document.querySelectorAll('#wk-org-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#wk-org-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _wkOrg = chip.dataset.o || 'skb';
      wkLoadTeamStats();
    };
  });

  wkLoadStats();
  wkLoadBoard();
  wkLoadTeamStats();
  wkLoadInsights();
  wkSearch();
}

// ── 조치 대상 (작업 그룹) 추출 ────────────────────────────────
async function wkSearch() {
  wkHideEquips();
  const tbody = document.getElementById('wk-target-body');
  tbody.innerHTML = skelTableRows(6, 6, '작업 이력 추출 중…');
  try {
    const base = wkDate8(document.getElementById('wk-base-date').value);
    const data = await fetch(`${BASE_PATH}/api/work/records?base_dt=${base}`).then(r => r.json());
    _wkRecords = data.records || [];
    document.getElementById('wk-target-meta').textContent = data.base_dt
      ? `기준일 ${data.base_dt} · 레코드 ${_wkRecords.length}건 · 작업을 선택하면 장비 목록` : '';
    wkFillTeamSelects();
    wkRenderTargets();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="ops-empty">추출 실패 — 네트워크 확인</td></tr>';
  }
}

function wkFillTeamSelects() {
  const teamSel = document.getElementById('wk-team');
  const keep = teamSel.value;
  teamSel.innerHTML = '<option value="">전체 HNS 팀</option>';
  [...new Set(_wkRecords.map(r => r.hns_team).filter(Boolean))].sort()
    .forEach(t => teamSel.add(new Option(t, t)));
  teamSel.value = keep;
  wkTeamChanged();
}

function wkTeamChanged() {
  const team = document.getElementById('wk-team').value;
  const postSel = document.getElementById('wk-post');
  const keep = postSel.value;
  postSel.innerHTML = '<option value="">전체 post</option>';
  [...new Set(_wkRecords.filter(r => !team || r.hns_team === team)
      .map(r => r.hns_post).filter(Boolean))].sort()
    .forEach(p => postSel.add(new Option(p, p)));
  postSel.value = keep;
  if (_wkRecords.length) wkRenderTargets();
}

function wkFiltered() {
  const team = document.getElementById('wk-team').value;
  const post = document.getElementById('wk-post').value;
  const q = (document.getElementById('wk-q').value || '').trim().toLowerCase();
  return _wkRecords.filter(r =>
    (!team || r.hns_team === team) &&
    (!post || r.hns_post === post) &&
    (!_wkLv3 || r.lv3 === _wkLv3) &&
    (!q || `${r.oper_nm} ${r.equip_mgmt_num}`.toLowerCase().includes(q)));
}

// 레코드 묶음 → 오프셋별 평균 CEI (null 제외)
function wkAvgQ(recs) {
  const out = {};
  WK_OFFSETS.forEach(o => {
    const vs = recs.map(r => (r.q || {})[o]).filter(v => v != null);
    out[o] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  });
  return out;
}

function wkBeforeAfter(avg) {
  const before = avg['-1'];
  const seen = WK_OFFSETS.filter(o => o !== '-1' && avg[o] != null);
  const after = seen.length ? avg[seen[seen.length - 1]] : null;
  return { before, after,
           delta: (before != null && after != null) ? after - before : null };
}

function wkTrendArr(avg) {
  return WK_OFFSETS.filter(o => avg[o] != null)
    .map(o => ({ dt: wkOffLabel(o), cei: Math.round(avg[o] * 10) / 10 }));
}

function wkCeiPair(b) {
  if (b.before == null && b.after == null) return '<span class="ops-td-sub">—</span>';
  const f = v => v == null ? '—' : v.toFixed(1);
  const d = b.delta;
  const dHtml = d == null ? ''
    : ` <b class="${d < 0 ? 'ops-bad' : (d > 0 ? 'ops-good' : '')}">(${d > 0 ? '+' : ''}${d.toFixed(1)})</b>`;
  return `${f(b.before)} → ${f(b.after)}${dHtml}`;
}

function wkRenderTargets() {
  wkHideEquips();
  const groups = {};
  wkFiltered().forEach(r => {
    const key = `${r.strd_dt}|${r.oper_nm}|${r.hns_team}|${r.hns_post}|${r.lv1}`;
    (groups[key] = groups[key] || { key, strd_dt: r.strd_dt, oper_nm: r.oper_nm,
      lv1: r.lv1, lv3: r.lv3, hns_team: r.hns_team, hns_post: r.hns_post,
      recs: [] }).recs.push(r);
  });
  _wkGroups = Object.values(groups).map(g => {
    const avg = wkAvgQ(g.recs);
    return { ...g, avg, ba: wkBeforeAfter(avg), trend: wkTrendArr(avg) };
  });
  // 작업 후 CEI 하락(악화) 큰 순 — 조치 대상 우선순위
  _wkGroups.sort((a, b) =>
    (a.ba.delta ?? Infinity) - (b.ba.delta ?? Infinity) ||
    (a.ba.before ?? Infinity) - (b.ba.before ?? Infinity));

  const tbody = document.getElementById('wk-target-body');
  if (!_wkGroups.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="ops-empty">조건에 맞는 작업이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = _wkGroups.map((g, i) => `
    <tr class="wk-target-row" data-i="${i}" onclick="wkSelectGroup(${i}, this)">
      <td class="ops-td-sub">${g.strd_dt}</td>
      <td class="ops-td-bld"><b>${_escapeHtml(g.oper_nm || '—')}</b>
        <span class="ops-td-sub">${g.hns_team}${g.hns_post ? ' · ' + g.hns_post : ''}</span></td>
      <td><span class="ops-factor-badge">${g.lv1 || g.lv3 || '—'}</span></td>
      <td>${g.recs.length}</td>
      <td class="${g.ba.delta != null && g.ba.delta < 0 ? 'ops-bad' : ''}">${wkCeiPair(g.ba)}</td>
      <td>${eqpSpark(g.trend, 'D-day')}</td>
    </tr>`).join('');
}

// ── 작업 선택 → 영향 장비 아코디언 ────────────────────────────
function wkHideEquips() {
  _wkOpenIdx = null;
  document.querySelectorAll('.wk-target-row').forEach(r => r.classList.remove('is-selected'));
  const sec = document.getElementById('wk-equips-sec');
  const park = document.getElementById('wk-equips-park');
  if (sec && park && sec.parentElement !== park) park.appendChild(sec);
  if (sec) sec.hidden = true;
  document.querySelectorAll('.wk-equips-tr').forEach(tr => tr.remove());
}

function wkSelectGroup(i, rowEl) {
  const g = _wkGroups[i];
  if (!g) return;
  if (_wkOpenIdx === i) { wkHideEquips(); return; }  // 같은 행 재클릭 → 접기
  wkHideEquips();
  _wkOpenIdx = i;
  rowEl.classList.add('is-selected');

  const sec = document.getElementById('wk-equips-sec');
  const tr = document.createElement('tr');
  tr.className = 'wk-equips-tr';
  const td = document.createElement('td');
  td.colSpan = 6;
  td.appendChild(sec);
  tr.appendChild(td);
  rowEl.after(tr);
  sec.hidden = false;
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.getElementById('wk-equips-title').textContent =
    `— ${g.oper_nm || ''} (${g.strd_dt} · CEI 하락 순)`;
  const rows = g.recs.map(r => {
    const avg = {};
    WK_OFFSETS.forEach(o => { avg[o] = (r.q || {})[o] ?? null; });
    const ba = wkBeforeAfter(avg);
    const cdSeen = WK_OFFSETS.filter(o => (r.cd || {})[o] != null);
    return { r, ba, trend: wkTrendArr(avg),
             cd: cdSeen.length ? r.cd[cdSeen[cdSeen.length - 1]] : 0 };
  }).sort((a, b) => (a.ba.delta ?? Infinity) - (b.ba.delta ?? Infinity));
  g._rows = rows;

  document.getElementById('wk-equips-body').innerHTML = rows.map((x, j) => `
    <tr>
      <td><input type="checkbox" class="wk-row-chk" data-j="${j}" onchange="wkUpdateSelCnt()"></td>
      <td class="ops-td-bld"><b>${_escapeHtml(x.r.equip_mgmt_num)}</b></td>
      <td class="ops-td-sub">${x.r.lv1 || ''}${x.r.lv2 ? ' / ' + x.r.lv2 : ''}</td>
      <td class="${x.ba.delta != null && x.ba.delta < 0 ? 'ops-bad' : ''}">${wkCeiPair(x.ba)}</td>
      <td class="${x.cd ? 'ops-bad' : ''}">${x.cd}명</td>
      <td>${eqpSpark(x.trend, 'D-day')}</td>
    </tr>`).join('');
  document.getElementById('wk-check-all').checked = false;
  wkUpdateSelCnt();
}

function wkCheckAll(el) {
  document.querySelectorAll('.wk-row-chk').forEach(c => { c.checked = el.checked; });
  wkUpdateSelCnt();
}

function wkSelected() {
  const g = _wkGroups[_wkOpenIdx];
  if (!g || !g._rows) return [];
  return [...document.querySelectorAll('.wk-row-chk:checked')]
    .map(c => g._rows[Number(c.dataset.j)]).filter(Boolean);
}

function wkUpdateSelCnt() {
  document.getElementById('wk-sel-cnt').textContent = `${wkSelected().length}대 선택`;
}

// ── 지시서 발행 (장비단위, domain='work') ─────────────────────
async function wkIssue() {
  const g = _wkGroups[_wkOpenIdx];
  const sel = wkSelected();
  if (!g || !sel.length) { alert('발행할 장비를 선택하세요.'); return; }
  const targets = sel.map(x => ({
    equip_id: x.r.equip_mgmt_num,
    equip_nm: x.r.equip_mgmt_num,
    bld_cd: '',
    bld_nm: g.oper_nm || '',
    team: '',
    hns_team: x.r.hns_team || '',
    hns_post: x.r.hns_post || '',
    score: Math.round(x.ba.delta != null ? -x.ba.delta * 10 : 0),  // 하락폭 근사
    guides: [{ name: '작업', guide_106: `${x.r.lv1 || ''}${x.r.lv2 ? '/' + x.r.lv2 : ''} · ${g.oper_nm || ''} (${g.strd_dt})` }],
    before: { strd_dt: g.strd_dt,
              cei: x.ba.before != null ? Math.round(x.ba.before * 10) / 10 : null,
              cd_cnt: (x.r.cd || {})['-1'] ?? 0 },
  }));
  const res = await fetch(`${BASE_PATH}/api/work/workitems`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets }),
  }).then(r => r.json());
  if (res.ok) {
    alert(`지시서 ${res.issued}건 발행${res.duplicated ? ` (중복 ${res.duplicated}건 제외)` : ''}`);
    wkLoadBoard(); wkLoadStats();
  } else {
    alert(res.error || '발행 실패');
  }
}

// ── 지시서 진행 보드 ──────────────────────────────────────────
async function wkLoadBoard() {
  const box = document.getElementById('wk-board');
  if (!box.querySelector('.ops-item')) box.innerHTML = skelCards(2, '지시서 불러오는 중…');
  const q = _wkBoardStatus ? `?status=${_wkBoardStatus}` : '';
  const data = await fetch(`${BASE_PATH}/api/work/workitems${q}`).then(r => r.json()).catch(() => ({}));
  const items = data.items || [];
  window._wkItemNames = Object.fromEntries(items.map(i => [i.id, i.equip_nm || i.equip_id]));
  if (!items.length) {
    box.innerHTML = '<div class="ops-empty">지시서가 없습니다</div>';
    return;
  }
  box.innerHTML = items.map(it => {
    const st = WK_STATUS_META[it.status] || { label: it.status, cls: '' };
    const b = it.before_metrics || {}, a = it.after_metrics || {};
    const delta = (b.cei != null && a.cei != null) ? (a.cei - b.cei) : null;
    const guides = (it.guides || []).slice(0, 2)
      .map(gd => `<div class="ops-guide">· ${gd.name}: ${_escapeHtml(gd.guide_hns?.[0] || gd.guide_106 || '')}</div>`).join('');
    return `
    <div class="ops-item">
      <div class="ops-item-hd">
        <span class="ops-status ${st.cls}">${st.label}</span>
        <b>${_escapeHtml(it.equip_nm || it.equip_id)}</b>
        <span class="ops-td-sub">${_escapeHtml(it.bld_nm || '')}${it.hns_team ? ' · ' + it.hns_team : ''}</span>
      </div>
      <div class="ops-item-meta">
        발행 ${it.issued_at || '—'}
        ${it.resolved_at ? ` · 조치 ${it.resolved_at}` : ''}
        ${b.cei != null ? ` · 작업 전 CEI ${b.cei} (${b.strd_dt || ''})` : ''}
        ${delta != null ? ` · <b class="${delta > 0 ? 'ops-good' : (delta < 0 ? 'ops-bad' : '')}">재진단 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}점 ${delta > 0 ? '개선' : '미개선'}</b>` : ''}
      </div>
      ${guides}
      ${(it.cause_category || it.result_category) ? `<div class="ops-item-cats">
        ${it.cause_category ? `<span class="ops-cat-chip">원인 · ${it.cause_category}</span>` : ''}
        ${it.result_category ? `<span class="ops-cat-chip ops-cat-chip--action">조치 · ${it.result_category}</span>` : ''}
      </div>` : ''}
      ${it.result_note ? `<div class="ops-item-note">상세: ${_escapeHtml(it.result_note)}</div>` : ''}
      <div class="ops-item-actions">
        ${it.status === 'issued' ? `
          <button class="ops-btn" onclick="wkResolve(${it.id})">결과 등록</button>
          <button class="ops-btn ops-btn--ghost" onclick="wkDrop(${it.id})">중단</button>` : ''}
        ${it.status === 'resolved' ? `
          <button class="ops-btn ops-btn--primary" onclick="wkVerify(${it.id})">재진단</button>` : ''}
        <button class="ops-btn ops-btn--ghost" onclick="wkToggleEvents(${it.id}, this)">이력</button>
      </div>
      <div class="ops-events" id="wk-events-${it.id}" hidden></div>
    </div>`;
  }).join('');
}

// ── 결과 등록 (모달 — eqp 와 동일 카테고리, 전용 DOM) ─────────
let _wkResolveId = null;
let _wkCatsLoaded = false;

let _wkActTree = [];

function wkAct1Changed() {
  const lv1 = document.getElementById('wk-resolve-act1').value;
  const sel2 = document.getElementById('wk-resolve-act2');
  sel2.innerHTML = '';
  const acts = (_wkActTree.find(t => t.name === lv1) || {}).activities || [];
  if (!acts.length) { sel2.add(new Option('— (해당 없음)', '')); return; }
  acts.forEach(a => sel2.add(new Option(a, a)));
}

async function wkResolve(id) {
  _wkResolveId = id;
  if (!_wkCatsLoaded) {
    const cats = await fetch(`${BASE_PATH}/api/action-categories`).then(r => r.json()).catch(() => null);
    if (cats) {
      const cSel = document.getElementById('wk-resolve-cause');
      const a1 = document.getElementById('wk-resolve-act1');
      cSel.innerHTML = ''; a1.innerHTML = '';
      cats.causes.forEach(c => cSel.add(new Option(c, c)));
      _wkActTree = cats.action_tree || [];
      _wkActTree.forEach(t => a1.add(new Option(t.name, t.name)));
      wkAct1Changed();
      _wkCatsLoaded = true;
    }
  }
  document.getElementById('wk-resolve-target').textContent =
    (window._wkItemNames || {})[id] || `지시서 #${id}`;
  document.getElementById('wk-resolve-note').value = '';
  document.getElementById('wk-resolve-status').textContent = '';
  document.getElementById('wk-resolve-modal').classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: document.getElementById('wk-resolve-modal') });
}

function wkCloseResolve() {
  document.getElementById('wk-resolve-modal').classList.remove('open');
  _wkResolveId = null;
}

async function wkSubmitResolve() {
  if (_wkResolveId == null) return;
  const lv1 = document.getElementById('wk-resolve-act1').value;
  const lv2 = document.getElementById('wk-resolve-act2').value;
  const body = {
    cause: document.getElementById('wk-resolve-cause').value,
    action: lv2 ? `${lv1}/${lv2}` : lv1,
    note: document.getElementById('wk-resolve-note').value.trim(),
  };
  const res = await fetch(`${BASE_PATH}/api/workitems/${_wkResolveId}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
  if (res.ok) {
    wkCloseResolve();
    wkLoadBoard(); wkLoadStats(); wkLoadTeamStats();
  } else {
    const st = document.getElementById('wk-resolve-status');
    st.textContent = res.error || '등록 실패';
    st.className = 'mail-status error';
  }
}

async function wkVerify(id) {
  const res = await fetch(`${BASE_PATH}/api/work/workitems/${id}/verify`, { method: 'POST' })
    .then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  wkLoadBoard(); wkLoadStats(); wkLoadTeamStats(); wkLoadInsights();
}

async function wkDrop(id) {
  const note = prompt('중단 사유');
  if (note == null) return;
  const res = await fetch(`${BASE_PATH}/api/workitems/${id}/drop`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  }).then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  wkLoadBoard(); wkLoadStats();
}

async function wkToggleEvents(id, btn) {
  const box = document.getElementById(`wk-events-${id}`);
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

// ── KPI 4타일 / 조직별 실적 ───────────────────────────────────
async function wkLoadStats() {
  const s = await fetch(`${BASE_PATH}/api/work/work-stats`).then(r => r.json()).catch(() => null);
  if (!s) return;
  document.getElementById('wks-issued').textContent = s.issued_total ?? 0;
  document.getElementById('wks-resolved').textContent = s.resolved ?? 0;
  document.getElementById('wks-improved').textContent = s.improved ?? 0;
  document.getElementById('wks-notimp').textContent = s.not_improved ?? 0;
}

async function wkLoadTeamStats() {
  const data = await fetch(`${BASE_PATH}/api/work/work-stats-by-team?org=${_wkOrg}`)
    .then(r => r.json()).catch(() => null);
  const body = document.getElementById('wk-team-stats');
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
      <td><b>${_escapeHtml(t.team || '(미지정)')}</b></td>
      <td>${t.total}</td>
      <td>${t.resolved + t.verified}</td>
      <td>${t.improved}건</td>
      <td>${cei}</td>
    </tr>`;
  }).join('');
}

/* ── Loop 인사이트 — 결과 축적/학습 (CEI 효과검증 환류) ──────── */

// 자율복구 성공률 미니 추이 — 단순 폴리라인 (등급색 스파크와 의미 구분)
function liSpark(days) {
  const pts = days.filter(d => d.rate != null);
  if (pts.length < 2) return '<span class="ops-td-sub">—</span>';
  const w = 120, h = 28, pad = 3;
  const vals = pts.map(d => d.rate);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const xy = pts.map((d, i) => {
    const x = pad + (w - pad * 2) * (i / (pts.length - 1));
    const y = h - pad - (h - pad * 2) * ((d.rate - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="li-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"
    aria-label="Auto-reset 성공률 ${vals[0]}% → ${vals[vals.length - 1]}%">
    <polyline points="${xy.join(' ')}" fill="none"></polyline></svg>`;
}

function liDelta(v, digits = 1) {
  if (v == null) return '<span class="ops-td-sub">—</span>';
  const cls = v > 0 ? 'ops-good' : (v < 0 ? 'ops-bad' : '');
  return `<b class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(digits)}점</b>`;
}

async function wkLoadInsights() {
  const box = document.getElementById('li-body');
  if (!box) return;
  const d = await fetch(`${BASE_PATH}/api/loop-insights`).then(r => r.json()).catch(() => null);
  if (!d || !d.ready) {
    box.innerHTML = '<div class="ops-empty">인사이트를 불러오지 못했습니다</div>';
    return;
  }
  const s = d.summary || {};
  const ar = d.autoreset || {};
  const effect = d.effect_by_category || [];
  const recur = d.recurrence || [];

  const tiles = `
    <div class="ops-stats li-stats">
      <div class="ops-stat"><div class="ops-stat-val" id="li-verified">${s.verified_total ?? 0}</div>
        <div class="ops-stat-lbl">누적 CEI 효과검증</div></div>
      <div class="ops-stat"><div class="ops-stat-val ${s.avg_cei_delta > 0 ? 'ops-good' : (s.avg_cei_delta < 0 ? 'ops-bad' : '')}">
        ${s.avg_cei_delta == null ? '—' : `${s.avg_cei_delta > 0 ? '+' : ''}${s.avg_cei_delta}점`}</div>
        <div class="ops-stat-lbl">평균 CEI 개선폭</div></div>
      <div class="ops-stat"><div class="ops-stat-val">${ar.rate == null ? '—' : ar.rate + '%'}</div>
        <div class="ops-stat-lbl">Auto-reset 성공률 (최근 ${(ar.days || []).length || 30}일)</div></div>
      <div class="ops-stat"><div class="ops-stat-val ${recur.length ? 'ops-bad' : ''}">${recur.length}</div>
        <div class="ops-stat-lbl">재발 건물</div></div>
    </div>`;

  const effectHtml = effect.length ? `
    <table class="ops-tbl li-effect-tbl">
      <thead><tr>
        <th>조치 유형</th><th>건수</th>
        <th title="검증완료 건의 조치 후 CEI − 조치 전 CEI 평균 (미측정 제외)">평균 CEI 개선</th>
        <th title="개선폭 > 0 비율">개선 성공률</th>
      </tr></thead>
      <tbody>${effect.map(g => `
        <tr>
          <td><b>${_escapeHtml(g.category)}</b></td>
          <td>${g.count}</td>
          <td>${liDelta(g.avg_delta)}</td>
          <td>${g.success_rate == null ? '<span class="ops-td-sub">—</span>' : g.success_rate + '%'}</td>
        </tr>`).join('')}</tbody>
    </table>`
    : '<div class="ops-empty">축적된 효과검증 데이터가 없습니다 — 재진단(CEI 효과검증)이 완료되면 조치 유형별 효과가 집계됩니다</div>';

  const arHtml = (ar.days || []).length ? `
    <div class="li-ar">
      <div class="li-blk-title">Auto-reset 성공률 추이 <span class="ops-td-sub">최근 ${ar.days.length}일</span></div>
      <div class="li-ar-row">
        ${liSpark(ar.days)}
        <span class="li-ar-rate">${ar.rate == null ? '—' : ar.rate + '%'}</span>
        <span class="li-trend ${ar.trend === '개선' ? 'ops-good' : (ar.trend === '악화' ? 'ops-bad' : '')}">${ar.trend || ''}</span>
      </div>
      <div class="ops-td-sub">복구 성공 ${(ar.total_ok ?? 0).toLocaleString()}건 · 실패 ${(ar.total_fail ?? 0).toLocaleString()}건</div>
    </div>` : '';

  const KO = { issued: '발행', resolved: '조치완료', verified: '검증완료', dropped: '중단' };
  const recurHtml = recur.length ? `
    <div class="li-recur">
      <div class="li-blk-title">재발 건물 <span class="ops-td-sub">Ticket 2회 이상 — 근본 원인 재점검 대상</span></div>
      ${recur.slice(0, 5).map(r => `
        <div class="li-recur-row">
          <b class="li-recur-nm">${_escapeHtml(r.bld_nm || r.bld_cd)}</b>
          <span class="ops-td-sub li-recur-code">${_escapeHtml(r.bld_nm ? r.bld_cd : '')}</span>
          <span class="li-recur-cnt">${r.count}회</span>
          <span class="ops-td-sub li-recur-last">최근 ${KO[r.last_status] || r.last_status || '—'}</span>
        </div>`).join('')}
    </div>` : '';

  box.innerHTML = `${tiles}
    <div class="li-grid">
      <div>${effectHtml}</div>
      <div class="li-side">${arHtml}${recurHtml}</div>
    </div>`;
}
