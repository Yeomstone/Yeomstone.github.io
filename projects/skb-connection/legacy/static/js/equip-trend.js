// ============================================================
//  전후 트렌드 탭 — 장비 리스트 업로드 → 기준일 전/후 CEI 비교
//  API: POST /api/equip-trend (multipart file 또는 JSON ids)
// ============================================================

// 전체 평균 = 슬롯1, 장비 시리즈 = 슬롯2~11 (고정 순서).
// DESIGN_LANGUAGE.md 차트 팔레트 — 기본 #1B3F8F + 보조 4색, 이후 다크 톤 변주.
// 차트에는 가입자수 상위 10개 장비만 올리고(잘리면 안내 표시),
// 전체 목록은 아래 장비별 일자별 표가 담당한다.
const EQ_PALETTE = ['#1B3F8F', '#31A24C', '#F7B928', '#E41E3F',
                    '#8A8D91', '#0E8570', '#9A6A00', '#A81232',
                    '#12508A', '#1F7A33', '#5B5E63'];
const EQ_MAX_CHART_SERIES = 10;

let _eqChart = null;

// ── 표 상태 (정렬/검색/빠른필터) + 마지막 조회 payload (export 재전송용) ──
let _eqRows = [];               // 마지막 성공 조회의 compare_rows
let _eqTail = [];               // 잘림/집계실패 안내 행 (정렬 대상 아님, 항상 맨 아래)
let _eqSortKey = 'svc_cnt';     // 기본 정렬 = 가입자수 내림차순 (서버 순서와 동일)
let _eqSortDir = -1;
let _eqSearchText = '';
let _eqQuickFilter = 'all';     // all | improved | worse | bad-down
let _eqLastPayload = null;      // { file } 또는 { ids }, + baseDate

function _eqEl(id) { return document.getElementById(id); }

function _eqFmtDate(d) {
  return d && d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : (d || '—');
}

function _eqGradeHtml(g) {
  if (!g) return '—';
  const cls = { S: 's', A: 'a', B: 'b', C: 'c', D: 'd' }[g] || 'b';
  // 공용 CEI 등급 칩 (dashboard.js ceiBadgeHtml과 동일 룩) — 등급 문자는 백엔드 판정 존중
  return `<span class="cei-chip-g cei-g-${cls}">${g}</span>`;
}

function _eqDeltaHtml(v) {
  if (v === null || v === undefined) return '—';
  const color = v > 0 ? 'var(--grade-b)' : v < 0 ? 'var(--red)' : 'var(--text-secondary)';
  const sign = v > 0 ? '+' : '';
  return `<span style="color:${color};font-weight:700">${sign}${v.toFixed(2)}</span>`;
}

// ── 조회 결과 pill — 성공/실패 상태색 토글 ───────────────────
function _eqSetMeta(text, state) {
  const meta = _eqEl('eq-meta');
  if (!meta) return;
  meta.textContent = text;
  meta.classList.toggle('fp-pill--ok', state === 'ok');
  meta.classList.toggle('fp-pill--err', state === 'err');
}

// ── 조회 ─────────────────────────────────────────────────────
async function equipQuery() {
  const file = _eqEl('eq-file').files[0];
  const idsText = (_eqEl('eq-ids').value || '').trim();
  const baseDate = _eqEl('eq-base-date').value || '';

  if (!file && !idsText) { _eqSetMeta('엑셀 업로드 또는 장비 직접 입력이 필요합니다', 'err'); return; }

  // 조회 버튼 로딩 상태 — 중복 클릭 방지
  const runBtn = _eqEl('eq-run');
  if (runBtn && runBtn.disabled) return;
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="eq-spin" aria-hidden="true"></span>조회 중…';
  }
  _eqSetMeta('조회 중…', null);

  try {
    let res;
    const payload = file
      ? { file, baseDate }
      : { ids: idsText.split(/[\n,]/).map(s => s.trim()).filter(Boolean), baseDate };
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('base_date', baseDate);
        res = await fetch(`${BASE_PATH}/api/equip-trend`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`${BASE_PATH}/api/equip-trend`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: payload.ids, base_date: baseDate }),
        });
      }
    } catch (e) { _eqSetMeta('요청 실패 — 네트워크를 확인하세요', 'err'); return; }

    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      _eqSetMeta((data && data.error) || `조회 실패 (${res.status})`, 'err');
      return;
    }
    if (!data.matched) {
      _eqSetMeta(data.error || '일치하는 장비가 없습니다', 'err');
      _eqRenderUnmatched(data);
      return;
    }
    _eqSetMeta(`${data.matched}대 매칭 · 기준일 ${_eqFmtDate(data.base_date)}`
      + ` (전 ${_eqFmtDate(data.before_date)} ↔ 후 ${_eqFmtDate(data.after_date)})`, 'ok');
    // export 버튼은 성공 조회 이후에만 — 표에 보이는 결과와 같은 payload 를 재전송
    _eqLastPayload = payload;
    const exportBtn = _eqEl('eq-export');
    if (exportBtn) exportBtn.disabled = false;
    _eqRenderStats(data);
    _eqRenderChart(data);
    _eqRenderTable(data);
    _eqRenderUnmatched(data);
    // 차트 시리즈 잘림 안내 — "7개만 나온다" 오해 방지 (전체는 아래 표에 있음)
    const chartCap = (data.equips || []).length > EQ_MAX_CHART_SERIES
      ? `차트는 가입자수 상위 ${EQ_MAX_CHART_SERIES}대만 표시 (전체 ${data.matched}대는 아래 표) · `
      : '';
    const noteEl = _eqEl('eq-note');
    noteEl.textContent = `범례 클릭: 라인 표시/숨김 · ${chartCap}${data.note || ''}`;
    noteEl.hidden = false;
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '전후 비교 조회'; }
  }
}

// ── xlsx 다운로드 — 마지막 성공 조회를 export 엔드포인트로 재전송 ──
function _eqExportErr(msg) {
  const el = _eqEl('eq-export-err');
  if (!el) return;
  el.textContent = msg || '';
  clearTimeout(_eqExportErr._t);
  if (msg) _eqExportErr._t = setTimeout(() => { el.textContent = ''; }, 6000);
}

async function equipExport() {
  const btn = _eqEl('eq-export');
  if (!_eqLastPayload || !btn || btn.classList.contains('is-loading')) return;
  btn.classList.add('is-loading');
  btn.disabled = true;
  const prevHtml = btn.innerHTML;
  btn.innerHTML = '<span class="eq-spin eq-spin--dark" aria-hidden="true"></span>다운로드 중…';
  _eqExportErr('');

  try {
    let res;
    if (_eqLastPayload.file) {
      const fd = new FormData();
      fd.append('file', _eqLastPayload.file);
      fd.append('base_date', _eqLastPayload.baseDate || '');
      res = await fetch(`${BASE_PATH}/api/equip-trend/export`, { method: 'POST', body: fd });
    } else {
      res = await fetch(`${BASE_PATH}/api/equip-trend/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: _eqLastPayload.ids, base_date: _eqLastPayload.baseDate || '' }),
      });
    }
    // 실패는 JSON {ok:false, error} — 성공(xlsx 바이너리)과 구분해 메시지만 표시
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok || ctype.includes('json')) {
      const err = await res.json().catch(() => null);
      _eqExportErr((err && err.error) || `다운로드 실패 (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    const name = m ? decodeURIComponent(m[1]) : 'equip_trend.xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    _eqExportErr('다운로드 실패 — 네트워크를 확인하세요');
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    btn.innerHTML = prevHtml;
  }
}

// ── 파일 선택 표시 (커스텀 file 버튼의 파일명 라벨 + 해제 버튼) ──
// 파일이 걸려 있으면 직접 입력보다 파일이 우선이라, 해제 수단이 꼭 필요하다
function _eqSyncFileLabel() {
  const input = _eqEl('eq-file');
  const nameEl = _eqEl('eq-file-name');
  if (!input || !nameEl) return;
  const f = input.files && input.files[0];
  nameEl.textContent = f ? f.name : '선택된 파일 없음';
  nameEl.classList.toggle('has-file', !!f);
  const clearBtn = _eqEl('eq-file-clear');
  if (clearBtn) clearBtn.hidden = !f;
}

// 파일 선택 즉시 서버에서 ID 를 추출해 '장비 직접 입력'란에 표시 (프리뷰).
// 파일이 걸려 있는 동안엔 파일이 우선이므로, 일부만 조회하려면 파일 해제(X)
// 후 아래 목록을 편집하면 된다.
async function _eqPreviewFileIds() {
  const f = _eqEl('eq-file')?.files?.[0];
  const ta = _eqEl('eq-ids');
  if (!f || !ta) return;
  try {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`${BASE_PATH}/api/equip-trend/parse-ids`,
                            { method: 'POST', body: fd });
    const data = await res.json().catch(() => null);
    if (data && data.ok && Array.isArray(data.ids)) {
      ta.value = data.ids.join('\n');
    }
  } catch (e) { /* 프리뷰 실패는 조회를 막지 않는다 */ }
}

_eqEl('eq-file')?.addEventListener('change', () => {
  _eqSyncFileLabel();
  _eqPreviewFileIds();
});
_eqEl('eq-file-clear')?.addEventListener('click', () => {
  const input = _eqEl('eq-file');
  if (input) input.value = '';
  _eqSyncFileLabel();
});

// ── 요약 타일 ────────────────────────────────────────────────
function _eqRenderStats(d) {
  ['eq-before', 'eq-after', 'eq-delta', 'eq-scope']
    .forEach(id => _eqEl(id)?.classList.remove('is-empty'));
  const o = d.overall || {};
  const fmt = v => (v === null || v === undefined) ? '—' : v.toFixed(2);
  _eqEl('eq-before').innerHTML = `${fmt(o.before)} ${_eqGradeHtml(o.before_grade)}`;
  _eqEl('eq-after').innerHTML = `${fmt(o.after)} ${_eqGradeHtml(o.after_grade)}`;
  _eqEl('eq-before-lbl').textContent = `전날 CEI 평균 (${_eqFmtDate(d.before_date)})`;
  _eqEl('eq-after-lbl').textContent = `다음날 CEI 평균 (${_eqFmtDate(d.after_date)})`;
  _eqEl('eq-delta').innerHTML = _eqDeltaHtml(o.delta);
  _eqEl('eq-scope').textContent =
    `${d.matched}대 · ${o.svc_cnt !== null && o.svc_cnt !== undefined ? o.svc_cnt.toLocaleString() : '—'}명`;
}

// ── 차트 (단일 y축 · 고정 팔레트 · 기준일 마커) ──────────────
const _eqBaseLinePlugin = {
  id: 'eqBaseLine',
  afterDatasetsDraw(chart, args, opts) {
    if (opts.index === null || opts.index === undefined || opts.index < 0) return;
    const x = chart.scales.x.getPixelForValue(opts.index);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(28,43,51,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(28,43,51,0.6)';
    ctx.font = '11px "Noto Sans KR",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('기준일', x, top + 11);
    ctx.restore();
  },
};

function _eqRenderChart(d) {
  _eqEl('eq-chart-empty')?.classList.add('is-hidden');  // 빈 상태 안내 숨김
  const labels = (d.dates || []).map(_eqFmtDate);
  const baseIdx = (d.dates || []).indexOf(d.base_date);

  const datasets = [{
    label: '전체 평균',
    data: d.overall_series || [],
    borderColor: EQ_PALETTE[0],
    backgroundColor: EQ_PALETTE[0],
    borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6,
    tension: 0.3, spanGaps: true,
  }];
  (d.equips || []).slice(0, EQ_MAX_CHART_SERIES).forEach((e, i) => {
    const color = EQ_PALETTE[(i % (EQ_PALETTE.length - 1)) + 1];
    datasets.push({
      label: e.tid || e.equip,
      data: e.series || [],
      borderColor: color, backgroundColor: color,
      borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 6,
      tension: 0.3, spanGaps: true,
    });
  });

  if (_eqChart) _eqChart.destroy();
  _eqChart = new Chart(_eqEl('eq-chart'), {
    type: 'line',
    data: { labels, datasets },
    plugins: [_eqBaseLinePlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        // 범례 클릭 = 해당 라인 표시/숨김 (기본 토글 유지) — 특정 장비만 끄고 볼 수 있게
        legend: {
          position: 'top',
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } },
          onHover: e => { if (e.native?.target) e.native.target.style.cursor = 'pointer'; },
          onLeave: e => { if (e.native?.target) e.native.target.style.cursor = 'default'; },
          onClick: (e, item, legend) => {
            Chart.defaults.plugins.legend.onClick(e, item, legend);
            _eqSyncLegendReset(legend.chart);
          },
        },
        tooltip: { callbacks: { title: items => `통계일 ${items[0].label}` } },
        eqBaseLine: { index: baseIdx },
      },
      scales: {
        y: { title: { display: true, text: 'CEI 평균' }, grace: '5%' },
        x: { grid: { display: false } },
      },
    },
  });
  _eqSyncLegendReset(_eqChart);   // 새 차트는 전부 표시 상태 → 리셋 칩 숨김
}

// ── 범례 숨김 상태 ↔ "모든 라인 표시" 리셋 칩 동기화 ─────────
function _eqSyncLegendReset(chart) {
  const btn = _eqEl('eq-legend-reset');
  if (!btn || !chart) return;
  btn.hidden = !chart.data.datasets.some((ds, i) => !chart.isDatasetVisible(i));
}

_eqEl('eq-legend-reset')?.addEventListener('click', () => {
  if (!_eqChart) return;
  _eqChart.data.datasets.forEach((ds, i) => _eqChart.setDatasetVisibility(i, true));
  _eqChart.update();
  _eqSyncLegendReset(_eqChart);
});

// ── 장비별 개선 전후 비교 표 ─────────────────────────────────
function _eqEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Bad 가입자수 변화 — CEI 와 반대로 "감소"가 개선(녹색)
function _eqBadDeltaHtml(v) {
  if (v === null || v === undefined) return '—';
  const color = v < 0 ? 'var(--grade-b)' : v > 0 ? 'var(--red)' : 'var(--text-secondary)';
  const sign = v > 0 ? '+' : '';
  return `<span style="color:${color};font-weight:700">${sign}${v.toLocaleString()}</span>`;
}

function _eqRenderTable(d) {
  _eqRows = d.compare_rows || [];
  _eqTail = [];
  if (d.compare_truncated) {
    _eqTail.push(`<tr><td colspan="11" class="ops-empty">가입자수 상위 ${_eqRows.length}대만 표시 (${d.compare_truncated}대 생략)</td></tr>`);
  }
  if (d.compare_error) {
    _eqTail.push(`<tr><td colspan="11" class="ops-empty">전후 비교 표 집계 실패: ${_eqEsc(d.compare_error)}</td></tr>`);
  }
  // 새 조회마다 기본 정렬(가입자수 내림차순)로 복귀 — 검색·칩 필터는 유지
  _eqSortKey = 'svc_cnt';
  _eqSortDir = -1;
  _eqApplyTable();
}

// ── 정렬/필터 상태 반영 재렌더 (데이터 재조회 없음) ──────────
const _EQ_STR_KEYS = new Set(['tpo_nm', 'equip_mgmt_num', 'tid']);
const _EQ_GRADE_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4 };   // 등급변화 정렬 = 개선후 등급 순

function _eqSortVal(r, key) {
  if (key === 'grade_chg') {
    const rank = _EQ_GRADE_RANK[r.after_grade];
    return rank === undefined ? null : rank;
  }
  const v = r[key];
  return v === undefined ? null : v;
}

function _eqRowHtml(r) {
  const fmt = v => (v === null || v === undefined) ? '—' : v.toFixed(2);
  const num = v => (v === null || v === undefined) ? '—' : v.toLocaleString();
  return `<tr>
      <td style="text-align:left">${_eqEsc(r.tpo_nm) || '—'}</td>
      <td style="text-align:left">${_eqEsc(r.equip_mgmt_num) || '—'}</td>
      <td style="text-align:left" title="${_eqEsc(r.equip_nm)}">${_eqEsc(r.tid) || '—'}</td>
      <td style="text-align:right">${num(r.svc_cnt)}</td>
      <td style="text-align:right">${fmt(r.before)}</td>
      <td style="text-align:right">${fmt(r.after)}</td>
      <td style="text-align:right">${_eqDeltaHtml(r.delta)}</td>
      <td style="text-align:right">${num(r.bad_before)}</td>
      <td style="text-align:right">${num(r.bad_after)}</td>
      <td style="text-align:right">${_eqBadDeltaHtml(r.bad_delta)}</td>
      <td style="text-align:left">${_eqGradeHtml(r.before_grade)} → ${_eqGradeHtml(r.after_grade)}</td>
    </tr>`;
}

function _eqApplyTable() {
  const body = _eqEl('eq-tbl-body');
  if (!body) return;

  // 헤더 정렬 표시 (↑↓) — master-table 과 동일 문법
  document.querySelectorAll('#eq-tbl .mt-th').forEach(th => {
    const active = th.dataset.sort === _eqSortKey;
    th.classList.toggle('sort-asc',  active && _eqSortDir === 1);
    th.classList.toggle('sort-desc', active && _eqSortDir === -1);
    th.setAttribute('aria-sort', active ? (_eqSortDir === 1 ? 'ascending' : 'descending') : 'none');
  });

  const countEl = _eqEl('eq-count');
  if (!_eqRows.length) {                       // 조회 전 — 초기 빈 상태 유지
    if (countEl) countEl.textContent = '';
    return;
  }

  // 1) 텍스트 검색 (국소명/관리번호/TID/장비명) + 2) 빠른 필터 칩
  const q = _eqSearchText.trim().toLowerCase();
  let rows = _eqRows.filter(r => {
    if (q && !['tpo_nm', 'equip_mgmt_num', 'tid', 'equip_nm']
        .some(k => String(r[k] ?? '').toLowerCase().includes(q))) return false;
    if (_eqQuickFilter === 'improved') return r.delta !== null && r.delta !== undefined && r.delta > 0;
    if (_eqQuickFilter === 'worse')    return r.delta !== null && r.delta !== undefined && r.delta < 0;
    if (_eqQuickFilter === 'bad-down') return r.bad_delta !== null && r.bad_delta !== undefined && r.bad_delta < 0;
    return true;
  });

  // 3) 정렬 — 문자열 locale, 숫자 수치, null 은 방향과 무관하게 항상 마지막
  const isStr = _EQ_STR_KEYS.has(_eqSortKey);
  rows = rows.slice().sort((a, b) => {
    const va = _eqSortVal(a, _eqSortKey);
    const vb = _eqSortVal(b, _eqSortKey);
    const ea = va === null || va === '';
    const eb = vb === null || vb === '';
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    const cmp = isStr ? String(va).localeCompare(String(vb), 'ko') : (va - vb);
    return cmp * _eqSortDir;
  });

  if (countEl) countEl.textContent = `${rows.length.toLocaleString()} / ${_eqRows.length.toLocaleString()}대`;
  body.innerHTML = (rows.map(_eqRowHtml).join('') ||
    '<tr><td colspan="11" class="ops-empty">검색/필터 조건에 맞는 장비가 없습니다</td></tr>') + _eqTail.join('');
}

// ── 미매칭 안내 — 사유별 요약 + "자세히" 전체 목록 ───────────
// reason: similar = DB 표기와 prefix 관계인 유사값 존재 (표기 차이 의심)
//         no-data = 조회 윈도(최근 N일) 안에 흔적 없음 (윈도 밖 조치·건물 탈락 등)
const _EQ_UM_REASON = { similar: '표기 차이 의심', 'no-data': '조회기간 내 없음' };

function _eqRenderUnmatched(d) {
  const line = _eqEl('eq-unmatched');
  const sum = _eqEl('eq-unmatched-sum');
  const toggle = _eqEl('eq-unmatched-toggle');
  const detail = _eqEl('eq-unmatched-detail');
  if (!line || !sum) return;
  const un = d.unmatched || [];
  const mi = d.matched_ids || [];
  // 중복 = 업로드 값 중 매칭됐지만 이미 잡힌 장비와 같은 장비라 합쳐진 건
  // (동일 값 재업로드, 관리번호+TID 병기)
  const nDup = d.requested != null ? Math.max(0, d.requested - mi.length - un.length) : 0;
  if (!un.length && !nDup) {
    line.hidden = true;
    if (detail) { detail.hidden = true; detail.innerHTML = ''; }
    if (toggle) { toggle.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    return;
  }
  const det = d.unmatched_detail || [];
  const nSim = det.filter(x => x.reason === 'similar').length;
  const dupTxt = nDup ? ` · 중복 ${nDup}` : '';
  // 요약 — 업로드 전체 대비 매칭/중복/미매칭 수 (매칭 목록은 [자세히]에)
  sum.textContent = (det.length || !un.length)
    ? `업로드 ${d.requested ?? (mi.length + un.length)}건 — 매칭 ${mi.length}${dupTxt} · 미매칭 ${un.length}`
      + (det.length ? ` (표기 차이 의심 ${nSim} · 조회기간 내 없음 ${det.length - nSim})` : '')
    : `미매칭 ${un.length}건${dupTxt ? ` (매칭 ${mi.length}${dupTxt})` : ''} — ${un.slice(0, 5).join(', ')}${un.length > 5 ? ` 외 ${un.length - 5}건` : ''}`;
  line.title = un.join(', ')
    + (nDup ? `${un.length ? '\n' : ''}중복 ${nDup}건: 같은 장비를 가리키는 업로드 값(동일 값·관리번호+TID 병기)이 한 장비로 합산됨` : '');
  line.hidden = false;
  if (toggle) {
    toggle.hidden = !det.length;
    toggle.textContent = '자세히';
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (detail) {
    detail.hidden = true;   // 새 조회마다 접힌 상태로 시작
    const matchedBlock = mi.length
      ? `<div class="eq-um-sec">매칭 ${mi.length}건</div>
         <div class="eq-um-matched">${mi.map(_eqEsc).join(', ')}</div>`
      : '';
    const unBlock = `<div class="eq-um-sec">미매칭 ${un.length}건</div>`
      + det.map(x => `<div class="eq-um-row">
        <span class="eq-um-id">${_eqEsc(x.id)}</span>
        <span class="eq-um-reason${x.reason === 'similar' ? '' : ' is-nodata'}">${_EQ_UM_REASON[x.reason] || _eqEsc(x.reason)}</span>
        ${x.similar ? `<span class="eq-um-sim">DB 표기: ${_eqEsc(x.similar)}</span>` : ''}
      </div>`).join('');
    detail.innerHTML = matchedBlock + unBlock;
  }
}

_eqEl('eq-unmatched-toggle')?.addEventListener('click', () => {
  const detail = _eqEl('eq-unmatched-detail');
  const toggle = _eqEl('eq-unmatched-toggle');
  if (!detail || !toggle) return;
  const open = detail.hidden;
  detail.hidden = !open;
  toggle.textContent = open ? '접기' : '자세히';
  toggle.setAttribute('aria-expanded', String(open));
});

// ── 표 도구 배선 — 정렬 헤더(클릭/Enter/Space)·검색(debounce)·칩·다운로드 ──
(function _eqInitTableTools() {
  const onSort = th => {
    const key = th.dataset.sort;
    if (!key) return;
    if (_eqSortKey === key) _eqSortDir = -_eqSortDir;
    else { _eqSortKey = key; _eqSortDir = 1; }
    _eqApplyTable();
  };
  document.querySelectorAll('#eq-tbl .mt-th').forEach(th => {
    th.addEventListener('click', () => onSort(th));
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(th); }
    });
  });

  const search = _eqEl('eq-search');
  if (search) {
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { _eqSearchText = search.value; _eqApplyTable(); }, 200);
    });
  }

  document.querySelectorAll('[data-eq-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      _eqQuickFilter = chip.dataset.eqFilter;
      document.querySelectorAll('[data-eq-filter]')
        .forEach(c => c.classList.toggle('active', c === chip));
      _eqApplyTable();
    });
  });

  _eqEl('eq-export')?.addEventListener('click', equipExport);
})();
