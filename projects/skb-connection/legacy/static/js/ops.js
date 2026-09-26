/* ============================================================
   C-One — 점검·조치 탭 (대상 추출 → 지시서 FSM → 실적 집계)
   ============================================================ */

const FACTOR_LABEL = {
  badce: 'Bad CE', voc: 'VoC', optic: '광파워',
  rtt: 'RTT', loss: 'Loss', traffic: '트래픽',
};
const STATUS_META = WORKITEM_STATUS_META;   // 공용 정의(dashboard.js) 참조

let _opsInited = false;
let _opsTargets = [];
let _opsBoardStatus = '';

async function opsInit() {
  if (_opsInited) { opsLoadStats(); opsLoadBoard(); return; }
  _opsInited = true;

  // 조회조건 드롭다운 채우기
  try {
    const [teams, tpos] = await Promise.all([
      fetch(`${BASE_PATH}/api/teams`).then(r => r.json()),
      fetch(`${BASE_PATH}/api/tpos`).then(r => r.json()),
    ]);
    const teamSel = document.getElementById('ops-team');
    (teams.teams || []).forEach(t => teamSel.add(new Option(t, t)));
    const tpoSel = document.getElementById('ops-tpo');
    (tpos.tpos || []).forEach(t => tpoSel.add(new Option(t, t)));
  } catch (e) { console.warn('ops filter load 실패', e); }

  // factor 칩 토글
  document.querySelectorAll('#ops-factors .ops-chip').forEach(chip => {
    chip.onclick = () => chip.classList.toggle('active');
  });
  // 상태 칩 필터
  document.querySelectorAll('#ops-status-chips .ops-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#ops-status-chips .ops-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _opsBoardStatus = chip.dataset.s || '';
      opsLoadBoard();
    };
  });

  opsLoadStats();
  opsLoadBoard();
  opsLoadTeamStats();
}

// ── 대상 추출 ─────────────────────────────────────────────────
async function opsSearch() {
  const factors = [...document.querySelectorAll('#ops-factors .ops-chip.active')]
    .map(c => c.dataset.f);
  const bldRaw = document.getElementById('ops-blds').value.trim();
  const body = {
    team: document.getElementById('ops-team').value,
    tpo: document.getElementById('ops-tpo').value,
    factors,
    bld_cds: bldRaw ? bldRaw.split(/[\s,;]+/).filter(Boolean) : [],
    limit: 50,
  };
  const tbody = document.getElementById('ops-target-body');
  tbody.innerHTML = skelTableRows(9, 6, '조치 대상 추출 중…');
  try {
    const res = await fetch(`${BASE_PATH}/api/targets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    _opsTargets = data.targets || [];
    document.getElementById('ops-target-meta').textContent =
      data.latest ? `기준일 ${data.latest} · ${data.matched}건 매칭` : '';
    if (!_opsTargets.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="ops-empty">조건에 맞는 대상이 없습니다</td></tr>';
      opsUpdateSelCnt();
      return;
    }
    tbody.innerHTML = _opsTargets.map((t, i) => `
      <tr>
        <td><input type="checkbox" class="ops-row-chk" data-i="${i}" onchange="opsUpdateSelCnt()"></td>
        <td class="ops-td-bld"><b>${t.bld_nm}
          ${t.history ? `<span class="ops-repeat-badge" title="지난 조치: ${_escapeHtml((t.history.last_note || '기록 없음').replace(/"/g, "'"))} (${t.history.last_issued_at || ''})">재발 ${t.history.prior_count}회</span>` : ''}</b>
          <span class="ops-td-sub">${t.region}${t.history?.last_note ? ` · 지난 조치: ${_escapeHtml(t.history.last_note)}` : ''}</span></td>
        <td>${t.team}</td>
        <td class="${t.cei != null && t.cei < 80 ? 'ops-bad' : ''}">${t.cei ?? '—'}</td>
        <td class="ops-c-cell">${t.c_cnt ?? '—'}${t.c_cnt ? '명' : ''}</td>
        <td class="ops-d-cell">${t.d_cnt ?? '—'}${t.d_cnt ? '명' : ''}</td>
        <td>${t.voc}</td>
        <td>${t.factors.map(f => `<span class="ops-factor-badge">${FACTOR_LABEL[f] || f}</span>`).join('')}</td>
        <td><b>${t.score}</b></td>
      </tr>`).join('');
    document.getElementById('ops-check-all').checked = false;
    opsUpdateSelCnt();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="ops-empty">추출 실패 — 네트워크 확인</td></tr>';
  }
}

function opsCheckAll(el) {
  document.querySelectorAll('.ops-row-chk').forEach(c => { c.checked = el.checked; });
  opsUpdateSelCnt();
}

function opsSelected() {
  return [...document.querySelectorAll('.ops-row-chk:checked')]
    .map(c => _opsTargets[Number(c.dataset.i)]).filter(Boolean);
}

function opsUpdateSelCnt() {
  document.getElementById('ops-sel-cnt').textContent = `${opsSelected().length}건 선택`;
}

// ── 지시서 발행 ───────────────────────────────────────────────
async function opsIssue() {
  const sel = opsSelected();
  if (!sel.length) { alert('발행할 대상을 선택하세요.'); return; }
  const res = await fetch(`${BASE_PATH}/api/workitems`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets: sel }),
  });
  const data = await res.json();
  if (data.ok) {
    alert(`지시서 ${data.issued}건 발행${data.duplicated ? ` (중복 ${data.duplicated}건 제외)` : ''}`);
    opsLoadBoard(); opsLoadStats();
  } else {
    alert(data.error || '발행 실패');
  }
}

// ── 진행 보드 ─────────────────────────────────────────────────
async function opsLoadBoard() {
  const box = document.getElementById('ops-board');
  if (!box.querySelector('.ops-item')) box.innerHTML = skelCards(2, '지시서 불러오는 중…');
  const q = _opsBoardStatus ? `?status=${_opsBoardStatus}` : '';
  const data = await fetch(`${BASE_PATH}/api/workitems${q}`).then(r => r.json()).catch(() => ({}));
  const items = data.items || [];
  window._opsItemNames = Object.fromEntries(items.map(i => [i.id, i.bld_nm || i.bld_cd]));
  if (!items.length) {
    box.innerHTML = '<div class="ops-empty">지시서가 없습니다</div>';
    return;
  }
  box.innerHTML = items.map(it => {
    const st = STATUS_META[it.status] || { label: it.status, cls: '' };
    const b = it.before_metrics || {}, a = it.after_metrics || {};
    const delta = (b.cei != null && a.cei != null) ? (a.cei - b.cei) : null;
    const guides = (it.guides || []).slice(0, 2)
      .map(g => `<div class="ops-guide">· ${g.name}: ${g.guide_hns?.[0] || g.guide_106}</div>`).join('');
    return `
    <div class="ops-item">
      <div class="ops-item-hd">
        <span class="ops-status ${st.cls}">${st.label}</span>
        <b>${it.bld_nm || it.bld_cd}</b>
        <span class="ops-td-sub">${it.team}</span>
        <span class="ops-item-score">score ${it.score}</span>
      </div>
      <div class="ops-item-meta">
        발행 ${it.issued_at || '—'}
        ${it.resolved_at ? ` · 조치 ${it.resolved_at}` : ''}
        ${b.cei != null ? ` · 발행시 CEI ${b.cei}` : ''}
        ${delta != null ? ` · <b class="${delta > 0 ? 'ops-good' : (delta < 0 ? 'ops-bad' : '')}">재진단 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}점</b>` : ''}
      </div>
      ${guides}
      ${(it.cause_category || it.result_category) ? `<div class="ops-item-cats">
        ${it.cause_category ? `<span class="ops-cat-chip">원인 · ${it.cause_category}</span>` : ''}
        ${it.result_category ? `<span class="ops-cat-chip ops-cat-chip--action">조치 · ${it.result_category}</span>` : ''}
      </div>` : ''}
      ${it.result_note ? `<div class="ops-item-note">상세: ${_escapeHtml(it.result_note)}</div>` : ''}
      ${it.ai_summary ? `<div class="ops-ai-summary"><span class="ops-ai-label">AI 요약</span>${_escapeHtml(it.ai_summary)}</div>` : ''}
      <div class="ops-item-actions">
        ${it.status === 'issued' ? `
          <button class="ops-btn" onclick="opsResolve(${it.id})">결과 등록</button>
          <button class="ops-btn ops-btn--ghost" onclick="opsDrop(${it.id})">중단</button>` : ''}
        ${it.status === 'resolved' ? `
          <button class="ops-btn ops-btn--primary" onclick="opsVerify(${it.id})">재진단</button>` : ''}
        <button class="ops-btn ops-btn--ghost" onclick="opsToggleEvents(${it.id}, this)">이력</button>
      </div>
      <div class="ops-events" id="ops-events-${it.id}" hidden></div>
    </div>`;
  }).join('');
}

let _resolveId = null;
let _categoriesLoaded = false;

async function opsResolve(id) {
  _resolveId = id;
  if (!_categoriesLoaded) {
    const cats = await fetch(`${BASE_PATH}/api/action-categories`).then(r => r.json()).catch(() => null);
    if (cats) {
      const cSel = document.getElementById('resolve-cause');
      const aSel = document.getElementById('resolve-action');
      cSel.innerHTML = ''; aSel.innerHTML = '';
      cats.causes.forEach(c => cSel.add(new Option(c, c)));
      cats.actions.forEach(a => aSel.add(new Option(a, a)));
      _categoriesLoaded = true;
    }
  }
  document.getElementById('resolve-target').textContent =
    (window._opsItemNames || {})[id] || `지시서 #${id}`;
  document.getElementById('resolve-note').value = '';
  document.getElementById('resolve-status').textContent = '';
  document.getElementById('resolve-modal').classList.add('open');
  if (window.lucide) lucide.createIcons({ rootElement: document.getElementById('resolve-modal') });
}

function opsCloseResolve() {
  document.getElementById('resolve-modal').classList.remove('open');
  _resolveId = null;
}

async function opsSubmitResolve() {
  if (_resolveId == null) return;
  const body = {
    cause: document.getElementById('resolve-cause').value,
    action: document.getElementById('resolve-action').value,
    note: document.getElementById('resolve-note').value.trim(),
  };
  const res = await fetch(`${BASE_PATH}/api/workitems/${_resolveId}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
  const st = document.getElementById('resolve-status');
  if (res.ok) {
    opsCloseResolve();
    opsLoadBoard(); opsLoadStats(); opsLoadTeamStats();
  } else {
    st.textContent = res.error || '등록 실패';
    st.className = 'mail-status error';
  }
}

// (긴급) Top 50 장표 다운로드 — 현재 조회조건 그대로
async function opsDownloadTop() {
  const factors = [...document.querySelectorAll('#ops-factors .ops-chip.active')].map(c => c.dataset.f);
  const bldRaw = document.getElementById('ops-blds').value.trim();
  const res = await fetch(`${BASE_PATH}/api/targets/download`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      team: document.getElementById('ops-team').value,
      tpo: document.getElementById('ops-tpo').value,
      factors,
      bld_cds: bldRaw ? bldRaw.split(/[\s,;]+/).filter(Boolean) : [],
      limit: 50,
    }),
  });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (res.headers.get('Content-Disposition') || '').split('filename=')[1] || 'c-one_top50.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// 조직별 실적 표
async function opsLoadTeamStats() {
  const data = await fetch(`${BASE_PATH}/api/work-stats-by-team`).then(r => r.json()).catch(() => null);
  const body = document.getElementById('ops-team-stats');
  if (!data || !(data.teams || []).length) {
    body.innerHTML = '<tr><td colspan="9" class="ops-empty">지시서 실적이 쌓이면 표시됩니다</td></tr>';
    return;
  }
  body.innerHTML = data.teams.map(t => `
    <tr>
      <td><b>${t.team}</b></td>
      <td>${t.total}</td>
      <td>${t.issued}</td>
      <td>${t.resolved}</td>
      <td>${t.verified}</td>
      <td>${t.improved}건</td>
      <td class="${t.avg_cei_delta > 0 ? 'ops-good' : (t.avg_cei_delta < 0 ? 'ops-bad' : '')}">${t.avg_cei_delta != null ? (t.avg_cei_delta > 0 ? '+' : '') + t.avg_cei_delta + '점' : '—'}</td>
      <td>${opsFmtLead(t.avg_lead_hours)}</td>
    </tr>`).join('');
}

async function opsVerify(id) {
  const res = await fetch(`${BASE_PATH}/api/workitems/${id}/verify`, { method: 'POST' })
    .then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  opsLoadBoard(); opsLoadStats(); opsLoadTeamStats();
}

async function opsDrop(id) {
  const note = prompt('중단 사유');
  if (note == null) return;
  const res = await fetch(`${BASE_PATH}/api/workitems/${id}/drop`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  }).then(r => r.json());
  if (!res.ok) alert(res.error || '실패');
  opsLoadBoard(); opsLoadStats();
}

// ── 실적 집계 ─────────────────────────────────────────────────
async function opsLoadStats() {
  const s = await fetch(`${BASE_PATH}/api/work-stats`).then(r => r.json()).catch(() => null);
  if (!s) return;
  document.getElementById('os-issued').textContent = s.by_status?.issued ?? 0;
  document.getElementById('os-resolved').textContent =
    (s.by_status?.resolved ?? 0) + (s.by_status?.verified ?? 0);
  document.getElementById('os-lead').textContent = opsFmtLead(s.avg_lead_hours);
  const d = document.getElementById('os-delta');
  if (s.avg_cei_delta != null) {
    d.textContent = `${s.avg_cei_delta > 0 ? '+' : ''}${s.avg_cei_delta}점`;
    d.className = 'ops-stat-val ' + (s.avg_cei_delta > 0 ? 'ops-good' : (s.avg_cei_delta < 0 ? 'ops-bad' : ''));
  } else {
    d.textContent = '—';
    d.className = 'ops-stat-val';
  }
}

// ── 상태 전이 이력 (감사 로그) ────────────────────────────────
async function opsToggleEvents(id, btn) {
  const box = document.getElementById(`ops-events-${id}`);
  if (!box.hidden) { box.hidden = true; return; }
  const data = await fetch(`${BASE_PATH}/api/workitems/${id}/events`).then(r => r.json()).catch(() => ({}));
  const evs = data.events || [];
  const STATUS_KO = { issued: '발행', resolved: '조치완료', verified: '검증완료', dropped: '중단' };
  box.innerHTML = evs.length
    ? evs.map(e => `<div class="ops-event">
        <span class="ops-event-at">${e.at}</span>
        ${e.from_status ? `${STATUS_KO[e.from_status] || e.from_status} → ` : ''}<b>${STATUS_KO[e.to_status] || e.to_status}</b>
        ${e.note ? `<span class="ops-td-sub"> · ${_escapeHtml(e.note)}</span>` : ''}
      </div>`).join('')
    : '<div class="ops-td-sub">이력이 없습니다</div>';
  box.hidden = false;
}

// 리드타임 표시: 1시간 미만 = 분, 48시간 미만 = 시간, 그 이상 = 일
function opsFmtLead(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  if (hours < 48) return `${hours.toFixed(1)}시간`;
  return `${(hours / 24).toFixed(1)}일`;
}
