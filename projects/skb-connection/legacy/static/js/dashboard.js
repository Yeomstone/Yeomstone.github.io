/* ============================================================
   C-One Agent — Dashboard JS
   ============================================================ */

// ── 테마 토큰 (theme.css :root 변수 경유 — 색상 하드코딩 금지) ──
function themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const CHART_BLUE   = themeVar('--chart-blue',   '#4C68D7');
const CHART_TEAL   = themeVar('--chart-teal',   '#2BB8A8');
const CHART_PURPLE = themeVar('--chart-purple', '#8B5CF6');
const CHART_RED    = themeVar('--status-high',  '#E41E3F');
const CHART_TICK   = themeVar('--text-tertiary','#8A8D91');
const CHART_TEXT   = themeVar('--text-secondary','#65676B');
const CHART_GRID   = themeVar('--chart-grid', 'rgba(28,43,51,0.06)');
const SEM_GOOD     = themeVar('--sem-good', '#1E7A35');
const SEM_BAD      = themeVar('--sem-bad',  '#C4183C');
/** #RRGGBB → rgba(r,g,b,a) — 차트 fill 용 */
function chartAlpha(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  return m ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})` : hex;
}

// ── 차트 공통 스타일 (theme.css 토큰과 동일 계열) ────────────
if (window.Chart) {
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CHART_TEXT;
  Chart.defaults.borderColor = CHART_GRID;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 4;
}

// ── 공통 유틸리티 ────────────────────────────────────────────
/** 디바운스: 마지막 호출 후 wait ms 뒤에 fn 실행 */
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** ID로 요소를 찾아 캐시 (반복 getElementById 방지) */
const _el = (() => {
  const cache = {};
  return id => cache[id] || (cache[id] = document.getElementById(id));
})();

/** CSS 상태 색상 (변수 기반) */
const STATUS_COLOR = { critical: 'var(--red)', warning: 'var(--orange)', normal: 'var(--green)' };
const STATUS_LABEL = { critical: '위험', warning: '주의', normal: '정상' };

/** 지시서(workitem) FSM 상태 표기 — 장비/점검·조치/작업 탭 공용 (중복 3정의 병합) */
const WORKITEM_STATUS_META = {
  issued:   { label: '발행',     cls: 'st-issued' },
  resolved: { label: '조치완료', cls: 'st-resolved' },
  verified: { label: '검증완료', cls: 'st-verified' },
  dropped:  { label: '중단',     cls: 'st-dropped' },
};

/** 차트 Y축 옵션 — 값에 0이 포함되면 0 고정, 아니면 자동 스케일(음수 눈금 숨김) */
function _yScaleAuto(values) {
  const hasZero = (values || []).some(v => Number(v) === 0);
  const opts = {
    grace: '20%',
    ticks: {
      color: CHART_TICK, font: { size: 9 }, precision: 0,
      callback: v => (v < 0 ? '' : v),
    },
    grid: { color: CHART_GRID },
  };
  if (hasZero) { opts.beginAtZero = true; opts.min = 0; }
  return opts;
}

// ── KPI 스파크라인 ───────────────────────────────────────────
function drawSparklines() {
  document.querySelectorAll('.kpi-spark').forEach(canvas => {
    const key    = canvas.dataset.key;
    const isGood = canvas.dataset.good === 'true';
    const spark  = (window.KPI_SPARK || {})[key];
    if (!spark || !spark.spark) return;
    const vals  = spark.spark;
    const last  = vals[vals.length - 1];
    const prev  = vals[vals.length - 2];
    const up    = last >= prev;
    const color = isGood ? 'var(--green)' : (up ? 'var(--green)' : 'var(--red)');
    const hex   = isGood ? SEM_GOOD : (up ? SEM_GOOD : SEM_BAD);
    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: vals.map(() => ''),
        datasets: [{ data: vals, borderColor: hex, borderWidth: 1.5,
          fill: true, backgroundColor: hex + '22',
          pointRadius: 0, tension: 0.4 }],
      },
      options: {
        animation: false, responsive: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  });
}
document.addEventListener('DOMContentLoaded', drawSparklines);

// ── 좌측 패널 접기/펼치기 ─────────────────────────────────────
function toggleLeftPanel() {
  const panel = document.querySelector('.left-panel');
  const grid  = document.querySelector('.main-grid');
  const btn   = document.getElementById('left-panel-collapse-btn');
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  if (grid) grid.classList.toggle('left-collapsed', collapsed);
  if (btn) btn.title = collapsed ? '패널 펼치기' : '패널 접기';
}

// ── 우측 패널 접기/펼치기 ────────────────────────────────────
function toggleRightPanel() {
  const panel = document.querySelector('.right-panel');
  const btn   = document.getElementById('panel-collapse-btn');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  if (btn) btn.title = panel.classList.contains('collapsed') ? '패널 펼치기' : '패널 접기';
}

function _rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function _setupMapOverlayDraggable({
  targetSelector,
  handleSelector,
  containerSelector = '.map-wrap',
  ignoreSelector = '',
  dragZoneTopPx = 0,
}) {
  const target = document.querySelector(targetSelector);
  const handle = document.querySelector(handleSelector);
  const container = document.querySelector(containerSelector);
  if (!target || !handle || !container) return;

  let dragging = false;
  let moved = false;      // 실제 이동 여부 — 드래그 직후 click(펼침 등) 오발동 방지
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function anchorToTopLeft() {
    const targetRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // 시트의 left/top !important(테마 기본 위치)보다 우선하도록 important 인라인
    target.style.setProperty('left', `${targetRect.left - containerRect.left}px`, 'important');
    target.style.setProperty('top', `${targetRect.top - containerRect.top}px`, 'important');
    target.style.setProperty('right', 'auto', 'important');
    target.style.setProperty('bottom', 'auto', 'important');
    target.dataset.dragAnchored = '1';
  }

  function onStart(e) {
    const pt = e.touches ? e.touches[0] : e;
    if (dragZoneTopPx > 0) {
      const targetRect = target.getBoundingClientRect();
      if ((pt.clientY - targetRect.top) > dragZoneTopPx) return;
    }
    if (ignoreSelector && e.target.closest(ignoreSelector)) return;
    if (!target.offsetParent || window.getComputedStyle(target).display === 'none') return;

    if (target.dataset.dragAnchored !== '1') anchorToTopLeft();
    target.dataset.userMoved = '1';

    dragging = true;
    moved = false;
    startX = pt.clientX;
    startY = pt.clientY;
    startLeft = parseFloat(target.style.left) || 0;
    startTop = parseFloat(target.style.top) || 0;
    target.classList.add('dragging');
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;

    const maxLeft = Math.max(0, container.clientWidth - target.offsetWidth);
    const maxTop = Math.max(0, container.clientHeight - target.offsetHeight);
    const newLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
    const newTop = Math.max(0, Math.min(maxTop, startTop + dy));

    target.style.setProperty('left', `${newLeft}px`, 'important');
    target.style.setProperty('top', `${newTop}px`, 'important');
    e.preventDefault();
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    target.classList.remove('dragging');
    if (moved) {
      // mouseup 직후 발생하는 click 이 펼침/접힘 토글로 이어지지 않게
      target.dataset.justDragged = '1';
      setTimeout(() => { delete target.dataset.justDragged; }, 250);
    }
  }

  handle.classList.add('draggable-handle');
  handle.addEventListener('mousedown', onStart, { passive: false });
  handle.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
}

function _syncMapOverlayDefaultLayout() {
  const mapWrap = document.querySelector('.map-wrap');
  const searchBox = document.getElementById('map-search-box');
  const rightPanel = document.querySelector('.right-panel');
  const zoomStats = document.getElementById('map-zoom-stats');
  if (!mapWrap || !searchBox) return;
  // 검색창이 지도 밖(좌측 패널)에 있으면 겹침 보정 불필요 (0820)
  if (!mapWrap.contains(searchBox)) return;

  const searchRect = searchBox.getBoundingClientRect();
  const mapRect = mapWrap.getBoundingClientRect();
  const minTop = Math.max(0, Math.round(searchRect.bottom - mapRect.top + 8));

  [rightPanel, zoomStats].forEach((panel) => {
    if (!panel) return;
    if (panel.dataset.userMoved === '1') return;
    if (window.getComputedStyle(panel).display === 'none') return;

    const panelRect = panel.getBoundingClientRect();
    const hasOverlap = _rectsOverlap(searchRect, panelRect);

    if (!hasOverlap) {
      if (panel.dataset.autoAdjustedTop === '1') {
        panel.style.top = '';
        panel.dataset.autoAdjustedTop = '0';
      }
      return;
    }

    panel.style.top = `${minTop}px`;
    panel.dataset.autoAdjustedTop = '1';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 검색창은 좌측 패널로 이동(0820) — 지도 오버레이 드래그 대상에서 제외

  _setupMapOverlayDraggable({
    targetSelector: '.right-panel',
    handleSelector: '.right-panel .bld-stat-header',
    ignoreSelector: 'button, input, select, textarea, a',
  });

  _setupMapOverlayDraggable({
    targetSelector: '#map-zoom-stats',
    handleSelector: '#map-zoom-stats',
    ignoreSelector: '.mzs-bld-row, button, input, select, textarea, a',
    dragZoneTopPx: 56,
  });

  _syncMapOverlayDefaultLayout();
  window.addEventListener('resize', _syncMapOverlayDefaultLayout);
});

// ── 오버레이 매니저 (모달/패널 비중첩) ─────────────────────────
const _OVERLAY_MODAL_IDS = ['detail-modal', 'briefing-modal', 'mail-modal', 'sms-modal'];

function _isPanelOpen() {
  const panel = document.getElementById('ai-panel');
  return !!(panel && panel.classList.contains('open'));
}

function _syncOverlayState() {
  const hasModal = _OVERLAY_MODAL_IDS.some(id => document.getElementById(id)?.classList.contains('open'));
  document.body.classList.toggle('ui-modal-open', hasModal);
  document.body.classList.toggle('ui-ai-open', _isPanelOpen());
  document.body.classList.toggle('ui-overlay-active', hasModal || _isPanelOpen());
}

function _closeAllModals(exceptId = null) {
  _OVERLAY_MODAL_IDS.forEach(id => {
    if (id === exceptId) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
}

function _openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;
  _closeAllModals(modalId);
  if (_isPanelOpen()) togglePanel();
  modal.classList.add('open');
  _syncOverlayState();
  return modal;
}

function _closeModalById(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
  _syncOverlayState();
}

// ── Clock ────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  });
}
setInterval(updateClock, 1000);
updateClock();

// ── 현재 선택 시군구 상태 ─────────────────────────────────────
let _selectedGu = null;  // { cd: 'ct_gun_gu_cd', name: 'region name', lat, lng }

function selectGu(gu) {
  _selectedGu = gu;
  loadCeiKpi(gu ? gu.cd : null);
  loadWeather(gu ? gu.cd : null);
  loadBadceTop10();
  _updateKpiLabel(gu);
  // 지도 이동
  if (gu && gu.lat && gu.lng && window._map) {
    window._map.setView([gu.lat, gu.lng], 14);
  } else if (!gu && window._map) {
    window._map.setView([37.5665, 126.978], 12);
  }
  // Bad CE Top 10 행 활성 표시
  document.querySelectorAll('.badce-row').forEach(row => {
    row.classList.toggle('badce-active', gu && row.dataset.gu === gu.cd);
  });
}

function _updateKpiLabel(gu) { _updateContextLabels(gu); }

function _updateContextLabels(gu) {
  // 현재 컨텍스트 결정: 구 선택 > 건물+팀 > 팀 > 전국
  // gu가 명시적으로 선택된 경우 항상 최우선 (건물 선택 상태여도 지역명 표시)
  const activeTeam = _kpiTeamOverride || _selectedTeam;
  const bldName = _currentBuilding ? (_currentBuilding.name || _currentBuilding.building) : null;
  let scope = '전국';
  let isFiltered = false;
  if (gu) {
    scope = gu.name.trim();
    isFiltered = true;
  } else if (bldName && _kpiTeamOverride) {
    scope = _kpiTeamOverride;
    isFiltered = true;
  } else if (activeTeam) {
    scope = activeTeam;
    isFiltered = true;
  }

  // KPI 상단 바 라벨
  const labelEl = document.getElementById('kpi-now-label');
  const resetBtn = document.getElementById('kpi-reset-btn');
  const panel = document.getElementById('kpi-now-panel');
  if (labelEl) labelEl.textContent = isFiltered ? scope : '전국 현황';
  if (resetBtn) resetBtn.style.display = isFiltered ? '' : 'none';
  if (panel) panel.classList.toggle('ds-context--active', isFiltered);

  // Bad CE Top 10 제목 (운용팀까지만 표시, 시군구 단위로 내려가지 않음)
  const badceTitle = document.getElementById('badce-title');
  if (badceTitle) {
    const teamScope = activeTeam || null;
    if (teamScope) {
      badceTitle.innerHTML = `<strong class="badce-scope">${teamScope}</strong><span class="badce-desc">시군구 Bad CE 고객수 Top 10</span>`;
    } else {
      badceTitle.innerHTML = '<span class="badce-desc">전국 시군구 Bad CE 고객수 Top 10</span>';
    }
  }

  // 마스터시트 제목
  const msTitle = document.getElementById('master-sheet-title');
  if (msTitle) {
    if (isFiltered) {
      msTitle.innerHTML = `<strong style="color:var(--color-text-1);font-weight:800">${scope}</strong> <span style="color:var(--color-text-3)">주의/Bad CE 건물 (Top50)</span>`;
    } else {
      msTitle.innerHTML = '<span style="color:var(--color-text-3)">전국 주의/Bad CE 건물 (Top50)</span>';
    }
  }

}

// ── 시군구 Bad CE Top 10 — loadBadceTop10()로 대체됨 (아래 정의) ──

function onBadceRowClick(el) {
  const cd = el.dataset.gu;
  const name = el.dataset.name;
  const lat = parseFloat(el.dataset.lat);
  const lng = parseFloat(el.dataset.lng);
  if (!cd) return;
  // 같은 것 다시 클릭 → 전체현황으로
  if (_selectedGu && _selectedGu.cd === cd) {
    selectGu(null);
  } else {
    selectGu({ cd, name, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng });
    mzsToggle(false); // 지역 선택 시 접힌 지역현황 패널도 펼침 (0820 피드백)
  }
}

// Top10 행 [현황] 버튼 — 해당 지역으로 이동 + 접힌 지역현황 패널 펼침 (0820)
function badceOpenStats(btn) {
  const row = btn.closest('.badce-row');
  if (!row) return;
  const cd = row.dataset.gu;
  // 아직 선택 안 된 지역이면 먼저 선택(지도 이동) — 재클릭 해제 로직은 타지 않게
  if (cd && (!_selectedGu || _selectedGu.cd !== cd)) onBadceRowClick(row);
  mzsToggle(false);
}

// ── 현재 선택 팀 ──────────────────────────────────────────────
let _selectedTeam = null;
let _kpiTeamOverride = null; // 건물 선택 시 KPI 바 전용 팀 필터
let _kpiDAlerted = false;    // D등급 증가 펄스 — 페이지 로드당 1회만 (필터 변경 재로드에 반복 금지)

function resetAllFilters() {
  _selectedTeam = null;
  _kpiTeamOverride = null;
  const sel = document.getElementById('team-select');
  if (sel) sel.value = '';
  selectGu(null);
}

function onTeamChange(val) {
  _selectedTeam = val || null;
  _kpiTeamOverride = null;
  _currentBuilding = null;
  _selectedGu = null;
  loadCeiKpi(null);
  loadWeather(null);
  loadBadceTop10();
  _reloadBuildingsWithFilter();
  _updateKpiLabel(null);
}

function _reloadBuildingsWithFilter() {
  const teamParam = _selectedTeam ? `&team=${encodeURIComponent(_selectedTeam)}` : '';
  fetch(`${BASE_PATH}/api/buildings-data?limit=0${teamParam}`)
    .then(r => r.json())
    .then(buildings => {
      if (!window._map || !window._markerGroup) return;
      // 기존 마커 정리
      window._markerGroup.clearLayers();
      window._buildingMarkers = {};
      window._buildingData = buildings;

      // 뷰포트 기반 마커 재생성
      const zoom = window._map.getZoom();
      if (zoom >= 12) {
        const bounds = window._map.getBounds();
        const visible = buildings.filter(b =>
          b.lat >= bounds.getSouth() && b.lat <= bounds.getNorth() &&
          b.lng >= bounds.getWest()  && b.lng <= bounds.getEast()
        );
        const maxM = zoom >= 15 ? 1500 : 400;   // 줌 낮을 때 보수적 상한 (0820)
        let toShow = visible;
        if (visible.length > maxM) {
          const crit = visible.filter(b => b.status === 'critical');
          const warn = visible.filter(b => b.status === 'warning');
          const norm = visible.filter(b => b.status === 'normal');
          toShow = [...crit, ...warn];
          const remain = maxM - toShow.length;
          if (remain > 0) toShow = [...toShow, ...norm.slice(0, remain)];
          else toShow = toShow.slice(0, maxM);
        }
        toShow.forEach(b => {
          const marker = L.marker([b.lat, b.lng], { icon: makeBuildingIcon(b, zoom) });
          marker.on('click', () => {
            highlightMarker(b.bld_cd);
            selectBuilding({ id: b.bld_cd, name: b.bld_nm, cei: b.cei_avg,
              region: (b.province || '') + ' ' + (b.region || ''),
              status: b.status, cust_cnt: b.cust_cnt });
            const targetZoom = Math.max(window._map.getZoom(), 14);
            window._map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.5, easeLinearity: 0.5 });
          });
          window._markerGroup.addLayer(marker);
          window._buildingMarkers[b.bld_cd] = marker;
        });
        _applyMarkerFilter();
      }
      updateZoomStats(window._map, buildings);

      // 팀 선택 시 해당 건물 영역 중심으로 zoom 13 고정
      if (_selectedTeam && buildings.length > 0) {
        const lats = buildings.map(b => b.lat).filter(Boolean);
        const lngs = buildings.map(b => b.lng).filter(Boolean);
        if (lats.length && lngs.length) {
          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          window._map.flyTo([centerLat, centerLng], 13, { duration: 0.8 });
        }
      } else if (!_selectedTeam) {
        window._map.flyTo([37.5665, 126.978], 12, { duration: 0.8 });
      }
    })
    .catch(e => console.error('건물 필터 실패', e));
}

// ── 팀 드롭다운 로드 ──────────────────────────────────────────
(function loadTeams(attempt) {
  const sel = document.getElementById('team-select');
  if (!sel) return;
  fetch(`${BASE_PATH}/api/teams`)
    .then(r => r.json())
    .then(d => {
      const teams = d.teams || [];
      // 서버 부팅 중(데이터 적재 전)에 열면 빈 목록이 온다 — 채워질 때까지
      // 재시도 (0820: '전체 팀'만 남던 문제). 성공 시에만 옵션 추가 → 중복 없음.
      if (!teams.length && (attempt || 0) < 60) {
        setTimeout(() => loadTeams((attempt || 0) + 1), 3000);
        return;
      }
      teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });
      _buildTeamDropdown();
    })
    .catch(() => {
      if ((attempt || 0) < 60) setTimeout(() => loadTeams((attempt || 0) + 1), 5000);
      else _buildTeamDropdown();
    });
})(0);

// ── 커스텀 팀 드롭다운 ────────────────────────────────────────
function _buildTeamDropdown() {
  const wrap = document.getElementById('map-team-filter');
  const sel = document.getElementById('team-select');
  const list = document.getElementById('team-filter-list');
  const valueEl = document.getElementById('team-filter-value');
  if (!wrap || !sel || !list || !valueEl) return;

  list.innerHTML = '';
  Array.from(sel.options).forEach(opt => {
    const li = document.createElement('li');
    li.className = 'team-filter-item';
    li.setAttribute('role', 'option');
    li.dataset.value = opt.value;
    li.textContent = opt.textContent;
    if (opt.value === sel.value) {
      li.setAttribute('aria-selected', 'true');
    }
    list.appendChild(li);
  });
  valueEl.textContent = (sel.options[sel.selectedIndex]?.textContent) || '전체 팀';
}

function _closeTeamDropdown() {
  const wrap = document.getElementById('map-team-filter');
  const dd = document.getElementById('team-filter-dropdown');
  if (!wrap || !dd) return;
  dd.hidden = true;
  wrap.setAttribute('aria-expanded', 'false');
  wrap.classList.remove('is-open');
}

function _openTeamDropdown() {
  const wrap = document.getElementById('map-team-filter');
  const dd = document.getElementById('team-filter-dropdown');
  if (!wrap || !dd) return;
  dd.hidden = false;
  wrap.setAttribute('aria-expanded', 'true');
  wrap.classList.add('is-open');
  const cur = dd.querySelector('[aria-selected="true"]');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('map-team-filter');
  const dd = document.getElementById('team-filter-dropdown');
  const sel = document.getElementById('team-select');
  const list = document.getElementById('team-filter-list');
  if (!wrap || !dd || !sel || !list) return;

  wrap.addEventListener('click', (e) => {
    // 항목 클릭은 아래 list 핸들러가 처리
    if (e.target.closest('#team-filter-dropdown')) return;
    if (dd.hidden) _openTeamDropdown(); else _closeTeamDropdown();
  });

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (dd.hidden) _openTeamDropdown(); else _closeTeamDropdown();
    } else if (e.key === 'Escape') {
      _closeTeamDropdown();
    }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('.team-filter-item');
    if (!li) return;
    e.stopPropagation();
    const val = li.dataset.value || '';
    if (sel.value !== val) {
      sel.value = val;
      sel.dispatchEvent(new Event('change'));
    }
    list.querySelectorAll('[aria-selected="true"]').forEach(x => x.removeAttribute('aria-selected'));
    li.setAttribute('aria-selected', 'true');
    const valueEl = document.getElementById('team-filter-value');
    if (valueEl) valueEl.textContent = li.textContent;
    _closeTeamDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!dd.hidden && !wrap.contains(e.target)) _closeTeamDropdown();
  });

  // 외부에서 select.value 가 바뀌었을 때 (예: resetAllFilters) 표시 동기화
  const syncLabel = () => {
    const valueEl = document.getElementById('team-filter-value');
    if (valueEl) valueEl.textContent = (sel.options[sel.selectedIndex]?.textContent) || '전체 팀';
    list.querySelectorAll('[aria-selected="true"]').forEach(x => x.removeAttribute('aria-selected'));
    const cur = list.querySelector(`.team-filter-item[data-value="${CSS.escape(sel.value)}"]`);
    if (cur) cur.setAttribute('aria-selected', 'true');
  };
  sel.addEventListener('change', syncLabel);
});

// ── 숫자 롤링 애니메이션 ─────────────────────────────────────
function _animateValue(el, newText, duration = 400) {
  if (!el) return;
  const oldText = el.textContent.trim();
  if (oldText === newText || oldText === '—') { el.textContent = newText; return; }

  // 숫자 추출 시도 (예: "82.4", "16.2만", "0.09", "1,325")
  const parseNum = s => {
    const m = s.replace(/,/g, '').match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };
  const oldNum = parseNum(oldText);
  const newNum = parseNum(newText);

  // 숫자가 아니면 페이드 전환
  if (oldNum == null || newNum == null || oldNum === newNum) {
    el.style.transition = 'opacity 0.15s';
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = newText; el.style.opacity = '1'; }, 150);
    return;
  }

  // 접미사 추출 (만, 건, 명 등)
  const suffix = newText.replace(/[\d.,\s]+/, '');
  const decimals = newText.includes('.') ? (newText.match(/\.(\d+)/) || [,''])[1].length : 0;
  const hasComma = newText.includes(',');

  const start = performance.now();
  const diff = newNum - oldNum;

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const cur = oldNum + diff * ease;
    let display = decimals > 0 ? cur.toFixed(decimals) : Math.round(cur).toString();
    if (hasComma) display = Number(display).toLocaleString();
    el.textContent = display + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── CEI KPI 비동기 로드 ───────────────────────────────────────
function _buildKpiUrl(guCd) {
  const params = [];
  if (guCd) params.push(`gu=${guCd}`);
  const team = _kpiTeamOverride || _selectedTeam;
  if (team) params.push(`team=${encodeURIComponent(team)}`);
  return `${BASE_PATH}/api/cei-kpi` + (params.length ? '?' + params.join('&') : '');
}

function _renderDelta(id, delta, dir, isGoodUp) {
  const el = document.getElementById(id);
  if (!el || delta == null) { if (el) el.textContent = ''; return; }
  const sign  = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const good  = isGoodUp ? dir === 'up' : dir === 'down';
  const newText = `${arrow} ${sign}${delta}`;
  const base = el.classList.contains('ds-grade-delta') ? 'ds-grade-delta' : 'ds-card-delta';
  el.className = base + ' ' + (good ? 'kpi-delta--good' : delta === 0 ? '' : 'kpi-delta--bad');
  _animateValue(el, newText, 350);
}

function loadCeiKpi(guCd) {
  function _set(id, val) {
    _animateValue(document.getElementById(id), String(val));
  }
  const url = _buildKpiUrl(guCd);
  function _tryLoad() {
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (!d.ready) { setTimeout(_tryLoad, 3000); return; }

        // CEI 평균 — 등급색 + 등급 문자 칩 (공용 ceiGradeOf 기준)
        const ceiEl = document.getElementById('kpi-cei-avg');
        if (ceiEl) {
          _animateValue(ceiEl, parseFloat(d.cei_avg).toFixed(2));
          const v = parseFloat(d.cei_avg);
          const g = window.ceiGradeOf(v);
          ceiEl.className = 'ds-card-value' + (g ? ` kpi-grade-${g.toLowerCase()}` : '');
          // 숫자 바로 앞 등급 문자 칩 — _animateValue가 값만 덮으므로 형제 요소로
          let gEl = document.getElementById('kpi-cei-grade');
          if (!gEl) {
            gEl = document.createElement('span');
            gEl.id = 'kpi-cei-grade';
            ceiEl.parentElement.insertBefore(gEl, ceiEl);
          }
          gEl.className = g ? `cei-chip-g cei-chip-g--lg cei-g-${g.toLowerCase()}` : '';
          gEl.textContent = g || '';
        }
        _set('kpi-s',     d.s_fmt);
        _set('kpi-a',     d.a_fmt);
        _set('kpi-b',     d.b_fmt);
        _set('kpi-c',     d.c_fmt);
        _set('kpi-d',     d.d_fmt);
        _set('kpi-voc',   d.voc_fmt);
        _set('kpi-work',  d.work_fmt);
        _set('kpi-fault', d.fault_fmt);

        // 가입자수
        if (d.svc_fmt) _set('kpi-svc', d.svc_fmt);

        // 날짜 포맷 헬퍼
        const _fmtDt = s => s && s.length === 8
          ? s.slice(4,6)+'/'+s.slice(6,8)
          : (s || '');

        // 전일/전주 델타 렌더 헬퍼
        // ceiHighGood=true → 올라가면 좋음(초록), false → 올라가면 나쁨(빨강)
        function _renderDelta2(dayId, weekId, dDay, dirDay, dWeek, dirWeek, highGood, prevDayStr, prevWeekStr) {
          const fmtVal = v => v == null ? '' : (v > 0 ? `+${v}` : String(v));
          const arrow  = v => v > 0 ? '▲' : v < 0 ? '▼' : '';
          const cls    = (dir, hg) => dir === 'up'   ? (hg ? 'kpi-delta--good' : 'kpi-delta--bad')
                                    : dir === 'down'  ? (hg ? 'kpi-delta--bad'  : 'kpi-delta--good')
                                    : '';
          const dayEl  = document.getElementById(dayId);
          const weekEl = document.getElementById(weekId);
          if (dayEl) {
            dayEl.innerHTML = dDay != null
              ? `<span class="kpi-delta-tag ${cls(dirDay, highGood)}">${arrow(dDay)}${fmtVal(dDay)}</span><span class="kpi-delta-lbl">전일</span>`
              : '';
          }
          if (weekEl) {
            weekEl.innerHTML = dWeek != null
              ? `<span class="kpi-delta-tag ${cls(dirWeek, highGood)}">${arrow(dWeek)}${fmtVal(dWeek)}</span><span class="kpi-delta-lbl">전주</span>`
              : '';
          }
        }

        // CEI — 올라가면 좋음
        _renderDelta2('kpi-cei-delta-day', 'kpi-cei-delta-week',
          d.cei_delta_day, d.cei_dir_day, d.cei_delta_week, d.cei_dir_week,
          true, d.prev_day_str, d.prev_week_str);

        // 가입자수 — 올라가면 좋음
        _renderDelta2('kpi-svc-delta-day', 'kpi-svc-delta-week',
          d.svc_delta_day, d.svc_dir_day, d.svc_delta_week, d.svc_dir_week,
          true, d.prev_day_str, d.prev_week_str);

        // VoC — 올라가면 나쁨
        _renderDelta2('kpi-voc-delta-day', 'kpi-voc-delta-week',
          d.voc_delta_day, d.voc_dir_day, d.voc_delta_week, d.voc_dir_week,
          false, d.prev_day_str, d.prev_week_str);

        // D등급 하위 호환
        if (d.bad_delta_day != null) {
          const el = document.getElementById('kpi-bad-delta');
          if (el) {
            const sign = d.bad_delta_day > 0 ? '+' : '';
            const arrow = d.bad_delta_day > 0 ? '▲' : d.bad_delta_day < 0 ? '▼' : '';
            el.textContent = `${arrow}${sign}${d.bad_delta_day}`;
            el.className = 'ds-grade-delta ' + (d.bad_dir_day === 'down' ? 'kpi-delta--good' : d.bad_dir_day === 'up' ? 'kpi-delta--bad' : '');
          }
          // D등급이 전일보다 늘었으면 D 타일만 은은한 펄스 3회 (화면 플래시 없음)
          if (d.bad_dir_day === 'up' && !_kpiDAlerted) {
            _kpiDAlerted = true;
            const tile = document.querySelector('.ds-grade-letter.ds-grade-d');
            if (tile) {
              tile.classList.add('ds-grade--alert');
              tile.addEventListener('animationend', () => tile.classList.remove('ds-grade--alert'), { once: true });
            }
          }
        }

        // strd_dt 표시 제거됨
      })
      .catch(() => setTimeout(_tryLoad, 5000));
  }
  _tryLoad();
}
// 초기 KPI 로드는 data-status 폴링 후 실행 (아래 _waitForData 참조)

// ── Bad CE Top 10 (팀 필터 연동) ─────────────────────────────
function loadBadceTop10() {
  const container = document.getElementById('badce-list');
  if (!container) return;
  const teamParam = _selectedTeam ? `?team=${encodeURIComponent(_selectedTeam)}` : '';
  fetch(`${BASE_PATH}/api/badce-top10` + teamParam)
    .then(r => r.json())
    .then(d => {
      if (!d.ready) { setTimeout(loadBadceTop10, 3000); return; }
      const list = d.data || [];
      // 값 비례 수평 바 — 1위 = 100% 기준, 1~3위 강조 (0820 재디자인)
      const maxVal = Math.max(...list.map(it =>
        it.bad_rate !== undefined ? it.bad_rate : it.bad_cnt), 0.0001);
      container.innerHTML = list.map((item, idx) => {
        const rank = idx + 1;
        const val = item.bad_rate !== undefined ? item.bad_rate : item.bad_cnt;
        const rateStr = item.bad_rate !== undefined ? item.bad_rate.toFixed(2) + '%' : item.bad_cnt.toLocaleString();
        const barPct = Math.max(3, val / maxVal * 100).toFixed(1);
        // 재렌더 시 선택 지역 하이라이트 복원 — selectGu()가 목록을 다시 부르므로 여기서 복원해야 유지됨
        const isActive = typeof _selectedGu !== 'undefined' && _selectedGu && _selectedGu.cd === (item.ct_gun_gu_cd || '');
        const rowClass = `badce-row${rank === 1 ? ' rank-1' : ''}${rank <= 3 ? ' badce-top3' : ''}${isActive ? ' badce-active' : ''}`;
        return `<div class="${rowClass}" data-gu="${item.ct_gun_gu_cd || ''}" data-lat="${item.lat || ''}" data-lng="${item.lng || ''}" data-name="${item.region}" onclick="onBadceRowClick(this)">
          <span class="badce-rank-badge${rank <= 3 ? ' top3' : ''}">${rank}</span>
          <span class="badce-main">
            <span class="badce-line"><span class="badce-region">${item.region}</span><span class="badce-val">${rateStr}</span></span>
            <span class="badce-track" aria-hidden="true"><i class="badce-fill" style="width:${barPct}%"></i></span>
          </span>
          <button class="badce-stats-btn" onclick="event.stopPropagation(); badceOpenStats(this)"
                  title="이 지역으로 이동해 지역현황 열기">현황</button>
        </div>`;
      }).join('');
    })
    .catch(() => setTimeout(loadBadceTop10, 5000));
}
// 초기 Bad CE Top10 로드는 data-status 폴링 후 실행

// ── data-status 폴링: Trino 데이터 로딩 완료 대기 후 전체 갱신 ──
let _dataReady = false;
function _waitForData() {
  fetch(`${BASE_PATH}/api/data-status`)
    .then(r => r.json())
    .then(d => {
      if (d.tot_ready) {
        _dataReady = true;
        document.querySelectorAll('.data-loading-msg').forEach(el => el.remove());
        loadCeiKpi(null);
        loadBadceTop10();
        loadWeather(null);
        _reloadBuildingsWithFilter();
      } else {
        setTimeout(_waitForData, 3000);
      }
    })
    .catch(() => setTimeout(_waitForData, 5000));
}
_waitForData();

// ── LLM 상태 체크 (페이지 로드 시) ────────────────────────────
fetch(`${BASE_PATH}/api/llm-status`)
  .then(r => r.json())
  .then(s => {
    console.group('[LLM Status] 페이지 로드');
    console.log('ready:', s.ready);
    console.log('openai_installed:', s.openai_installed);
    console.log('api_type:', s.api_type);
    console.log('api_base:', s.api_base);
    console.log('api_version:', s.api_version);
    console.log('api_key_set:', s.api_key_set);
    console.log('api_key_prefix:', s.api_key_prefix);
    console.log('deployment:', s.deployment);
    if (!s.ready) console.warn('LLM NOT READY — api_key/api_base/api_version 확인 필요');
    console.groupEnd();
  })
  .catch(e => console.error('[LLM Status] 조회 실패:', e));

// ── Weekly Weather ────────────────────────────────────────────
function loadWeather(guCd) {
  const container = document.getElementById('weather-days');
  if (!container) return;

  const params = [];
  if (guCd) params.push(`gu=${guCd}`);
  const wTeam = _kpiTeamOverride || _selectedTeam;
  if (wTeam) params.push(`team=${encodeURIComponent(wTeam)}`);
  const url = `${BASE_PATH}/api/weekly-weather` + (params.length ? '?' + params.join('&') : '');
  fetch(url)
    .then(r => r.json())
    .then(resp => {
      if (resp.error || !resp.data || !resp.data.length) {
        container.innerHTML = '<span class="weather-loading">CEI 데이터 없음</span>';
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const series = (resp.data || []).slice(-7);

      // 데이터 변경 시 전체 재렌더링 (스파크라인 포함)
      const existingTiles = container.querySelectorAll('.ws-day');
      if (existingTiles.length === series.length) {
        container.innerHTML = '';
      }

      function _ceiCardColor(v) {
        if (v == null) return CHART_TICK;
        if (v >= 85) return themeVar('--text-primary', '#1C2B33');   // 정상 — 중립 잉크 (색은 주의/위험만)
        if (v >= 80) return GRADE_COLOR.C;
        return SEM_BAD;
      }

      function _miniSparkSvg(data, idx, color, ceiStr, trendHtml) {
        return `<div class="ws-day-spark-wrap">
          <div class="ws-spark-inner">
            <span class="ws-spark-val" style="color:${color}">${ceiStr}</span>
            ${trendHtml}
          </div>
        </div>`;
      }

      container.innerHTML = series.map((d, idx) => {
        const isToday = d.date === today;
        const wdClass = d.weekday === '토' ? 'sat' : d.weekday === '일' ? 'sun' : '';
        const ceiStr  = d.cei != null ? d.cei.toFixed(2) : '—';
        const currentCei = d.cei != null ? Number(d.cei) : null;
        const prev = idx > 0 ? series[idx - 1] : null;
        const prevCei = prev && prev.cei != null ? Number(prev.cei) : null;
        const color = _ceiCardColor(currentCei);

        let trendIcon = '';
        let trendClass = 'ws-day-trend--flat';
        let trendText = '—';
        if (prevCei != null && currentCei != null) {
          const diff = currentCei - prevCei;
          if (diff > 0) {
            trendClass = 'ws-day-trend--up';
            trendIcon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
            trendText = `+${diff.toFixed(1)}`;
          } else if (diff < 0) {
            trendClass = 'ws-day-trend--down';
            trendIcon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
            trendText = `${diff.toFixed(1)}`;
          } else {
            trendText = '0.0';
          }
        }

        let vocStr = '—';
        if (d.voc_cnt != null) vocStr = Number(d.voc_cnt).toLocaleString();

        const trendHtml = `<span class="ws-day-trend ${trendClass}">${trendIcon}${trendText}</span><span class="ws-day-voc-sep">|</span><span class="ws-day-voc-inline">VoC ${vocStr}</span>`;
        const spark = _miniSparkSvg(series, idx, color, ceiStr, trendHtml);

        // hover 시 CEI 등급 기준색 표시용 클래스 (0820)
        const g = currentCei != null ? ceiGrade(currentCei) : '';
        return `<div class="ws-col${isToday ? ' ws-col--today' : ''}${g ? ` ws-col--g${g}` : ''}"
          title="${d.date.slice(5)} · CEI ${ceiStr}${g ? ` · ${g}등급` : ''}">
          <span class="ws-day-label">
            <span class="ws-day-date">${d.date.slice(5).replace('-','/')}</span>
            <span class="ws-day-wd ${wdClass}">${d.weekday}</span>
          </span>
          <div class="ws-day">
            ${spark}
          </div>
        </div>`;
      }).join('');
    })
    .catch(() => {
      if (container) container.innerHTML = '<span class="weather-loading">CEI 데이터 불러오기 실패</span>';
    });
}
loadWeather(null);

// ── Tab ──────────────────────────────────────────────────────
const _tabContents = () => document.querySelectorAll('.tab-content');
const _tabBtns     = () => document.querySelectorAll('.tab');

function switchTab(name, btn) {
  // 관제(main) 밖 탭으로 전환 시 떠 있는 AI 분석 패널을 닫는다 —
  // 챗봇이 다른 화면 위에 남지 않게 (분석 진행 중이면 중단 포함)
  if (name !== 'main') {
    const aiPanel = document.getElementById('ai-panel');
    if (aiPanel && aiPanel.classList.contains('open')) togglePanel();
  }
  _tabContents().forEach(el => el.classList.remove('active'));
  _tabBtns().forEach(el => el.classList.remove('active'));
  _el('tab-' + name)?.classList.add('active');
  btn.classList.add('active');
  if (name === 'region' && !window._trendChartInit) { initTrendChart(); window._trendChartInit = true; }
  if (name === 'main' && window._map) setTimeout(() => window._map.invalidateSize(), 50);
}

// ── Search (debounce 200ms) ───────────────────────────────────
const doSearch = debounce(function() {
  const q = (_el('search-input')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.tbl-row').forEach(row => {
    row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}, 200);

// ============================================================
//  지도 — 핵심 기능
// ============================================================

// CEI 기준 상태/색상
function ceiStatus(cei)  { return cei < 80 ? 'critical' : cei < 87 ? 'warning' : 'normal'; }
function ceiColor(status){ return STATUS_COLOR[status] || STATUS_COLOR.normal; }

// ── 공용 CEI 등급 뱃지 (전 화면 통일 — CEO 눈높이, 0820) ──────
// 등급 컷은 원천 데이터·지도 마커와 동일한 공식 컷(config CEI_GRADE_THRESHOLDS,
// index.html 주입: S>90 · A>87 · B>85 · C>80 · 이하 D) — 마커 색·등급 건수 타일과
// 뱃지가 반드시 같은 등급을 말하게 단일 기준 사용 (0820: 81이 마커 C·뱃지 B로
// 갈라지던 이중 스케일 버그 수정).
// dashboard.js가 가장 먼저 로드되므로 eqp/home/top30/equip-trend에서 그대로 사용.
window.ceiGradeOf = function (v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const t = (typeof CEI_GRADE_THRESHOLDS !== 'undefined' && CEI_GRADE_THRESHOLDS)
    || { S: 90, A: 87, B: 85, C: 80 };
  return n > t.S ? 'S' : n > t.A ? 'A' : n > t.B ? 'B' : n > t.C ? 'C' : 'D';
};
// 등급 문자 칩 + 등급색 숫자 — 표 안에서 한 줄 유지 (nowrap)
window.ceiBadgeHtml = function (v, digits) {
  const g = window.ceiGradeOf(v);
  if (!g) return '<span class="ops-td-sub">—</span>';
  const gl = g.toLowerCase();
  const num = digits != null ? Number(v).toFixed(digits) : v;
  return `<span class="cei-chip cei-chip--${gl}" title="CEI ${num} · ${g}등급">` +
    `<span class="cei-chip-g cei-g-${gl}">${g}</span><b>${num}</b></span>`;
};

// 고객 등급(KPI 스트립)과 동일한 CEI 등급 판정 — 백엔드 config.CEI_GRADE_THRESHOLDS
// 를 index.html 이 주입 (미주입 시 동일 기본값). 마커 색·등급 분포·등급 필터 공용.
const _CEI_TH = (typeof CEI_GRADE_THRESHOLDS !== 'undefined' && CEI_GRADE_THRESHOLDS)
  || { S: 90, A: 87, B: 85, C: 80 };
function ceiGrade(cei) {
  const v = Number(cei);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v > _CEI_TH.S ? 'S' : v > _CEI_TH.A ? 'A' : v > _CEI_TH.B ? 'B'
       : v > _CEI_TH.C ? 'C' : 'D';
}
function ceiLabel(status){ return STATUS_LABEL[status] || '정상'; }

// bad_ce_bld_grade 기반 색상 — theme.css 등급 토큰 경유
const GRADE_COLOR = {
  S: themeVar('--grade-s', '#2E5CB8'),
  A: themeVar('--grade-a', '#17877A'),
  B: themeVar('--grade-b', '#2E8B44'),
  C: themeVar('--grade-c', '#B26A00'),
  D: themeVar('--grade-d', '#D6193A'),
};
const GRADE_LABEL = { S: 'S등급', A: 'A등급', B: 'B등급', C: 'C등급', D: 'D등급' };
function gradeColor(grade) { return GRADE_COLOR[grade] || CHART_TICK; }
function gradeLabel(grade) { return GRADE_LABEL[grade] || grade || '-'; }

// ── 건물 마커 아이콘 생성 (줌에 따라 크기/상세 다름, 고객 등급(CEI) 기반 색상) ──
function makeBuildingIcon(b, zoom) {
  const grade = ceiGrade(b.cei_avg) || b.bad_ce_bld_grade || '';
  const badgeClass = grade ? `bld-badge-grade-${grade}` : 'bld-badge-normal';

  const tip = b.bld_nm.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cei = b.cei_avg;

  if (zoom >= 13) {
    // 줌 13~14: 위험(C·D)만 숫자 배지, 정상(S/A/B)은 소형 도트 —
    // 실데이터(뷰포트 수백 개)에서 배지가 전부 겹치는 문제 방지 (0820).
    // 줌 15부터는 기존대로 전 건물 배지.
    const isBad = grade === 'C' || grade === 'D';
    if (zoom < 15 && !isBad) {
      const dsz = 11;
      const color = grade ? gradeColor(grade) : ceiColor(b.status);
      return L.divIcon({
        html: `<div style="width:${dsz}px;height:${dsz}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 5px ${color}88" data-tip="${tip} · CEI ${cei}"></div>`,
        className: '', iconSize: [dsz, dsz], iconAnchor: [dsz / 2, dsz / 2], popupAnchor: [0, -dsz],
      });
    }
    const sz = grade === 'D' ? 38 : grade === 'C' ? 36 : grade === 'B' ? 32 : 30;
    const anchor = sz / 2;
    return L.divIcon({
      html: `<div class="bld-badge-circle ${badgeClass}" data-tip="${tip}">${cei}</div>`,
      className: '', iconSize: [sz, sz], iconAnchor: [anchor, anchor], popupAnchor: [0, -anchor - 4],
    });
  } else if (zoom >= 10) {
    const sz = (grade === 'D' || grade === 'C') ? 14 : grade === 'B' ? 11 : 8;
    const color = grade ? gradeColor(grade) : ceiColor(b.status);
    // grade 는 위에서 고객 등급(CEI) 기준으로 판정됨 — 도트 색도 동일 기준
    return L.divIcon({
      html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 6px ${color}99" data-tip="${tip}"></div>`,
      className: '', iconSize: [sz, sz], iconAnchor: [sz/2, sz/2], popupAnchor: [0, -sz],
    });
  } else {
    return L.divIcon({ html: '', className: '', iconSize: [0, 0] });
  }
}

// ── 팝업 HTML — 4-메트릭 카드 ──────────────────────────────
function makeBuildingPopup(b) {
  const grade = ceiGrade(b.cei_avg) || b.bad_ce_bld_grade || '';
  const color  = grade ? gradeColor(grade) : ceiColor(b.status);
  const label  = grade ? gradeLabel(grade) : ceiLabel(b.status);
  const bldId  = (b.bld_cd || b.id || '').replace(/'/g, '');
  const vocCol = b.voc_total >= 3 ? 'var(--sem-bad)' : 'var(--text-primary)';
  const badCol = b.cei_bad_cnt > 0 ? 'var(--sem-bad)' : 'var(--text-primary)';
  return `
  <div class="bld-popup">
    <div class="bld-popup-header" style="border-color:${color}">
      <div class="bld-popup-name">${b.bld_nm}</div>
      <span class="bld-popup-badge" style="background:${color}20;color:${color}">${label}</span>
    </div>
    <div class="bld-popup-metrics">
      <div class="bld-metric-row">
        <span class="bld-metric-label">초고속 서비스수</span>
        <span class="bld-metric-val">${b.cust_cnt}명</span>
      </div>
      <div class="bld-metric-row">
        <span class="bld-metric-label">평균CEI</span>
        <span class="bld-metric-val" style="color:${color}">${b.cei_avg}점</span>
      </div>
      <div class="bld-metric-row">
        <span class="bld-metric-label">Bad CE 고객수</span>
        <span class="bld-metric-val" style="color:${badCol}">${b.cei_bad_cnt}명</span>
      </div>
      <div class="bld-metric-row">
        <span class="bld-metric-label">VoC건수</span>
        <span class="bld-metric-val" style="color:${vocCol}">${b.voc_total}건</span>
      </div>
    </div>
    <button class="bld-popup-ai-btn" onclick="selectBuildingFromData('${bldId}');openPanel();window._map && window._map.closePopup();runAnalysis()">
      <i data-lucide="bot"></i> AI 분석 실행
    </button>
    ${(b.status === 'critical' || b.status === 'warning') ? `
    <button class="bld-popup-bs-btn" onclick="goBsManage('${bldId}', '${String(b.bld_nm || '').replace(/['"\\]/g, '')}')" title="장비별 세부 진단·지시서 발행 화면으로 이동">
      <i data-lucide="wrench"></i> 세부 건물 BS 관리 화면으로 이동
    </button>` : ''}
  </div>`;
}

// ── 관제 → 세부 건물 BS 관리 화면(장비 탭 프리필) — TODO-시연 1-1·1-3 ──
// 진단 컨텍스트(_lastDiagnosis)와 건물명을 함께 넘겨 장비 탭이
// 컨텍스트 배너 + 해당 건물 자동 선택(장비별 진단 펼침)까지 수행한다.
function goBsManage(bldCd, bldNm) {
  if (!bldCd) return;
  if (window._map) window._map.closePopup();
  // AI 패널이 열려 있으면 닫고 이동 — 장비 탭이 가려지지 않게
  const panel = document.getElementById('ai-panel');
  if (panel && panel.classList.contains('open')) togglePanel();
  const btn = document.getElementById('snav-eq-ops');
  if (btn) btn.click();                       // switchTab('eqp') + eqpInit()
  const cb = _currentBuilding;
  const nm = bldNm
    || (cb && String(cb.id) === String(bldCd) ? (cb.name || cb.building || '') : '');
  if (typeof eqpEnterFromControl === 'function') {
    eqpEnterFromControl({
      bld_cd: String(bldCd),
      bld_nm: nm,
      primary: _lastDiagnosis?.primary || null,
      headline: _lastDiagnosis?.headline || '',
    });
  } else if (typeof eqpSearch === 'function') {   // 폴백 — 기존 프리필+검색만
    const blds = document.getElementById('eqp-blds');
    if (blds) { blds.value = bldCd; eqpSearch(); }
  }
}

function goBsManageCurrent() {
  if (_currentBuilding) {
    goBsManage(String(_currentBuilding.id),
      String(_currentBuilding.name || _currentBuilding.building || ''));
  }
}

// 분석 시작과 동시에 입력창 위 고정 바 노출 — 스트리밍이 끝나길 기다리지
// 않고 언제든 BS 관리 화면으로 넘어갈 수 있게 (시연 타이밍 조절용)
function _showBsBar() {
  const bar = document.getElementById('ap-bs-bar');
  if (!bar || !_currentBuilding) return;
  const t = bar.querySelector('.ap-bs-bar-txt');
  if (t) t.textContent =
    `${_currentBuilding.name || _currentBuilding.id} · 장비별 진단·지시서 발행으로 바로 이동할 수 있습니다`;
  bar.hidden = false;
}

// ── 지도 초기화 ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // 지도 생성 — 초기 뷰: 서울역 중심 zoom 14
  const map = L.map('map', { zoomControl: true, preferCanvas: true })
               .setView([37.5547, 126.9707], 14);
  window._map = map;
  // flex 레이아웃으로 지도 크기가 결정된 후 invalidate
  requestAnimationFrame(() => setTimeout(() => map.invalidateSize(), 100));

  // 팝업 전용 최상위 pane — leaflet-map-pane(z:400 stacking context) 밖에 배치
  // → mzs-stats(800), 검색창(1050) 모두 위에 올라옴
  map.createPane('topPopupPane', map.getContainer());
  map.getPane('topPopupPane').style.zIndex = 1250;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }).addTo(map);

  // 건물 데이터 로드 (전체) — 데이터 미준비 시 폴링 재시도
  async function _loadBuildings() {
    try {
      const res = await fetch(`${BASE_PATH}/api/buildings-data?limit=0`);
      return await res.json();
    } catch(e) { return []; }
  }

  let buildings = await _loadBuildings();
  if (!buildings.length) {
    console.log('[INFO] 건물 데이터 대기 중... (Trino 로딩)');
    await new Promise(resolve => {
      const _poll = async () => {
        buildings = await _loadBuildings();
        if (buildings.length) return resolve();
        setTimeout(_poll, 3000);
      };
      setTimeout(_poll, 3000);
    });
  }

  window._buildingData = buildings;
  console.log(`[INFO] 건물 ${buildings.length}개 로드 완료`);

  // ── 히트맵 레이어 (위험/주의 건물 기반) ──────────────────
  const heatData = buildings
    .filter(b => b.status !== 'normal')
    .map(b => {
      const intensity = b.status === 'critical'
        ? Math.min(1.0, (87 - b.cei_avg) / 10)
        : 0.35;
      return [b.lat, b.lng, intensity];
    });
  const heatLayer = L.heatLayer(heatData, {
    radius: 40,
    blur: 35,
    maxZoom: 13,
    minOpacity: 0.1,
    gradient: {
      0.3: themeVar('--status-medium', '#F5A623'),
      0.6: themeVar('--grade-c', '#B26A00'),
      0.8: themeVar('--status-high', '#E41E3F'),
      1.0: themeVar('--red-dark', '#A81232'),
    },
  });
  window._heatLayer = heatLayer;

  // ── 뷰포트 기반 동적 마커 관리 ──────────────────────────
  const markerGroup = L.layerGroup();
  window._markerGroup = markerGroup;
  window._buildingMarkers = {};
  const _MAX_MARKERS = 1500;

  // 팝업 열릴 때 Lucide 아이콘 렌더링
  map.on('popupopen', (e) => {
    if (window.lucide) lucide.createIcons({ rootElement: e.popup.getElement() });
  });

  function _createMarker(b, zoom) {
    const marker = L.marker([b.lat, b.lng], { icon: makeBuildingIcon(b, zoom) });
    marker.on('click', () => {
      highlightMarker(b.bld_cd);
      selectBuilding({
        id: b.bld_cd, name: b.bld_nm, cei: b.cei_avg,
        region: (b.province || '') + ' ' + (b.region || ''),
        status: b.status, cust_cnt: b.cust_cnt,
      });
      const targetZoom = Math.max(map.getZoom(), 14);
      map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.5, easeLinearity: 0.5 });
    });
    return marker;
  }

  function _refreshViewportMarkers() {
    const zoom = map.getZoom();
    if (zoom < 12) return;
    const bounds = map.getBounds();
    const visible = buildings.filter(b =>
      b.lat >= bounds.getSouth() && b.lat <= bounds.getNorth() &&
      b.lng >= bounds.getWest()  && b.lng <= bounds.getEast()
    );

    // 뷰포트 상한 — 줌이 낮을수록 보수적으로 (실데이터 겹침 방지, 0820)
    const cap = zoom >= 15 ? _MAX_MARKERS : 400;
    // 우선순위: critical > warning > normal (S/A/B)
    let toShow = visible;
    if (visible.length > cap) {
      const crit = visible.filter(b => b.status === 'critical');
      const warn = visible.filter(b => b.status === 'warning');
      const norm = visible.filter(b => b.status === 'normal');
      toShow = [...crit, ...warn];
      const remain = cap - toShow.length;
      if (remain > 0) toShow = [...toShow, ...norm.slice(0, remain)];
      else toShow = toShow.slice(0, cap);
    }

    const showSet = new Set(toShow.map(b => b.bld_cd));

    // 뷰포트 밖이거나 잘린 마커 제거
    for (const [id, marker] of Object.entries(window._buildingMarkers)) {
      if (!showSet.has(id)) {
        markerGroup.removeLayer(marker);
        delete window._buildingMarkers[id];
      }
    }

    // 새 마커 추가 또는 아이콘 업데이트
    toShow.forEach(b => {
      const existing = window._buildingMarkers[b.bld_cd];
      if (existing) {
        existing.setIcon(makeBuildingIcon(b, zoom));
      } else {
        const marker = _createMarker(b, zoom);
        markerGroup.addLayer(marker);
        window._buildingMarkers[b.bld_cd] = marker;
      }
    });

    requestAnimationFrame(() => _applyMarkerFilter());
  }

  // ── 줌 제어 ──────────────────────────────────────────────
  // 안내 배너 — 몇 초 보여주고 자동으로 사라진다 (지도·우측 패널 겹침 방지, 0820)
  let _hintTimer = null;
  function _setMapHint(el, text) {
    if (!el) return;
    if (el.textContent === text && el.classList.contains('is-faded')) return;
    el.textContent = text;
    el.classList.remove('is-faded');
    clearTimeout(_hintTimer);
    _hintTimer = setTimeout(() => el.classList.add('is-faded'), 4500);
  }

  function applyZoom(zoom) {
    const hint = document.getElementById('map-zoom-hint');

    if (zoom < 12) {
      if (!map.hasLayer(heatLayer)) {
        map.addLayer(heatLayer);
        requestAnimationFrame(() => {
          const canvas = document.querySelector('.leaflet-heatmap-layer');
          if (canvas) canvas.style.opacity = '0.45';
        });
      }
      if (map.hasLayer(markerGroup)) map.removeLayer(markerGroup);
      // 뷰포트 밖 마커 정리
      for (const [id, marker] of Object.entries(window._buildingMarkers)) {
        markerGroup.removeLayer(marker);
        delete window._buildingMarkers[id];
      }
      _setMapHint(hint, '확대하면 건물 상세 정보를 볼 수 있습니다');
    } else {
      if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
      if (!map.hasLayer(markerGroup)) map.addLayer(markerGroup);
      _refreshViewportMarkers();
      _setMapHint(hint, zoom >= 14
        ? '건물을 클릭하면 AI 분석이 시작됩니다'
        : '더 확대하면 건물 단위로 볼 수 있습니다');
    }
  }

  applyZoom(map.getZoom());
  const _debouncedZoomStats = debounce(() => updateZoomStats(map, buildings), 150);
  const _debouncedRefresh   = debounce(_refreshViewportMarkers, 200);
  map.on('zoomend', () => {
    applyZoom(map.getZoom());
    _debouncedZoomStats();
  });
  map.on('moveend', () => {
    _debouncedRefresh();
    _debouncedZoomStats();
  });

  // 초기 통계 렌더링
  updateZoomStats(map, buildings);

  // 지도 빈 곳 클릭 시 건물 선택 해제 → 왼쪽 패널 닫기
  map.on('click', () => {
    clearMarkerHighlight();
    _currentBuilding = null;
    hideLeftPanel();
    updateZoomStats(map, buildings);
    // KPI 바 원복 (팀 override 해제)
    if (_kpiTeamOverride) {
      _kpiTeamOverride = null;
      _selectedTeam = null;
      const sel = document.getElementById('team-select');
      if (sel) sel.value = '';
      loadCeiKpi(_selectedGu ? _selectedGu.cd : null);
      loadWeather(_selectedGu ? _selectedGu.cd : null);
      loadBadceTop10();
    }
    _updateContextLabels(_selectedGu);
  });


  // ── AI 건물 분석 로드 ────────────────────────────────────
  loadAIBuildingAnalysis();

  // ── 테이블 행 클릭 이벤트 위임 ──────────────────────────
  document.addEventListener('click', e => {
    const row = e.target.closest('#tab-main .tbl-row');
    if (!row) return;
    const no = parseInt(row.querySelector('td')?.textContent);
    const r  = (RAW_DATA || []).find(d => d.no === no);
    if (r) selectBuilding({ id: r.bld_cd || r.no, name: r.building, cei: r.cei, region: r.region, status: ceiStatus(r.cei) });
  });
});

// ── 지도 통계 오버레이 (토글 버튼) ──────────────────────────

// ── 줌 기반 동적 통계 패널 ───────────────────────────────────
function getZoomLevel(zoom) {
  if (zoom <= 7)  return { level: 'national', label: '전국 현황',      key: null };
  if (zoom <= 9)  return { level: 'province', label: '시/도별 현황',    key: 'province' };
  if (zoom <= 11) return { level: 'district', label: '시/군/구별 현황', key: 'region' };
  if (zoom <= 13) return { level: 'dong',     label: '읍/면/동별 현황', key: 'dong' };
  return           { level: 'building',       label: '지역현황',     key: 'bld_nm' };
}

// 지역현황 패널 접기 — 기본 접힘 (0820 피드백: 지도를 가리지 않게).
// Top10 행의 [현황] 버튼이나 접힌 패널 클릭으로 펼친다.
let _mzsCollapsed = true;
let _mzsLastArgs = null;   // 토글 시 재렌더용 (map, allBuildings)

function mzsToggle(collapsed) {
  // 드래그로 이동한 직후의 click 은 토글로 취급하지 않는다 (0820)
  const el = document.getElementById('map-zoom-stats');
  if (el && el.dataset.justDragged) return;
  _mzsCollapsed = collapsed !== undefined ? !!collapsed : !_mzsCollapsed;
  if (_mzsLastArgs) updateZoomStats(_mzsLastArgs.map, _mzsLastArgs.blds);
}

function updateZoomStats(map, allBuildings) {
  const el = document.getElementById('map-zoom-stats');
  if (!el || !allBuildings || !allBuildings.length) return;
  _mzsLastArgs = { map, blds: allBuildings };

  const zoom   = map.getZoom();
  const bounds = map.getBounds();
  const info   = getZoomLevel(zoom);

  // 현재 화면 내 건물 필터
  const visible = allBuildings.filter(b =>
    b.lat >= bounds.getSouth() && b.lat <= bounds.getNorth() &&
    b.lng >= bounds.getWest()  && b.lng <= bounds.getEast()
  );

  if (!visible.length) {
    el.classList.add('mzs-hidden');
    return;
  }
  el.classList.remove('mzs-hidden');

  // 전체 요약 수치
  const totalCust = visible.reduce((s, b) => s + (b.cust_cnt || 0), 0);
  const avgCei    = (visible.reduce((s, b) => s + (b.cei_avg || 0), 0) / visible.length).toFixed(1);
  const critical  = visible.filter(b => b.status === 'critical').length;
  const warning   = visible.filter(b => b.status === 'warning').length;
  const normal    = visible.filter(b => b.status === 'normal').length;
  const ceiCol    = avgCei < 80 ? SEM_BAD : avgCei < 87 ? GRADE_COLOR.C : SEM_GOOD;

  // 5등급 분류 — 고객 등급(CEI_GRADE_THRESHOLDS)과 동일 기준
  const gradeS = visible.filter(b => ceiGrade(b.cei_avg) === 'S').length;
  const gradeA = visible.filter(b => ceiGrade(b.cei_avg) === 'A').length;
  const gradeB = visible.filter(b => ceiGrade(b.cei_avg) === 'B').length;
  const gradeC = visible.filter(b => ceiGrade(b.cei_avg) === 'C').length;
  const gradeD = visible.filter(b => ceiGrade(b.cei_avg) === 'D').length;

  const zoomLabel = zoom <= 7 ? '전국' : zoom <= 9 ? '시/도' : zoom <= 11 ? '시/군/구' : zoom <= 13 ? '읍/면/동' : '건물';

  // 접힘 상태 — 요약 한 줄 pill 만 (클릭하면 펼침)
  if (_mzsCollapsed) {
    el.innerHTML = `
      <div class="mzs-header mzs-header--fold" onclick="mzsToggle(false)"
           title="클릭 — 펼치기 · 드래그 — 위치 이동" role="button">
        <span class="mzs-grip" aria-hidden="true">⠿</span>
        <span class="mzs-label">지역현황</span>
        <span class="mzs-zoom-badge">줌 ${zoom} · ${zoomLabel} · ${visible.length}개</span>
        <span class="mzs-fold-ico" aria-hidden="true">▾</span>
      </div>`;
    el.classList.add('mzs-panel--folded');
    requestAnimationFrame(_syncMapOverlayDefaultLayout);
    return;
  }
  el.classList.remove('mzs-panel--folded');

  // 위험/주의 건물 리스트 — 항상 표시 (선택 건물 제외)
  const urgentBuildings = [...visible.filter(b => b.status === 'critical'), ...visible.filter(b => b.status === 'warning')]
    .filter(b => !_currentBuilding || b.bld_cd !== _currentBuilding.id)
    .sort((a, b) => a.cei_avg - b.cei_avg).slice(0, 8);
  const urgentListHtml = urgentBuildings.length
    ? `<div class="mzs-bld-title">위험 · 주의 건물</div>
       <div class="mzs-bld-list">
         ${urgentBuildings.map(b => {
           const c = ceiColor(b.status);
           const lbl = ceiLabel(b.status);
           const vocTxt = b.voc_total > 0
             ? `<span class="mzs-bld-voc mzs-bld-voc-red">VoC ${b.voc_total}</span>`
             : `<span class="mzs-bld-voc">VoC 0</span>`;
           return `<div class="mzs-bld-row" onclick="selectBuildingOnMap('${b.bld_cd}')" title="${b.bld_nm} · ${lbl}">
             <span class="mzs-bld-dot" style="background:${c}"></span>
             <span class="mzs-bld-name">${b.bld_nm}</span>
             <span class="mzs-bld-cei" style="color:${c}">${b.cei_avg}</span>
             ${vocTxt}
           </div>`;
         }).join('')}
       </div>`
    : '';

  el.innerHTML = `
    <div class="mzs-header">
      <span class="mzs-label">지역현황</span>
      <span class="mzs-zoom-badge">줌 ${zoom} · ${zoomLabel}</span>
      <button class="mzs-fold-btn" onclick="mzsToggle(true)" title="지역현황 접기" aria-label="접기">▴</button>
    </div>
    <div class="mzs-summary">
      <div class="mzs-kpi"><div class="mzs-kpi-val">${visible.length}</div><div class="mzs-kpi-lbl">건물</div></div>
      <div class="mzs-kpi"><div class="mzs-kpi-val">${totalCust.toLocaleString()}</div><div class="mzs-kpi-lbl">가입자</div></div>
      <div class="mzs-kpi"><div class="mzs-kpi-val" style="color:${ceiCol}">${avgCei}</div><div class="mzs-kpi-lbl">평균CEI</div></div>
    </div>
    <div class="mzs-status-bar">
      <span class="mzs-grade-chip"><span class="mzs-dot mzs-grade-s"></span>S ${gradeS}</span>
      <span class="mzs-grade-chip"><span class="mzs-dot mzs-grade-a"></span>A ${gradeA}</span>
      <span class="mzs-grade-chip"><span class="mzs-dot mzs-grade-b"></span>B ${gradeB}</span>
      <span class="mzs-grade-chip"><span class="mzs-dot mzs-grade-c"></span>C ${gradeC}</span>
      <span class="mzs-grade-chip"><span class="mzs-dot mzs-grade-d"></span>D ${gradeD}</span>
    </div>
    ${urgentListHtml}
  `;
  requestAnimationFrame(_syncMapOverlayDefaultLayout);
}

// ── AI 건물 패턴 분석 ────────────────────────────────────────
async function loadAIBuildingAnalysis() {
  try {
    const res  = await fetch(`${BASE_PATH}/api/ai-building-analysis`);
    const data = await res.json();
    renderBuildingAnalysis(data);
  } catch(e) { console.error('AI 분석 로드 실패', e); }
}

function renderBuildingAnalysis(data) {
  const aiTextEl = document.getElementById('ai-text');
  if (!aiTextEl) return;

  const s = data.summary || {};
  const patterns = data.patterns || [];
  const levelColor = { high: SEM_BAD, medium: GRADE_COLOR.C, low: CHART_TICK };

  const patternHtml = patterns.map(p => `
    <div class="ai-pattern">
      <span class="ai-pattern-icon"><i data-lucide="${p.icon}"></i></span>
      <span class="ai-pattern-body">
        <span class="ai-pattern-label" style="color:${levelColor[p.level]||CHART_TICK}">${p.type}</span>
        <span class="ai-pattern-text">${p.text}</span>
      </span>
    </div>`).join('');

  aiTextEl.innerHTML =
    `<div class="ai-summary-stats"><span class="ai-stat-item critical">위험 ${s.critical||0}개</span><span class="ai-stat-item warning">주의 ${s.warning||0}개</span><span class="ai-stat-item normal">정상 ${s.normal||0}개</span><span class="ai-stat-item">평균 CEI ${s.cei_avg||'-'}점</span></div>`
    + (data.problem_count > 0
      ? `<div class="ai-pattern-title">문제 건물 공통 특징 (${data.problem_count}개 분석)</div>${patternHtml}`
      : '<div style="color:var(--sem-good);font-size:12px;margin-top:4px">현재 모든 건물 정상 상태</div>');
  if (window.lucide) lucide.createIcons({ rootElement: aiTextEl });
}

// ── 지도에서 건물 찾아서 선택 ────────────────────────────────
function selectBuildingFromData(bld_cd) {
  const b = (window._buildingData || []).find(x => x.bld_cd === bld_cd);
  if (b) selectBuilding({ id: b.bld_cd, name: b.bld_nm, cei: b.cei_avg,
                          region: (b.province||'') + ' ' + (b.region||''),
                          status: b.status, cust_cnt: b.cust_cnt });
}

// mzs 패널 건물 행 클릭 → 지도 이동 + 왼쪽 패널 열기
function selectBuildingOnMap(bld_cd) {
  const b = (window._buildingData || []).find(x => x.bld_cd === bld_cd);
  if (!b) return;
  highlightMarker(bld_cd);
  selectBuilding({ id: b.bld_cd, name: b.bld_nm, cei: b.cei_avg,
                   region: (b.province||'') + ' ' + (b.region||''),
                   status: b.status, cust_cnt: b.cust_cnt });
  const targetZoom = Math.max(window._map ? window._map.getZoom() : 0, 15);
  window._map && window._map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.6 });
}

// 왼쪽 패널 표시/숨김
function showLeftPanel()  { document.querySelector('.right-panel')?.classList.add('visible'); }
function hideLeftPanel()  { document.querySelector('.right-panel')?.classList.remove('visible'); }

// ── Region Tab ───────────────────────────────────────────────
let _trendChart = null;

function selectRegion(name, btn) {
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const kpi = REGION_KPI[name];
  if (!kpi) return;
  ['daily','hourly'].forEach(period => {
    const container = document.getElementById('circles-' + period);
    const nameEl    = document.getElementById('matrix-name-' + period);
    if (!container || !kpi[period]) return;
    if (nameEl) nameEl.textContent = name;
    const d = kpi[period];
    container.querySelectorAll('.circle').forEach(circle => {
      const key = circle.dataset.key;
      if (key && d[key] !== undefined) {
        circle.querySelector('.c-val').textContent = d[key];
        circle.classList.remove('c-good','c-warn','c-danger','c-neutral');
        if (key === 'cei') {
          circle.classList.add(d[key] < 80 ? 'c-danger' : d[key] < 85 ? 'c-warn' : 'c-good');
        } else if (key === 'fault_count' || key === 'fault_voc') {
          circle.classList.add(d[key] > 30 ? 'c-danger' : d[key] > 10 ? 'c-warn' : 'c-good');
        } else {
          circle.classList.add('c-neutral');
        }
      }
    });
  });
}

function initTrendChart() {
  const ctx = document.getElementById('trend-chart');
  if (!ctx || !CHART_DATA) return;
  _trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: CHART_DATA.labels || [],
      datasets: [
        { label:'인터넷VOC', data: CHART_DATA.internet_voc||[], borderColor:CHART_BLUE, backgroundColor:chartAlpha(CHART_BLUE, .08), tension:0.3, yAxisID:'y' },
        { label:'고장건',    data: CHART_DATA.fault_count||[], borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), tension:0.3, yAxisID:'y' },
        { label:'CEI',       data: CHART_DATA.cei||[], borderColor:CHART_TEAL, backgroundColor:chartAlpha(CHART_TEAL, .08), tension:0.3, yAxisID:'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend: { labels: { color:CHART_TEXT, font:{size:11} } } },
      scales: {
        x:  { ticks:{color:CHART_TEXT,font:{size:10}}, grid:{color:CHART_GRID} },
        y:  { position:'left', ticks:{color:CHART_TEXT,font:{size:10}}, grid:{color:CHART_GRID} },
        y1: { position:'right', ticks:{color:CHART_TEAL,font:{size:10}}, grid:{drawOnChartArea:false}, min:75, max:90 },
      },
    },
  });
}

function toggleSeries(key, cb) {
  if (!_trendChart) return;
  const map = { internet_voc:0, fault_count:1, cei:2 };
  const idx = map[key];
  if (idx !== undefined) { _trendChart.data.datasets[idx].hidden = !cb.checked; _trendChart.update(); }
}

// ── Detail Modal ─────────────────────────────────────────────
function showDetail(no) {
  const row = (RAW_DATA || []).find(r => r.no === no);
  if (!row) return;
  const ceiClass = row.cei < 80 ? 'cei-low' : row.cei < 87 ? 'cei-mid' : 'cei-high';
  document.getElementById('modal-body').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${[['No',row.no],['지역',row.region],['건물명',row.building],
         ['유형',row.type],['상태',row.status],
         ['CEI',`<span class="cei ${ceiClass}">${row.cei}</span>`],
         ['고객문의',row.voc+'건'],['작업건',row.work+'건'],
         ['고장건',row.fault+'건'],['발생일시',row.datetime],
      ].map(([k,v]) => `<tr style="border-bottom:1px solid #edf0f5">
        <td style="padding:7px 10px;color:var(--text-secondary);width:100px;font-weight:600">${k}</td>
        <td style="padding:7px 10px">${v}</td>
      </tr>`).join('')}
    </table>`;
  _openModal('detail-modal');
}
function closeModal() { _closeModalById('detail-modal'); }

// ── Briefing Modal ───────────────────────────────────────────
let _twInterval = null;
function showBriefing(workId, e) {
  if (e) e.stopPropagation();
  const data = (WORK_BRIEFINGS || {})[workId];
  if (!data) return;
  document.getElementById('b-work-id').textContent = `${workId} — ${data.type||''} · ${data.schedule||''}`;
  const score = data.risk_score || 0;
  document.getElementById('risk-arc').setAttribute('stroke-dasharray', `${(score/100)*110} 110`);
  document.getElementById('risk-score-txt').textContent = score;
  const lvEl = document.getElementById('risk-level-txt');
  lvEl.textContent = score >= 70 ? '고위험' : score >= 40 ? '주의' : '양호';
  lvEl.style.color  = score >= 70 ? SEM_BAD : score >= 40 ? GRADE_COLOR.C : SEM_GOOD;
  document.getElementById('b-buildings').textContent   = (data.affected_buildings||'—') + '개동';
  document.getElementById('b-households').textContent  = String(data.affected_households||'—') + '세대';
  document.getElementById('b-subscribers').textContent = String(data.active_subscribers||'—') + '명';
  const voc = data.expected_voc || {};
  document.getElementById('b-voc-min').textContent = voc.min||'—';
  document.getElementById('b-voc-max').textContent = voc.max||'—';
  document.getElementById('b-voc-avg').textContent = voc.similar_avg||'—';
  document.getElementById('b-similar-cases').innerHTML =
    (data.similar_cases||[]).map(c=>`<div class="similar-case">${c.date} ${c.region} — ${c.type} (VOC ${c.voc}건)</div>`).join('');
  document.getElementById('b-checklist').innerHTML =
    (data.checklist||[]).map(item => {
      const prioClass = item.priority==='high'?'prio-high':item.priority==='medium'?'prio-mid':'prio-low';
      return `<div class="bf-check-item"><span class="bf-check-icon ${prioClass}"></span>
        <div><div style="font-weight:600">${item.item}</div>
             <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">${item.reason}</div></div>
      </div>`;
    }).join('');
  document.getElementById('b-risk-terminals').innerHTML =
    (data.risk_terminals||[]).map(t => {
      const p=t.failure_prob; const cls=p>=70?'risk-high':p>=40?'risk-mid':'risk-low';
      return `<div class="bf-terminal"><span>${t.id}<br><span style="color:var(--text-secondary);font-size:12px">${t.building}</span></span><span class="${cls}">${p}%</span></div>`;
    }).join('');
  const aiEl = document.getElementById('b-ai-text');
  const fullText = data.ai_summary||'';
  aiEl.textContent = ''; let i=0;
  clearInterval(_twInterval);
  _twInterval = setInterval(() => { if(i<fullText.length) aiEl.textContent+=fullText[i++]; else clearInterval(_twInterval); }, 18);
  _openModal('briefing-modal');
}
function closeBriefing() {
  clearInterval(_twInterval);
  _closeModalById('briefing-modal');
}

// ============================================================
//  AI 분석 패널
// ============================================================
let _currentBuilding   = null;
let _highlightedBldCd  = null;

// ── 지도 마커 필터 ────────────────────────────────────────────
const _filterActive = { critical: true, warning: true, normal: true };

function toggleMarkerFilter(status, btn) {
  _filterActive[status] = !_filterActive[status];
  btn.classList.toggle('active', _filterActive[status]);
  _applyMarkerFilter();
}

// Grade-based filter
const _gradeFilterActive = { S: true, A: true, B: true, C: true, D: true };
function toggleGradeFilter(grade, btn) {
  _gradeFilterActive[grade] = !_gradeFilterActive[grade];
  btn.classList.toggle('active', _gradeFilterActive[grade]);
  _applyMarkerFilter();
}

function _applyMarkerFilter() {
  const markers = window._buildingMarkers || {};
  const buildings = window._buildingData || [];
  buildings.forEach(b => {
    const m = markers[b.bld_cd];
    if (!m) return;
    const grade = ceiGrade(b.cei_avg) || b.bad_ce_bld_grade || '';
    const visible = grade ? (_gradeFilterActive[grade] !== false) : _filterActive[b.status];
    if (visible) {
      m.getElement() && (m.getElement().style.display = '');
    } else {
      m.getElement() && (m.getElement().style.display = 'none');
    }
  });
  const hidden = buildings.filter(b => {
    const g = ceiGrade(b.cei_avg) || b.bad_ce_bld_grade || '';
    return g ? !_gradeFilterActive[g] : !_filterActive[b.status];
  }).length;
  const hint = document.getElementById('mf-hint');
  if (hint) hint.textContent = hidden > 0 ? `${hidden}개 숨김` : '';
}

// ── 마커 강조 / 해제 ────────────────────────────────────────
function highlightMarker(bldCd) {
  // 이전 강조 해제
  clearMarkerHighlight();
  _highlightedBldCd = bldCd;
  const marker = (window._buildingMarkers || {})[bldCd];
  if (!marker) return;
  const el = marker.getElement();
  if (el) el.classList.add('marker-selected');
}

function clearMarkerHighlight() {
  if (_highlightedBldCd) {
    const prev = (window._buildingMarkers || {})[_highlightedBldCd];
    if (prev) {
      const el = prev.getElement();
      if (el) el.classList.remove('marker-selected');
    }
    _highlightedBldCd = null;
  }
}

let _chatHistory = [];

function togglePanel() {
  const panel = document.getElementById('ai-panel');
  const btn   = document.getElementById('ai-panel-btn');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    // 닫기 — 진행 중인 분석 중단 + UI 초기화
    const wasRunning = _analysisRunning;
    _abortCurrentAnalysis();
    // 분석 중에 닫혔다면 placeholder 로 되돌려 잔재 메시지 제거
    if (wasRunning) _resetThreadToPlaceholder();
    panel.classList.remove('open', 'panel-fullscreen', 'panel-wide');
    panel.style.cssText = '';
    window._panelPositioned = false;
    if (btn) btn.classList.remove('active');
    document.getElementById('ap-size-full') && document.getElementById('ap-size-full').classList.remove('active');
    _syncOverlayState();
  } else {
    _closeAllModals();
    panel.classList.add('open');
    if (btn) btn.classList.add('active');
    _syncOverlayState();
    requestAnimationFrame(() => _scrollThreadBottom(true));
  }
}

function openPanel() {
  const panel = document.getElementById('ai-panel');
  const btn   = document.getElementById('ai-panel-btn');
  if (!panel.classList.contains('open')) {
    _closeAllModals();
    panel.classList.add('open');
    if (btn) btn.classList.add('active');
    _syncOverlayState();
    requestAnimationFrame(() => _scrollThreadBottom(true));
  }
}

// ── AI 패널 크기 조절 ─────────────────────────────────────────
function _getPanelSizes() {
  const w = window.innerWidth || 1600;
  if (w <= 1440) return { narrow: 340, normal: 500, wide: 680 };   // 13"
  if (w < 1920)  return { narrow: 380, normal: 560, wide: 760 };   // 15"
  return { narrow: 430, normal: 620, wide: 900 };                  // FHD+
}
let _panelSizes = _getPanelSizes();
let _currentPanelSize = 'normal';
function setPanelSize(mode) {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;

  // 전체화면 토글
  if (mode === 'full') {
    const isFull = panel.classList.toggle('panel-fullscreen');
    document.getElementById('ap-size-full').classList.toggle('active', isFull);
    if (isFull) {
      // 전체화면: 좌표를 top:0 left:0으로 고정, 드래그 상태 초기화
      panel.style.cssText = 'width:100vw;height:100vh;top:0;left:0;right:auto;bottom:auto;border-radius:0;opacity:1;transform:none;pointer-events:all;';
      window._panelPositioned = false;
    } else {
      // 전체화면 해제: 오른쪽 하단 기본 위치로 복귀
      _resetPanelPosition(panel, _currentPanelSize);
    }
    return;
  }

  // narrow / wide / normal — 크기 변경 시 오른쪽 하단으로 위치 리셋
  panel.classList.remove('panel-fullscreen', 'panel-wide');
  document.getElementById('ap-size-full').classList.remove('active');
  _currentPanelSize = mode;
  _resetPanelPosition(panel, mode);

  // 활성 버튼 표시
  ['narrow','wide'].forEach(m => {
    const btn = document.getElementById('ap-size-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
}

// 패널을 오른쪽 하단 기본 위치로 초기화
function _resetPanelPosition(panel, mode) {
  const w = _panelSizes[mode] || 580;
  // top/left 인라인 스타일 제거 → CSS right/bottom 기준으로 복귀
  panel.style.cssText = '';
  panel.style.width   = w + 'px';
  panel.style.right   = '24px';
  panel.style.bottom  = '24px';
  panel.style.top     = '';
  panel.style.left    = '';
  if (mode === 'wide') panel.classList.add('panel-wide');
  // 드래그 위치 상태 초기화 — 다음 드래그는 현재 위치 기준으로 재계산
  window._panelPositioned = false;
}

// ── 플로팅 패널 2D 드래그 ─────────────────────────────────────
// setPanelSize 등 외부에서 positioned 상태를 리셋할 수 있도록 공유 변수 사용
window._panelPositioned = false;

document.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('ap-drag-handle');
  const panel  = document.getElementById('ai-panel');
  if (!handle || !panel) return;

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  // CSS의 right/bottom 기준 위치를 top/left 절대값으로 변환
  function anchorToTopLeft() {
    const r = panel.getBoundingClientRect();
    panel.style.top    = r.top  + 'px';
    panel.style.left   = r.left + 'px';
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    window._panelPositioned = true;
  }

  function onStart(e) {
    // 닫기 버튼 클릭은 드래그 무시
    if (e.target.closest('.ap-close')) return;

    if (!window._panelPositioned) anchorToTopLeft();

    dragging = true;
    const pt = e.touches ? e.touches[0] : e;
    startX    = pt.clientX;
    startY    = pt.clientY;
    startLeft = parseInt(panel.style.left) || 0;
    startTop  = parseInt(panel.style.top)  || 0;
    panel.classList.add('dragging');
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;

    const newLeft = Math.max(0, Math.min(vw - pw, startLeft + dx));
    const newTop  = Math.max(0, Math.min(vh - ph, startTop  + dy));

    panel.style.left = newLeft + 'px';
    panel.style.top  = newTop  + 'px';
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
  }

  handle.addEventListener('mousedown',  onStart, { passive: false });
  handle.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup',   onEnd);
  document.addEventListener('touchend',  onEnd);
});

// ── 검색 핀 (지도 주소 검색 결과 시각화) ─────────────────────
function _makeSearchPinIcon() {
  const html = `
    <div class="map-search-pin-wrap">
      <div class="map-search-pin-pulse"></div>
      <svg class="map-search-pin-svg" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2 C 8 2 2 8 2 16 C 2 26 16 42 16 42 C 16 42 30 26 30 16 C 30 8 24 2 16 2 Z"
              fill="#ef4444" stroke="#ffffff" stroke-width="2.2"/>
        <circle cx="16" cy="16" r="5" fill="#ffffff"/>
      </svg>
    </div>`;
  return L.divIcon({
    html, className: 'map-search-pin',
    iconSize: [32, 44], iconAnchor: [16, 42], tooltipAnchor: [0, -38],
  });
}

function _placeSearchPin(lat, lon, label) {
  if (!window._map || typeof L === 'undefined') return;
  if (window._searchPin) {
    try { window._map.removeLayer(window._searchPin); } catch(e) {}
  }
  if (window._searchPinTimer) {
    clearTimeout(window._searchPinTimer);
    window._searchPinTimer = null;
  }
  const marker = L.marker([lat, lon], {
    icon: _makeSearchPinIcon(), zIndexOffset: 1000, keyboard: false,
  }).addTo(window._map);
  if (label) {
    marker.bindTooltip(label, {
      permanent: true, direction: 'top', offset: [0, -4],
      className: 'map-search-pin-label',
    }).openTooltip();
  }
  window._searchPin = marker;
  window._searchPinTimer = setTimeout(() => {
    _clearSearchPin();
  }, 5000);
}

function _clearSearchPin() {
  if (window._searchPinTimer) {
    clearTimeout(window._searchPinTimer);
    window._searchPinTimer = null;
  }
  if (window._searchPin && window._map) {
    try { window._map.removeLayer(window._searchPin); } catch(e) {}
  }
  window._searchPin = null;
}


// ── 지도 주소 검색 (Nominatim) + 최근 검색어 ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  const input   = document.getElementById('map-addr-input');
  const btn     = document.getElementById('map-addr-btn');
  const results = document.getElementById('map-addr-results');
  if (!input || !btn) return;

  let _searchTimer = null;
  const RECENT_KEY = 'coneRecentSearches';

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
  function saveRecent(q) {
    const list = [q, ...getRecent().filter(r => r !== q)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  function showRecent() {
    const list = getRecent();
    if (!list.length || input.value.trim()) return;
    results.innerHTML = `
      <div class="map-addr-recent-header">최근 검색</div>
      ${list.map(r => `<div class="map-addr-item map-addr-recent" data-q="${r}">
        <span style="color:var(--text-tertiary);margin-right:5px">↩</span>${r}
      </div>`).join('')}`;
    results.style.display = 'block';
    results.querySelectorAll('.map-addr-recent').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.dataset.q;
        searchAddress(el.dataset.q);
      });
    });
  }

  function hideResults() {
    results.innerHTML = '';
    results.style.display = 'none';
  }

  async function searchAddress(q) {
    if (!q.trim()) { hideResults(); return; }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=kr&format=json&limit=5&accept-language=ko`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
      const data = await res.json();

      if (!data.length) {
        results.innerHTML = '<div class="map-addr-no-result">검색 결과가 없습니다</div>';
        results.style.display = 'block';
        return;
      }

      results.innerHTML = data.map((item, i) =>
        `<div class="map-addr-item" data-lat="${item.lat}" data-lon="${item.lon}" data-idx="${i}">
          ${item.display_name.split(',').slice(0, 3).join(', ')}
        </div>`
      ).join('');
      results.style.display = 'block';

      results.querySelectorAll('.map-addr-item').forEach(el => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lon = parseFloat(el.dataset.lon);
          const label = el.textContent.trim();
          if (window._map) {
            _placeSearchPin(lat, lon, label);
            window._map.flyTo([lat, lon], 15, { duration: 1.2 });
          }
          input.value = label;
          saveRecent(label);
          hideResults();
        });
      });
    } catch(e) {
      results.innerHTML = '<div class="map-addr-no-result">검색 중 오류가 발생했습니다</div>';
      results.style.display = 'block';
    }
  }

  btn.addEventListener('click', () => {
    const q = input.value.trim();
    if (q) { saveRecent(q); searchAddress(q); }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (q) { saveRecent(q); searchAddress(q); }
    }
    if (e.key === 'Escape') hideResults();
  });

  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    if (!input.value.trim()) { _clearSearchPin(); showRecent(); return; }
    _searchTimer = setTimeout(() => searchAddress(input.value), 400);
  });

  input.addEventListener('focus', () => {
    if (!input.value.trim()) showRecent();
  });

  // 바깥 클릭 시 결과 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('#map-search-box')) hideResults();
  });
});


function selectBuilding(building) {
  _currentBuilding = building;
  showLeftPanel();
  const region = (building.region || '').trim();
  const name   = building.name || building.building || `건물 ${building.id}`;
  document.getElementById('ap-target').textContent = region ? `${region} / ${name}` : name;
  _chatHistory = [];

  // 우측 패널 업데이트 — 선택된 건물 상세 (bld_cd 또는 건물명으로 매칭)
  const _bid = String(building.id || '').trim();
  const _bnm = String(building.name || '').trim();
  const b = (window._buildingData || []).find(x =>
    String(x.bld_cd || '').trim() === _bid
  ) || (window._buildingData || []).find(x =>
    _bnm && String(x.bld_nm || '').trim() === _bnm
  ) || building;
  updateRightPanel({
    mode: 'building',
    bldCount: 1,
    svcCnt:   b.cust_cnt  || building.cust_cnt  || '—',
    avgCei:   b.cei_avg   || building.cei        || '—',
    badCnt:   b.cei_bad_cnt != null ? b.cei_bad_cnt : '—',
    voc:      b.voc_total != null   ? b.voc_total   : '—',
    org:      b.org       || '—',
    team:     b.sol_team  || '—',
    period:   b.bld_nm    || name,
    list:     [],
  });

  // KPI 바 — 해당 건물의 운용팀 데이터로 업데이트
  const bldTeam = b.sol_team || building.team || null;
  if (bldTeam && bldTeam !== '—') {
    _kpiTeamOverride = bldTeam;
    _selectedTeam = bldTeam;
    // 드롭다운 동기화
    const sel = document.getElementById('team-select');
    if (sel) {
      // 옵션에 해당 팀이 있으면 선택
      const opt = Array.from(sel.options).find(o => o.value === bldTeam);
      sel.value = opt ? bldTeam : '';
    }
    _updateContextLabels(null);
    loadCeiKpi(null);
    loadWeather(null);
    loadBadceTop10();
  }
}

// ── 우측 패널 업데이트 ────────────────────────────────────────
function updateRightPanel(d) {
  const set = (id, v) => { _animateValue(document.getElementById(id), String(v)); };

  set('rp-bld-cnt', d.bldCount ?? '—');
  set('rp-svc-cnt', d.svcCnt  ?? '—');
  set('rp-bad-cnt', d.badCnt  != null ? d.badCnt + '명' : '—');
  set('rp-voc',     d.voc     != null ? d.voc    + '건' : '—');

  const setTags = (id, arr, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (arr && arr.length) {
      el.innerHTML = arr.map(v => `<span class="rp-tag">${v}</span>`).join('');
    } else {
      el.textContent = fallback || '—';
    }
  };
  setTags('rp-org',  d.orgs,  d.org);
  setTags('rp-team', d.teams, d.team);

  const ceiEl = document.getElementById('rp-avg-cei');
  if (ceiEl) {
    const v = parseFloat(d.avgCei);
    const g = window.ceiGradeOf(v);
    _animateValue(ceiEl, isNaN(v) ? '—' : v.toFixed(1));
    // 등급색 통일 (kpi-grade-*) — 기존 cei-good/warn/bad 3색 대신 5등급색
    ceiEl.className = 'bld-stat-kpi-val ' + (g ? `kpi-grade-${g.toLowerCase()}` : '');
    let gEl = document.getElementById('rp-cei-grade');
    if (!gEl) {
      gEl = document.createElement('span');
      gEl.id = 'rp-cei-grade';
      ceiEl.parentElement.insertBefore(gEl, ceiEl);
    }
    gEl.className = g ? `cei-chip-g cei-g-${g.toLowerCase()}` : '';
    gEl.textContent = g || '';
  }

  const periodEl = document.getElementById('bld-stat-period');
  if (periodEl) periodEl.textContent = d.mode === 'building' ? d.period : '최근 7일 / 누적';

  // 건물 목록
  const listEl = document.getElementById('rp-bld-list');
  if (!listEl) return;
  if (!d.list || !d.list.length) {
    if (d.mode !== 'building') {
      listEl.innerHTML = '<div class="bld-stat-empty">화면 내 위험/주의 건물 없음</div>';
    } else {
      listEl.innerHTML = '<div class="bld-stat-empty">단일 건물 선택됨</div>';
    }
    return;
  }
  listEl.innerHTML = d.list.map(b => {
    const c = ceiColor(b.status);
    const cls = b.status === 'critical' ? 'is-critical' : b.status === 'warning' ? 'is-warning' : '';
    return `<div class="bld-stat-item ${cls}" onclick="selectBuildingFromData('${b.bld_cd}')">
      <span class="bld-stat-item-name" title="${b.bld_nm}">${b.bld_nm}</span>
      <span class="bld-stat-item-cei" style="color:${c}">${b.cei_avg.toFixed(0)}</span>
      <span class="bld-stat-item-voc">VOC ${b.voc_total}</span>
    </div>`;
  }).join('');
}

// ── 스트리밍/타이핑 컨트롤 ────────────────────────────────────
let _typingSession = 0;
let _aiMsgQueue = Promise.resolve();

function _bumpTypingSession() {
  _typingSession += 1;
  _aiMsgQueue = Promise.resolve();
  return _typingSession;
}

function _threadNearBottom(thread, threshold = 56) {
  if (!thread) return true;
  return (thread.scrollHeight - thread.scrollTop - thread.clientHeight) <= threshold;
}

function _scrollThreadBottom(force = false) {
  const thread = document.getElementById('ap-thread');
  if (!thread) return;
  thread.scrollTop = thread.scrollHeight;
}

function _queueAIMessage(task) {
  _aiMsgQueue = _aiMsgQueue.then(task).catch(err => {
    console.error('AI 메시지 큐 오류:', err);
  });
  return _aiMsgQueue;
}

// ── AI 분석 abort 인프라 ───────────────────────────────────
// in-flight fetch 취소용 AbortController. abort 시 새로 생성된다.
let _aiAbortController = new AbortController();
function _aiAbortSignal() {
  if (!_aiAbortController || _aiAbortController.signal.aborted) {
    _aiAbortController = new AbortController();
  }
  return _aiAbortController.signal;
}

// 분석 중단 시 떠도는 mini-thinking / action / followup 행 일괄 제거
function _aiCleanupOrphans() {
  document.querySelectorAll(
    '#_mini_thinking_row, #_thinking_row, .ap-action-float, .ap-followup-row'
  ).forEach(el => el.remove());
}

// 초기 placeholder HTML 스냅샷 — 패널을 분석 중에 닫을 때 복원용
let _initialThreadHTML = null;
document.addEventListener('DOMContentLoaded', () => {
  const thread = document.getElementById('ap-thread');
  if (thread) _initialThreadHTML = thread.innerHTML;
});
function _resetThreadToPlaceholder() {
  const thread = document.getElementById('ap-thread');
  if (!thread || _initialThreadHTML === null) return;
  thread.innerHTML = _initialThreadHTML;
  if (window.lucide) lucide.createIcons({ rootElement: thread });
}

// ── 타이핑 효과 ──────────────────────────────────────────────
function _stripMarkdown(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/^\s*#{1,6}\s+/gm, '');              // # 헤딩
  s = s.replace(/\*\*([^*]+?)\*\*/g, '$1');          // **bold**
  s = s.replace(/__([^_]+?)__/g, '$1');              // __bold__
  s = s.replace(/(^|[\s(])\*([^\s*][^*]*?)\*(?=[\s).,!?:;]|$)/g, '$1$2'); // *italic*
  s = s.replace(/(^|[\s(])_([^\s_][^_]*?)_(?=[\s).,!?:;]|$)/g, '$1$2');   // _italic_
  s = s.replace(/`([^`]+?)`/g, '$1');                 // `code`
  s = s.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '');    // --- 구분선
  s = s.replace(/^\s*>\s?/gm, '');                    // > 인용
  s = s.replace(/\n{3,}/g, '\n\n');                   // 과도한 빈 줄
  return s.trim();
}

function typewriterEl(el, text, speed = 42, opts = {}) {
  const {
    session = _typingSession,
    maxChars = 900,
    preserveTail = true,
  } = opts;
  const source = String(text ?? '');
  const typed = source.slice(0, maxChars);
  const rest = preserveTail && source.length > maxChars ? source.slice(maxChars) : '';
  return new Promise(resolve => {
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    const tick = () => {
      if (session !== _typingSession) {
        el.classList.remove('typing');
        resolve(false);
        return;
      }
      if (i < typed.length) {
        el.textContent += typed[i++];
        _scrollThreadBottom();
        setTimeout(tick, speed);
      } else {
        if (rest) el.textContent += rest;
        el.classList.remove('typing');
        _scrollThreadBottom(true);
        resolve(true);
      }
    };
    tick();
  });
}

// ── 채팅 메시지 추가 (아바타 + 말풍선) ────────────────────────
function createMsgRow(role) {
  const thread = document.getElementById('ap-thread');
  const row = document.createElement('div');
  row.className = `ap-msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble ap-thinking-bubble';

  if (role === 'ai') {
    const avatar = document.createElement('div');
    avatar.className = 'ap-avatar';
    avatar.innerHTML = '<i data-lucide="bot"></i>';
    row.appendChild(avatar);
  }
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  _scrollThreadBottom(true);
  return bubble;
}

function _escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _metricSeverity(key, value) {
  if (value == null || Number.isNaN(value)) return 'na';
  if (key === 'crc') {
    if (value >= 100) return 'danger';
    if (value >= 30) return 'warn';
    return 'good';
  }
  if (key === 'flap') {
    if (value >= 20) return 'danger';
    if (value >= 8) return 'warn';
    return 'good';
  }
  if (key === 'bip_error') {
    if (value >= 80) return 'danger';
    if (value >= 20) return 'warn';
    return 'good';
  }
  if (key === 'ont_power') {
    if (value > -3 || value < -10) return 'danger';
    if (value > -4 || value < -8) return 'warn';
    return 'good';
  }
  return 'na';
}

function _severityLabel(level) {
  if (level === 'danger') return '위험';
  if (level === 'warn') return '주의';
  if (level === 'good') return '양호';
  return '미확인';
}

function _severityIcon(level) {
  // 이모지 대신 상태색 점 (theme.css .sev-dot)
  return `<span class="sev-dot sev-${level || 'na'}"></span>`;
}

function _metricThresholdHelp(key) {
  if (key === 'crc') return '임계값: 주의 >= 30, 위험 >= 100';
  if (key === 'flap') return '임계값: 주의 >= 8, 위험 >= 20';
  if (key === 'bip_error') return '임계값: 주의 >= 20, 위험 >= 80';
  if (key === 'ont_power') return '임계값: 양호 -8 ~ -4 dBm, 위험: -10 미만 또는 -3 초과';
  return '임계값 정보 없음';
}

function _enhanceQualityMetricBubble(bubble, text) {
  if (!bubble || !text) return false;
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return false;

  const metricMap = {
    crc: 'CRC',
    flap: 'FLAP',
    bip_error: 'BIP ERROR',
    ont_power: 'ONT POWER',
  };
  const metricOrder = ['crc', 'flap', 'bip_error', 'ont_power'];
  const metricRows = {};
  const passLines = [];
  const metricRegex = /^-\s*(CRC|FLAP|BIP_ERROR|ONT_POWER)\s*평균\s*([\-+]?\d+(?:\.\d+)?)?\s*(dBm)?$/i;

  for (const line of lines) {
    const m = line.match(metricRegex);
    if (!m) {
      passLines.push(line);
      continue;
    }
    const rawKey = String(m[1] || '').toLowerCase();
    const key = rawKey === 'bip_error' ? 'bip_error' : rawKey === 'ont_power' ? 'ont_power' : rawKey;
    const v = m[2] == null ? null : Number(m[2]);
    metricRows[key] = { value: Number.isFinite(v) ? v : null, unit: m[3] ? 'dBm' : '' };
  }

  const count = metricOrder.filter(k => metricRows[k]).length;
  if (count < 2) return false;

  const header = passLines[0] || '최신 품질 지표';
  const tails = passLines.slice(1);
  const cards = metricOrder
    .filter(k => metricRows[k])
    .map(k => {
      const row = metricRows[k];
      const sev = _metricSeverity(k, row.value);
      const state = _severityLabel(sev);
      const icon = _severityIcon(sev);
      const guide = _metricThresholdHelp(k);
      const valueText = row.value == null ? '—' : `${row.value.toFixed(2)}${row.unit ? ` ${row.unit}` : ''}`;
      return `
        <div class="ap-qm-card is-${sev}">
          <div class="ap-qm-key-row">
            <div class="ap-qm-key">${metricMap[k]}</div>
            <div class="ap-qm-icon ap-qm-tip" data-tip="${_escapeHtml(guide)}">${icon}</div>
          </div>
          <div class="ap-qm-value">${_escapeHtml(valueText)}</div>
          <div class="ap-qm-state ap-qm-tip" data-tip="${_escapeHtml(guide)}">${state}</div>
        </div>
      `;
    }).join('');

  const tailHtml = tails.map(t => `<div class="ap-qm-tail">${_escapeHtml(t)}</div>`).join('');
  bubble.classList.add('has-quality-metrics');
  bubble.innerHTML = `
    <div class="ap-qm-head">${_escapeHtml(header)}</div>
    <div class="ap-qm-grid">${cards}</div>
    ${tailHtml}
  `;
  return true;
}


// ── 생성형 응답 렌더 — 마크다운 스트리밍 (버퍼 누적 → 재렌더) ──
function _escapeMd(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _mdToHtml(text) {
  const lines = _escapeMd(text).split('\n');
  const out = [];
  let inList = false;
  for (const raw of lines) {
    let line = raw;
    // 인라인: **bold**, `code`
    line = line.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
               .replace(/`([^`]+?)`/g, '<code>$1</code>');
    const h = line.match(/^\s*(#{2,4})\s+(.*)$/);
    const li = line.match(/^\s*[-·•]\s+(.*)$/);
    if (li) {
      if (!inList) { out.push('<ul class="md-ul">'); inList = true; }
      out.push(`<li>${li[1]}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    if (h) { out.push(`<div class="md-h">${h[2]}</div>`); continue; }
    if (line.trim() === '') { out.push('<div class="md-gap"></div>'); continue; }
    out.push(`<div class="md-p">${line}</div>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

async function typewriterMd(el, text, speed, { session } = {}) {
  el.classList.add('typing');
  const total = String(text).length;
  let i = 0;
  const step = Math.max(2, Math.round(total / 220));  // 긴 답변은 청크 크게
  return new Promise(resolve => {
    const tick = () => {
      if (session !== undefined && session !== _typingSession) {
        el.classList.remove('typing');
        el.innerHTML = _mdToHtml(text);
        resolve(false);
        return;
      }
      i = Math.min(total, i + step);
      el.innerHTML = _mdToHtml(String(text).slice(0, i));
      _scrollThreadBottom();
      if (i >= total) {
        el.classList.remove('typing');
        _attachCopyBtn(el, text);
        resolve(true);
      } else {
        setTimeout(tick, speed);
      }
    };
    tick();
  });
}

function _attachCopyBtn(bubble, rawText) {
  if (bubble.querySelector('.ap-copy')) return;
  const btn = document.createElement('button');
  btn.className = 'ap-copy';
  btn.title = '복사';
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  btn.onclick = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(rawText);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    } catch (err) { /* clipboard 권한 없음 — 무시 */ }
  };
  bubble.appendChild(btn);
}

async function appendChat(role, text, opts = {}) {
  if (role !== 'ai') {
    const bubble = createMsgRow(role);
    bubble.textContent = text;
    return bubble;
  }
  const {
    speed = 29,
    session = _typingSession,
    md = false,
  } = opts;
  return _queueAIMessage(async () => {
    if (session !== _typingSession) return null;
    const bubble = createMsgRow('ai');
    if (md) {
      await typewriterMd(bubble, text, Math.max(12, Math.round(speed / 2)), { session });
    } else {
      await typewriterEl(bubble, text, speed, { session });
      _enhanceQualityMetricBubble(bubble, text);
    }
    return bubble;
  });
}

// ── 로딩(thinking) 말풍선 ─────────────────────────────────────
function appendThinking() {
  const thread = document.getElementById('ap-thread');
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  row.id = '_thinking_row';

  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble';
  // 원래 챗봇 디자인 — 단순 타이핑 점 3개 (다단계 로딩 카드는 사용자 피드백으로 제거)
  bubble.innerHTML = '<div class="ap-thinking"><span></span><span></span><span></span></div>';

  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  _scrollThreadBottom(true);
}

function removeThinking() {
  const row = document.getElementById('_thinking_row');
  if (row) {
    const bubble = row.querySelector('.ap-bubble');
    if (bubble?._stepTimer) clearInterval(bubble._stepTimer);
    row.remove();
  }
}


// ── 구분선 메시지 ─────────────────────────────────────────────
function appendDivider(label) {
  const thread = document.getElementById('ap-thread');
  const div = document.createElement('div');
  div.className = 'ap-divider';
  div.textContent = label;
  thread.appendChild(div);
}

// ── API fetch 헬퍼 ───────────────────────────────────────────
async function fetchAnalysis(mode) {
  const res = await fetch(`${BASE_PATH}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id: String(_currentBuilding.id), mode, building: _currentBuilding }),
  });
  const data = await res.json();
  if (data.llm) {
    console.group('[LLM Status] /api/analyze');
    console.log('ready:', data.llm.ready);
    console.log('openai_installed:', data.llm.openai_installed);
    console.log('api_type:', data.llm.api_type);
    console.log('api_base:', data.llm.api_base);
    console.log('api_version:', data.llm.api_version);
    console.log('api_key_set:', data.llm.api_key_set);
    console.log('api_key_prefix:', data.llm.api_key_prefix);
    console.log('deployment:', data.llm.deployment);
    if (!data.llm.ready) console.warn('LLM NOT READY — mock 응답 사용 중');
    console.groupEnd();
  }
  if (data.result && data.result.llm_status) {
    console.warn('[LLM] llm_status:', data.result.llm_status);
    if (data.result.llm_error) console.error('[LLM] 에러 상세:', data.result.llm_error);
  }
  return data;
}

// ── 원인 카드 렌더링 ─────────────────────────────────────────
async function renderCauses(causes) {
  const session = _typingSession;
  const alive = () => session === _typingSession;
  const confClass = c => `ar-conf ar-conf-${c}`;
  const thread = document.getElementById('ap-thread');
  for (const c of causes) {
    if (!alive()) return;
    appendThinking();
    await new Promise(r => setTimeout(r, 820));
    if (!alive()) return;
    removeThinking();

    const row = document.createElement('div');
    row.className = 'ap-msg ai';
    const avatar = document.createElement('div');
    avatar.className = 'ap-avatar';
    avatar.innerHTML = '<i data-lucide="bot"></i>';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px 12px 12px 3px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:12px 14px;max-width:85%;';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    hdr.innerHTML = `<span class="ar-rank">${c.rank}</span><span class="ar-cause-title">${c.cause}</span><span class="${confClass(c.confidence)}">${c.confidence}</span>`;

    const evEl  = document.createElement('div'); evEl.className  = 'ar-evidence';
    const actEl = document.createElement('div'); actEl.className = 'ar-action';

    card.appendChild(hdr); card.appendChild(evEl); card.appendChild(actEl);
    row.appendChild(avatar); row.appendChild(card);
    thread.appendChild(row);
    if (window.lucide) lucide.createIcons({ rootElement: row });
    thread.scrollTop = thread.scrollHeight;

    await typewriterEl(evEl,  c.evidence || '', 27, { session });
    if (!alive()) return;
    await typewriterEl(actEl, `→ ${c.action || ''}`, 27, { session });
  }
}

// ── 생각 중 스텝 설정 (8단계) ────────────────────────────────
const _THINK_STEPS = [
  'NMS 시스템 데이터를 수신하고 있습니다.',
  '선택된 건물의 메타정보 및 운용팀 매핑을 확인하고 있습니다.',
  '기지국 연결 및 링크 상태를 확인하고 있습니다.',
  'CEI 품질지수 7일 추이를 로딩하고 기준선 대비 분석 중입니다.',
  '장비별 이력 및 고장 데이터를 조회하고 있습니다.',
  '광파워 레벨 이상 여부를 점검하고 있습니다.',
  '네트워크 토폴로지 경로를 추적하고 있습니다.',
  'VoC 민원 데이터를 집계하고 시간대별 분포를 분석하고 있습니다.',
  '민원 유형을 분류하고 반복 패턴을 탐지하고 있습니다.',
  '망 장애·망 작업 이력과 CEI 하락 구간을 연계 분석하고 있습니다.',
  '이상 징후 패턴 및 상관관계를 추론하고 있습니다.',
  '유사 건물 사례를 비교 분석하고 있습니다.',
  '원인 후보의 신뢰도를 평가하고 우선순위를 결정하고 있습니다.',
  '개선 권고 사항을 도출하고 있습니다.',
  '품질 진단 보고서를 생성하고 있습니다.',
];

// 생각 중 버블 — 컨트롤러 반환
function _startThinking(thread) {
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble ap-thinking-bubble';
  const stepsEl = document.createElement('div');
  stepsEl.className = 'ap-thinking-steps';
  bubble.appendChild(stepsEl);
  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  thread.scrollTop = thread.scrollHeight;

  let stepIdx = 0, timerId = null;
  let _doneResolve = null;
  const _donePromise = new Promise(res => { _doneResolve = res; });

  function _markLastDone() {
    const all = stepsEl.querySelectorAll('.ap-step-row');
    if (!all.length) return;
    const last = all[all.length - 1];
    last.classList.add('done');
    const d = last.querySelector('.ap-step-dots');
    if (d) d.style.display = 'none';
  }

  function _addStep() {
    if (stepIdx >= _THINK_STEPS.length) return false;
    _markLastDone();
    const stepText = _THINK_STEPS[stepIdx++];
    const r = document.createElement('div');
    r.className = 'ap-step-row';
    r.innerHTML =
      `<span class="ap-step-dot"></span>` +
      `<span class="ap-step-text">${stepText}</span>` +
      `<span class="ap-step-dots"><span></span><span></span><span></span></span>`;
    stepsEl.appendChild(r);
    thread.scrollTop = thread.scrollHeight;
    return true;
  }

  function _schedule() {
    const delay = 1000 + Math.random() * 455;
    timerId = setTimeout(() => {
      const hasMore = _addStep();
      if (hasMore) {
        _schedule();
      } else {
        // 마지막 스텝 완료 후 resolve
        setTimeout(() => { _markLastDone(); setTimeout(_doneResolve, 182); }, 91);
      }
    }, delay);
  }

  _addStep();
  _schedule();

  return {
    // 자연스러운 속도로 전체 완료까지 대기
    waitComplete() { return _donePromise; },
    // 오류 시 빠른 완료
    finish() {
      return new Promise(resolve => {
        clearTimeout(timerId);
        (function flush() {
          if (stepIdx < _THINK_STEPS.length) { _addStep(); setTimeout(flush, 55); }
          else { _markLastDone(); setTimeout(resolve, 127); }
        })();
      });
    },
    remove() { row.remove(); }
  };
}

// ── Network 토폴로지 진단 애니메이션 ──────────────────────────────
const _NW_STEPS = [
  'Network 토폴로지 진단을 실행합니다.',
  '건물 메타 및 네트워크 구성 정보를 확인하고 있습니다.',
  '해당 정보센터 L3 집선 장치를 진단합니다.',
  'L3 포트 상태 및 업링크 대역폭 사용률을 확인하고 있습니다.',
  '해당 건물 L2 집선 장비를 진단합니다.',
  'L2 스위치 포트 오류 및 루프 가드 상태를 점검하고 있습니다.',
];

function _startNWTopologyAnim(thread) {
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="network"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble ap-thinking-bubble ap-nw-bubble';

  const header = document.createElement('div');
  header.className = 'ap-nw-bubble-hdr';
  header.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/>` +
      `<rect x="9" y="16" width="6" height="6" rx="1"/>` +
      `<line x1="5" y1="8" x2="5" y2="12"/><line x1="19" y1="8" x2="19" y2="12"/>` +
      `<line x1="5" y1="12" x2="12" y2="19"/><line x1="19" y1="12" x2="12" y2="19"/>` +
    `</svg>Network 토폴로지 진단`;

  const stepsEl = document.createElement('div');
  stepsEl.className = 'ap-thinking-steps';

  bubble.appendChild(header);
  bubble.appendChild(stepsEl);
  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  thread.scrollTop = thread.scrollHeight;

  let stepIdx = 0;
  let timerId  = null;
  let _doneResolve = null;
  const _donePromise = new Promise(res => { _doneResolve = res; });

  function _markLastDone() {
    const all = stepsEl.querySelectorAll('.ap-step-row');
    if (!all.length) return;
    const last = all[all.length - 1];
    last.classList.add('done');
    const d = last.querySelector('.ap-step-dots');
    if (d) d.style.display = 'none';
  }

  function _addStep() {
    if (stepIdx >= _NW_STEPS.length) return false;
    _markLastDone();
    const text = _NW_STEPS[stepIdx++];
    const r = document.createElement('div');
    r.className = 'ap-step-row';
    r.innerHTML =
      `<span class="ap-step-dot"></span>` +
      `<span class="ap-step-text">${text}</span>` +
      `<span class="ap-step-dots"><span></span><span></span><span></span></span>`;
    stepsEl.appendChild(r);
    thread.scrollTop = thread.scrollHeight;
    return true;
  }

  // 단계별 간격: 0.4~0.7초 (2.2x 가속)
  const _NW_DELAYS = [0, 818, 727, 682, 909];

  (async function run() {
    for (let i = 0; i < _NW_STEPS.length; i++) {
      if (i > 0) await _delay(_NW_DELAYS[i]);
      _addStep();
    }
    // 마지막 단계 완료 대기 후 resolve
    await _delay(1000);
    _markLastDone();
    await _delay(318);
    _doneResolve();
  })();

  return {
    waitComplete() { return _donePromise; },
    finish() {
      return new Promise(resolve => {
        clearTimeout(timerId);
        (function flush() {
          if (stepIdx < _NW_STEPS.length) { _addStep(); setTimeout(flush, 45); }
          else { _markLastDone(); setTimeout(resolve, 91); }
        })();
      });
    },
    remove() { row.remove(); }
  };
}

// ── HTML 보존 타이핑 효과 ─────────────────────────────────────
async function _typewriterHTML(el, speed) {
  const originalHTML = el.innerHTML;
  const text = el.textContent.trim();
  if (!text) { el.style.opacity = '1'; return; }

  el.innerHTML = '';
  el.style.opacity = '1';

  const cursor = document.createElement('span');
  cursor.className = 'type-cursor';

  for (let i = 0; i <= text.length; i++) {
    el.textContent = text.slice(0, i);
    el.appendChild(cursor);
    await new Promise(r => setTimeout(r, speed));
  }

  cursor.remove();
  await new Promise(r => setTimeout(r, 27)); // 잠깐 멈춤 후 서식 복원
  el.innerHTML = originalHTML;
}

// ── 문서 스트리밍 출력 (섹션별 순차 출력 — 빈 칸 없음) ────────
async function _streamRevealDoc(thread, report, alive = () => true) {
  // 1. 문서 카드 DOM 삽입
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble doc-bubble';
  const docEl = _buildReportDoc(report);
  bubble.appendChild(docEl);
  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });

  // 2. 차트는 스트리밍 중 개별 렌더 — 미리 그리지 않음

  // ── 헬퍼 ──────────────────────────────────────────────────
  function charSpeed(el) {
    const len = el.textContent.trim().length;
    return len < 15 ? 22 : len < 30 ? 15 : 8;
  }

  async function fadeIn(el, ms = 159) {
    el.style.removeProperty('display');
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    el.getBoundingClientRect();
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    await _delay(ms);
  }

  async function typeEl(el) {
    el.style.removeProperty('display');
    await _typewriterHTML(el, charSpeed(el));
    await _delay(36);
  }

  // ── 차트 개별 렌더 (애니메이션 포함) ─────────────────────
  function renderChartInWrap(wrap) {
    const docEl2 = document.querySelector('.doc-report[data-uid]');
    if (!docEl2) return;
    const u = docEl2.dataset.uid;
    const cei  = report.cei  || {};
    const loss = report.loss || {};
    const dates = cei.dates || loss.dates || [];

    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color:CHART_TEXT, font:{size:10}, boxWidth:10 } } },
      scales: {
        x: { ticks:{color:CHART_TICK,font:{size:9}}, grid:{color:CHART_GRID} },
        y: _yScaleAuto([]),
      },
    };

    const ceiCtx = wrap.querySelector(`canvas[id="doc-cei-chart-${u}"]`);
    if (ceiCtx && (cei.bad_trend||[]).length) {
      new Chart(ceiCtx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            { label:'80점이하 고객', data: cei.bad_trend, borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), borderWidth:2, tension:0.3, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2, fill:true },
          ],
        },
        options: {
          ...baseOpts,
          scales: { ...baseOpts.scales, y: _yScaleAuto(cei.bad_trend) },
          animation: {
            duration: 318,
            easing: 'easeOutQuart',
            delay: ctx => ctx.type === 'data' ? ctx.dataIndex * 91 + ctx.datasetIndex * 27 : 0,
          },
        },
      });
    }

    const lossCtx = wrap.querySelector(`canvas[id="doc-loss-chart-${u}"]`);
    if (lossCtx) {
      // 데이터 없으면 빈 배열로 대체 — 축과 레이블은 표시
      const trendData = (loss.trend || []).length ? loss.trend : dates.map(() => 0);
      new Chart(lossCtx, {
        type: 'line',
        data: {
          labels: dates.length ? dates : ['04/01','04/02','04/03','04/04','04/05','04/06','04/07'],
          datasets: [
            {
              label:'Loss 발생 고객수', data: trendData,
              borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08),
              tension:0.35, fill:true, pointRadius:4, pointHoverRadius:6,
              pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2,
            },
          ],
        },
        options: {
          ...baseOpts,
          scales: { ...baseOpts.scales, y: _yScaleAuto(trendData) },
          animation: {
            // 각 데이터 포인트가 순서대로 등장 → 왼쪽에서 오른쪽으로 그려지는 효과
            duration: 273,
            easing: 'easeOutCubic',
            delay: ctx => ctx.type === 'data' ? ctx.dataIndex * 100 + ctx.datasetIndex * 36 : 0,
          },
        },
      });
    }
  }

  // 3. 최상위 블록 전체 숨김 (display:none → 빈 구조 노출 없음)
  const topBlocks = Array.from(
    docEl.querySelectorAll(':scope > .doc-header, :scope > .doc-section, :scope > .doc-actions')
  );
  topBlocks.forEach(b => { b.style.display = 'none'; });

  // 4. 블록별 순차 출력
  for (const block of topBlocks) {
    if (!alive()) { row.remove(); return; }
    if (block.classList.contains('doc-header')) {
      // 헤더 통째로 fade-in
      await fadeIn(block, 182);

    } else if (block.classList.contains('doc-actions')) {
      // 액션 버튼 통째로 fade-in
      await fadeIn(block, 136);

    } else {
      // ── doc-section ────────────────────────────────────────
      block.style.removeProperty('display');

      const secTitle = block.querySelector(':scope > .doc-sec-title');
      if (secTitle) { secTitle.style.display = 'none'; }

      const secBody = block.querySelector('.doc-sec-body');
      if (secBody) {
        Array.from(secBody.children).forEach(c => { c.style.display = 'none'; });
      }

      await _delay(182);

      // 섹션 제목 타이핑
      if (secTitle) { await typeEl(secTitle); }

      // ── 직계 자식 하나씩 출력하는 헬퍼 ──────────────────────
      async function revealChildren(parentEl) {
        for (const child of Array.from(parentEl.children)) {
          if (child.matches('.doc-sub-label, .doc-stat-line, .doc-chart-label')) {
            await typeEl(child);

          } else if (child.matches('.doc-chart-wrap')) {
            // 차트 영역 먼저 fade-in
            await fadeIn(child, 227);
            // 차트 등장 후 애니메이션 렌더링
            renderChartInWrap(child);
            // 데이터 포인트 수 × 100ms + 여유 — 차트 애니메이션이 끝날 때까지 대기 (2.2x 가속)
            const nPoints = (report.cei?.dates || report.loss?.dates || []).length || 7;
            await _delay(nPoints * 100 + 364);

          } else if (child.classList.contains('doc-subsection')) {
            child.style.removeProperty('display');
            Array.from(child.children).forEach(c => { c.style.display = 'none'; });
            await _delay(114);
            await revealChildren(child);
            await _delay(91);

          } else {
            // 테이블 wrapper div, work-chip 컨테이너, 기타
            const table = child.querySelector('.doc-table');
            if (table) {
              // 테이블: thead 먼저 → tbody 행 하나씩
              child.style.removeProperty('display');
              const rows = Array.from(table.querySelectorAll('tbody tr'));
              rows.forEach(tr => {
                tr.style.display = 'none';
                tr.style.opacity = '0';
                tr.style.transition = 'opacity 0.13s ease';
              });
              await _delay(91);
              for (const tr of rows) {
                tr.style.display = 'table-row';
                tr.getBoundingClientRect();
                tr.style.opacity = '1';
                await _delay(100);
                thread.scrollTop = thread.scrollHeight;
              }
            } else {
              await fadeIn(child, 136);
            }
          }
          thread.scrollTop = thread.scrollHeight;
        }
      }

      if (secBody) { await revealChildren(secBody); }
      if (!alive()) { row.remove(); return; }
      await _delay(227);
    }
    thread.scrollTop = thread.scrollHeight;
  }
}

function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 건물 점검 문서 리포트 렌더러 ────────────────────────────
let _analysisRunning = false;
let _analysisToken   = 0;   // 분석 세션 토큰 — 변경 시 진행 중인 분석 중단

function _setAgentLive(on) {
  const p = document.getElementById('ai-panel');
  if (p) p.classList.toggle('agent-live', !!on);
}

function _abortCurrentAnalysis() {
  _analysisToken++;          // 토큰 증가 → 진행 중인 await 들이 감지 후 종료
  _analysisRunning = false;
  _setAgentLive(false);
  _bumpTypingSession();      // 진행 중 타이핑/큐 즉시 중단
  // in-flight fetch 즉시 취소
  try { _aiAbortController && _aiAbortController.abort(); } catch (_) {}
  _aiAbortController = new AbortController();
  // 잔재 DOM 행 (mini-thinking / action / followup) 정리
  _aiCleanupOrphans();
}

// ── 결과 텍스트의 $$ 를 빨간 span으로 교체 ────────────────────
function _highlightNA(text) {
  if (!text) return '';
  return String(text).replace(/\$\$/g, '<span class="ap-syslog-na">$$</span>');
}

// ── 사전분석 5단계 메타 ─────────────────────────────────────
const _PRE_STEPS_META = [
  { lbl: 'CEI 시스템에서 지난 7일간의 변화를 수집·분석합니다.' },
  { lbl: 'SWING 시스템에서 지난 7일간의 작업 및 고장 현황을 분석합니다.' },
  { lbl: '품질관리시스템(SIQMS)에서 지난 7일간의 VoC 데이터를 분석합니다.' },
  { lbl: 'DPG 시스템을 연결하여 Insight 분석을 수행합니다.' },
  { lbl: 'FOMS 시스템을 연결하여 Insight 분석을 수행합니다.' },
];

function _ceiGrade(v) {
  // 등급 문자는 공용 ceiGradeOf(공식 컷)와 동일 — 색만 차트 라벨용 팔레트
  const colors = { S: '#2563eb', A: '#15803d', B: '#a16207', C: '#c2410c', D: '#b91c1c' };
  const g = window.ceiGradeOf(v) || 'D';
  return { g, c: colors[g] };
}

// ── CEI 추이 차트 — 임의 canvas에 렌더링 ───────────────────
function _renderCeiChartCanvas(canvas, weather, opts = {}) {
  if (!canvas || typeof Chart === 'undefined' || !weather || !weather.length) return;
  const { animate = true } = opts;
  const labels = weather.map(w => String(w.date || '').slice(5));
  const values = weather.map(w => (w.cei !== null && w.cei !== undefined && Number(w.cei) > 0) ? Number(w.cei) : null);
  const numericVals = values.filter(v => Number.isFinite(v) && v > 0);
  const minCei = numericVals.length ? Math.min(...numericVals) : 73;
  const maxCei = numericVals.length ? Math.max(...numericVals) : 87;
  const yMin = Math.floor((minCei - 3) * 2) / 2;
  const yMax = Math.ceil((maxCei + 4) * 2) / 2;
  const pointColors = values.map(() => 'transparent');
  const gradeLabelPlugin = {
    id: 'ceiGradeLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      meta.data.forEach((pt, i) => {
        const v = values[i];
        if (v === null || !Number.isFinite(v)) return;
        const { c } = _ceiGrade(v);
        ctx.font = 'bold 10.5px sans-serif';
        ctx.fillStyle = c;
        ctx.fillText(Number(v).toFixed(1), pt.x, pt.y - 8);
      });
      ctx.restore();
    },
  };
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'CEI', data: values,
        borderColor: CHART_BLUE, backgroundColor: chartAlpha(CHART_BLUE, .08),
        borderWidth: 2.4, tension: 0.34, fill: true,
        pointRadius: 0, pointHoverRadius: 0,
        pointBackgroundColor: pointColors, pointBorderColor: pointColors,
        pointBorderWidth: 0, spanGaps: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      animation: animate
        ? { duration: 568, easing: 'easeOutCubic', delay: (ctx) => ctx.type === 'data' ? ctx.dataIndex * 64 : 0 }
        : false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: { label: (ctx) => {
            const v = Number(ctx.parsed.y);
            const { g } = _ceiGrade(v);
            return `CEI ${v.toFixed(1)} (${g}등급)`;
          }},
        },
      },
      scales: {
        x: { grid: { color: CHART_GRID }, ticks: { color: CHART_TEXT, font: { size: 11, weight: 600 } } },
        y: { min: yMin, max: yMax, grid: { color: CHART_GRID },
             ticks: { color: CHART_TEXT, font: { size: 11, weight: 600 }, callback: (v) => Number(v).toFixed(1) } },
      },
    },
    plugins: [gradeLabelPlugin],
  });
}

// ── 채팅 버블에 HTML 콘텐츠 추가 (선택적 타이핑 효과) ──────────
async function _appendStepBubble(html, opts = {}) {
  const { speed = 13, animate = true, extraClass = '' } = opts;
  const fn = async () => {
    const session = _typingSession;
    if (animate && session !== _typingSession) return null;
    const bubble = createMsgRow('ai');
    if (extraClass) bubble.classList.add(extraClass);
    bubble.innerHTML = html;
    if (animate) {
      await _typewriterHTML(bubble, speed);
    }
    if (window.lucide) lucide.createIcons({ rootElement: bubble });
    _scrollThreadBottom(true);
    return bubble;
  };
  return animate ? _queueAIMessage(fn) : fn();
}

// ── CEI 추이 차트 버블 ─────────────────────────────────────
async function _appendCeiChartBubble(apiData, opts = {}) {
  const { animate = true } = opts;
  const weather = apiData?.cei_weather || [];
  if (!weather.length) return null;
  const fn = async () => {
    const bubble = createMsgRow('ai');
    bubble.classList.add('ap-bubble-chart');
    const chartId = `ap-cei-bubble-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    bubble.innerHTML =
      `<div class="ap-cei-weather">` +
        `<div class="ap-cei-weather-head">` +
          `<span class="ap-cei-weather-label">CEI 추이</span>` +
          `<span class="ap-cei-weather-sub">최근 5일</span>` +
        `</div>` +
        `<div class="ap-cei-chart-wrap"><canvas id="${chartId}"></canvas></div>` +
      `</div>`;
    _scrollThreadBottom(true);
    _renderCeiChartCanvas(bubble.querySelector(`#${chartId}`), weather, { animate });
    return bubble;
  };
  return animate ? _queueAIMessage(fn) : fn();
}

// ── 생각하는 효과 (...): mini-thinking → delay → 제거 ──────
async function _thinkPause(ms = 364, alive) {
  if (alive && !alive()) return;
  _appendMiniThinking(alive);
  await _delay(ms);
  _removeMiniThinking();
}

// ── 5단계 사전 분석 (채팅 버블 시퀀스) ─────────────────────────
async function runPreAnalysis(bldCd, bldNm, alive = () => true) {
  const thread = document.getElementById('ap-thread');

  // API 호출 (백그라운드) — abort signal 부착으로 중단 시 즉시 취소
  const apiPromise = fetch(`${BASE_PATH}/api/preanalysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bld_cd: bldCd || '', bld_nm: bldNm || '' }),
    signal: _aiAbortSignal(),
  }).then(r => r.json()).catch(() => ({ steps: [] }));

  // 응답 대기 — "..." 생각 효과 노출
  _appendMiniThinking(alive);
  const apiData = await apiPromise;
  _removeMiniThinking();
  if (!alive()) return null;

  // 5단계 순차 출력 (각 단계가 채팅 버블 시퀀스)
  for (let i = 0; i < _PRE_STEPS_META.length; i++) {
    if (!alive()) return null;
    const stepData = (apiData.steps || []).find(s => s.step === i + 1);

    // 제목 버블
    await _appendStepBubble(`<strong>${_PRE_STEPS_META[i].lbl}</strong>`, { speed: 10 });
    if (!alive()) return null;

    // 결과 버블 — DPG/FOMS는 결과 + trend_items를 한 버블로 통합
    await _thinkPause(545, alive);
    if (!alive()) return null;
    if ((i === 3 || i === 4) && stepData?.trend_items?.length) {
      const items = stepData.trend_items.map(_highlightNA).join('');
      const combined =
        `<div class="ap-step-result-line">${_highlightNA(stepData?.result || '$$')}</div>` +
        `<div class="ap-step-trend-list">${items}</div>`;
      await _appendStepBubble(combined, { speed: 7 });
    } else {
      await _appendStepBubble(_highlightNA(stepData?.result || '$$'), { speed: 11 });
    }
    if (!alive()) return null;

    // CEI(1단계) — 추이 차트 버블
    if (i === 0) {
      await _thinkPause(614, alive);
      if (!alive()) return null;
      await _appendCeiChartBubble(apiData);
      if (!alive()) return null;
      await _delay(136);
    }

    // 다음 단계 진입 전 짧은 휴식 + 생각 효과
    if (i < _PRE_STEPS_META.length - 1) await _thinkPause(477, alive);
  }
  if (!alive()) return null;

  // 건물 리포트 요약 카드 (0820) — 5단계 수집 값을 한 장으로 정리해
  // 스크롤 없이 건물 특징을 한눈에 파악하게 한다.
  const SUM_LBL = ['CEI', '작업·고장 (SWING)', 'VoC (SIQMS)', 'DPG', 'FOMS'];
  const sumRows = SUM_LBL.map((lbl, i) => {
    const sd = (apiData.steps || []).find(s => s.step === i + 1);
    if (!sd || !sd.result) return '';
    return `<div class="ap-sum-row"><span>${lbl}</span><div>${_highlightNA(sd.result)}</div></div>`;
  }).filter(Boolean).join('');
  if (sumRows) {
    await _thinkPause(477, alive);
    if (!alive()) return null;
    // .ap-bubble 은 pre-wrap — 템플릿 개행이 빈 줄로 보이지 않게 한 줄로 조립
    await _appendStepBubble(
      `<div class="ap-sum-card"><div class="ap-sum-hd"><i data-lucide="clipboard-list"></i> 건물 리포트 요약 — ${bldNm || bldCd}</div>${sumRows}</div>`,
      { speed: 4 });
    if (!alive()) return null;
  }

  await _delay(182);
  if (!alive()) return null;

  // AI 질문 말풍선 + 출력/중지 버튼
  await appendChat('ai', 'Network 토폴로지 분석 리포트를 출력하시겠습니까?', { session: _typingSession, speed: 11 });
  if (!alive()) return null;
  await _delay(136);
  if (!alive()) return null;

  return new Promise(resolve => {
    const actionRow = document.createElement('div');
    actionRow.className = 'ap-action-float';
    actionRow.innerHTML =
      `<button class="ap-action-btn ap-action-go">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>` +
        `출력` +
      `</button>` +
      `<button class="ap-action-btn ap-action-stop">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>` +
        `중지` +
      `</button>`;
    thread.appendChild(actionRow);
    thread.scrollTop = thread.scrollHeight;

    actionRow.querySelector('.ap-action-go').addEventListener('click', async () => {
      actionRow.remove();
      appendChat('user', '출력해줘');
      await appendChat('ai', '리포트를 출력하겠습니다.', { session: _typingSession, speed: 15 });
      await _delay(182);
      resolve(apiData);
    }, { once: true });

    actionRow.querySelector('.ap-action-stop').addEventListener('click', () => {
      actionRow.remove();
      appendChat('user', '중지');
      appendChat('ai', '분석을 중지하였습니다.');
      _analysisRunning = false;
      _setAgentLive(false);
    }, { once: true });
  });
}

// ── 즉시 출력: 사전분석 5단계 — 채팅 버블 시퀀스 (애니메이션 없음) ───
function _renderPreInstant(thread, apiData) {
  const steps = apiData?.steps || [];

  function _instantBubble(html, extraClass = '') {
    const bubble = createMsgRow('ai');
    if (extraClass) bubble.classList.add(extraClass);
    bubble.innerHTML = html;
    if (window.lucide) lucide.createIcons({ rootElement: bubble });
    return bubble;
  }

  for (let i = 0; i < _PRE_STEPS_META.length; i++) {
    const stepData = steps.find(s => s.step === i + 1);

    // 제목 버블
    _instantBubble(`<strong>${_PRE_STEPS_META[i].lbl}</strong>`);

    // 결과 버블 — DPG/FOMS는 결과 + trend_items를 한 버블로 통합
    if ((i === 3 || i === 4) && stepData?.trend_items?.length) {
      const items = stepData.trend_items.map(_highlightNA).join('');
      _instantBubble(
        `<div class="ap-step-result-line">${_highlightNA(stepData?.result || '$$')}</div>` +
        `<div class="ap-step-trend-list">${items}</div>`
      );
    } else {
      _instantBubble(_highlightNA(stepData?.result || '$$'));
    }

    // CEI(1단계) — 추이 차트 버블
    if (i === 0 && (apiData?.cei_weather || []).length) {
      const chartId = `ap-cei-instant-${Date.now()}-${i}-${Math.floor(Math.random() * 9999)}`;
      const bubble = _instantBubble(
        `<div class="ap-cei-weather">` +
          `<div class="ap-cei-weather-head">` +
            `<span class="ap-cei-weather-label">CEI 추이</span>` +
            `<span class="ap-cei-weather-sub">최근 5일</span>` +
          `</div>` +
          `<div class="ap-cei-chart-wrap"><canvas id="${chartId}"></canvas></div>` +
        `</div>`,
        'ap-bubble-chart'
      );
      _renderCeiChartCanvas(bubble.querySelector(`#${chartId}`), apiData.cei_weather, { animate: false });
    }
  }

  thread.scrollTop = thread.scrollHeight;
}

// ── 즉시 출력: 보고서 + 차트 렌더 (애니메이션 없음) ──────────
function _renderDocInstant(thread, report) {
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble doc-bubble';
  const docEl = _buildReportDoc(report);
  bubble.appendChild(docEl);
  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });

  // 차트 즉시 렌더 (animation: false)
  const cei   = report.cei  || {};
  const loss  = report.loss || {};
  const dates = cei.dates || loss.dates || [];
  const baseOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { labels: { color:CHART_TEXT, font:{size:10}, boxWidth:10 } } },
    scales: {
      x: { ticks:{color:CHART_TICK,font:{size:9}}, grid:{color:CHART_GRID} },
      y: _yScaleAuto([]),
    },
  };

  const ceiCtx = docEl.querySelector('canvas[id^="doc-cei-chart-"]');
  if (ceiCtx && (cei.bad_trend||[]).length) {
    new Chart(ceiCtx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label:'75점이하 고객', data: cei.bad_trend, borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), borderWidth:2, tension:0.3, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2, fill:true },
        ],
      },
      options: { ...baseOpts, scales: { ...baseOpts.scales, y: _yScaleAuto(cei.bad_trend) } },
    });
  }
  const lossCtx = docEl.querySelector('canvas[id^="doc-loss-chart-"]');
  if (lossCtx) {
    const td = (loss.trend||[]).length ? loss.trend : dates.map(()=>0);
    new Chart(lossCtx, {
      type: 'line',
      data: {
        labels: dates.length ? dates : ['04/01','04/02','04/03','04/04','04/05','04/06','04/07'],
        datasets: [
          { label:'Loss 발생 고객수', data: td, borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2 },
        ],
      },
      options: { ...baseOpts, scales: { ...baseOpts.scales, y: _yScaleAuto(td) } },
    });
  }
  thread.scrollTop = thread.scrollHeight;
}

// ── 즉시 분석 메인 함수 ──────────────────────────────────────
async function runInstantAnalysis() {
  if (!_currentBuilding) {
    await appendChat('ai', '지도에서 건물을 먼저 선택해 주세요.');
    return;
  }
  _abortCurrentAnalysis();
  _analysisRunning = true;
  _setAgentLive(true);
  const myToken = ++_analysisToken;
  const alive = () => myToken === _analysisToken;

  const thread = document.getElementById('ap-thread');
  thread.innerHTML = '';
  _aiCleanupOrphans();
  await appendChat('ai', '전체 분석 결과를 즉시 출력합니다...');
  if (!alive()) return;

  const bldCd = String(_currentBuilding.id);
  const bldNm = _currentBuilding.name || '';

  const [preData, report] = await Promise.all([
    fetch(`${BASE_PATH}/api/preanalysis`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ bld_cd: bldCd, bld_nm: bldNm }),
      signal: _aiAbortSignal(),
    }).then(r => r.json()).catch(() => ({ steps:[] })),
    fetch(`${BASE_PATH}/api/building-report`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ bld_cd: bldCd, bld_nm: bldNm }),
      signal: _aiAbortSignal(),
    }).then(r => r.json()).catch(() => ({})),
  ]);

  if (!alive()) return;

  _renderPreInstant(thread, preData);

  if (report && !report.error) {
    const label = bldNm || bldCd;
    await appendChat('ai', `${label} 품질 분석 보고서`);
    _renderDocInstant(thread, report);

    const topo = preData.topology || null;
    if (topo && (topo.olt_cnt > 0 || topo.onu_cnt > 0 || topo.term_cnt > 0)) {
      const topoRow = createMsgRow('ai');
      topoRow.classList.add('doc-bubble');
      topoRow.innerHTML = _buildTopodiagram(topo);
      thread.appendChild(topoRow);
    }
  } else {
    await appendChat('ai', '보고서 데이터를 불러올 수 없습니다.');
  }

  thread.scrollTop = thread.scrollHeight;
  _analysisRunning = false;
  _setAgentLive(false);
}

async function runAnalysis() {
  if (!_currentBuilding) return;

  // 이미 분석 중이면 중단하고 새로 시작
  _abortCurrentAnalysis();
  const typingSession = _typingSession;
  _analysisRunning = true;
  _setAgentLive(true);
  _showBsBar();   // 스트리밍을 기다리지 않고 BS 관리 화면으로 이동 가능
  const myToken = ++_analysisToken;   // 이 실행의 고유 토큰

  const alive = () => myToken === _analysisToken;   // 중단 여부 확인

  const thread = document.getElementById('ap-thread');
  thread.innerHTML = '';
  _aiCleanupOrphans();   // thread 바깥에 떠도는 잔재까지 정리

  // ── 1단계: 사전 분석 + Network 토폴로지 버튼 클릭 대기 ────────
  const preData = await runPreAnalysis(
    String(_currentBuilding.id),
    _currentBuilding.name || '',
    alive
  );
  if (!alive()) return;

  // ── 2단계: Network 토폴로지 진단 애니메이션 + 보고서 병렬 로드 ──
  const nwAnim = _startNWTopologyAnim(thread);

  let report = null;
  try {
    const res = await fetch(`${BASE_PATH}/api/building-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bld_cd: String(_currentBuilding.id),
        bld_nm: _currentBuilding.name || '',
      }),
      signal: _aiAbortSignal(),
    });
    report = await res.json();
  } catch(e) {
    if (!alive() || e?.name === 'AbortError') return;
    nwAnim.remove();
    _analysisRunning = false;
    _setAgentLive(false);
    await appendChat('ai', '데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.', { session: typingSession });
    return;
  }

  await nwAnim.waitComplete();
  if (!alive()) return;
  nwAnim.remove();

  if (report.error) {
    if (!alive()) return;
    await appendChat('ai', `[${_currentBuilding.name || _currentBuilding.id}] 시계열 데이터가 없습니다.\n기본 분석을 실행합니다.`, {
      session: typingSession,
    });
    await _runMockAnalysis();
    return;
  }

  if (!alive()) return;

  if (!alive()) return;

  // ── Network 토폴로지 다이어그램 (순차 애니메이션) ──────────────
  const topo = (preData && preData.topology) ? preData.topology : null;
  if (topo && (topo.olt_cnt > 0 || topo.onu_cnt > 0 || topo.term_cnt > 0)) {
    const topoRow = createMsgRow('ai');
    topoRow.classList.add('doc-bubble');
    topoRow.innerHTML = _buildTopodiagram(topo);
    const flow = topoRow.querySelector('.topo-v3-flow');
    let aborted = false;
    if (flow) {
      const items = flow.children;
      for (let c = 0; c < items.length; c++) {
        items[c].style.opacity = '0';
        items[c].style.transform = 'translateX(-16px)';
        items[c].style.transition = 'none';
      }
      for (let c = 0; c < items.length; c++) {
        if (!alive()) { aborted = true; break; }
        await _delay(159);
        items[c].style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        items[c].style.opacity = '1';
        items[c].style.transform = 'translateX(0)';
        thread.scrollTop = thread.scrollHeight;
      }
    }
    if (aborted || !alive()) {
      topoRow.remove();   // 중단 시 절반만 그려진 토폴로지 제거
      return;
    }
    thread.scrollTop = thread.scrollHeight;
    await _delay(191);
  }
  if (!alive()) return;

  // ── 보고서 안내 말풍선 ────────────────────────────────────
  const bldLabel = _currentBuilding.name || _currentBuilding.id;
  const reportBubble = await appendChat('ai',
    `Network 토폴로지 진단이 완료되었습니다.\n${bldLabel} 품질 분석 보고서를 생성합니다.`,
    { session: typingSession, speed: 15 }
  );
  if (reportBubble) {
    reportBubble.innerHTML = reportBubble.innerHTML.replace(
      bldLabel, `<b>${bldLabel}</b>`
    );
  }
  await _delay(345);
  if (!alive()) return;

  await _streamRevealDoc(thread, report, alive);
  if (!alive()) return;

  await _appendBuildingDiagnosis(thread, report, alive);
  if (!alive()) return;

  await _appendBsManageCta(thread, alive);
  if (!alive()) return;

  // 조치 가이드는 장비 화면 지시서(조치 제언)로 이관(시연 1-2 다이어트) —
  // 진단 → BS 관리 CTA 로 흐름을 끝내고, 자동 조치가이드(LLM 폴백 문구
  // 포함)로 CTA 를 밀어내지 않는다. 질문 입력 시에는 기존대로 응답한다.
  await _appendFollowUp(thread, alive, { skipGuide: true });
  _analysisRunning = false;
  _setAgentLive(false);
}

// ── 건물 종합 진단 (시연 1-2) — 품질 저하 원인 3축 구분 ──────────
// 리포트 데이터 기반 규칙 진단: ①전일 작업 영향(SWING) ②선로(광레벨·손실)
// ③장비 품질(Bad CE 장비). 결과는 BS 관리 CTA 문구에도 반영된다.
let _lastDiagnosis = null;

function _diagnoseBuilding(report) {
  const r = report || {};
  const axes = [];

  const wk = r.work || {};
  axes.push({
    key: 'work', label: '전일 작업 영향 (SWING)', hit: !!wk.has_work,
    evidence: wk.has_work
      ? `${wk.work_name || wk.work_type || '작업'} 이력 확인${wk.oper_nm ? ' · ' + wk.oper_nm : ''}${wk.broken_level ? ' · 고장 ' + wk.broken_level : ''}`
      : '전일 작업·고장 이력 없음',
  });

  const pw = r.power || {}, ls = r.loss || {};
  const lineHit = !!pw.is_abnormal || Number(ls.total_7d || 0) > 0;
  const lineEv = [];
  if (pw.is_abnormal) lineEv.push(`광레벨 저하 ${pw.low_cnt || 0}회선 (평균 ${pw.level ?? '-'}dBm)`);
  if (Number(ls.total_7d || 0) > 0) lineEv.push(`최근 7일 선로 손실 ${ls.total_7d}건`);
  axes.push({
    key: 'line', label: '선로 (광레벨·손실)', hit: lineHit,
    evidence: lineHit ? lineEv.join(' · ') : '광레벨·선로 손실 정상 범위',
  });

  const eqs = (r.equipment || []).filter(e => Number(e.bad_cnt || 0) > 0);
  const top = eqs[0];
  axes.push({
    key: 'equip', label: '장비 품질', hit: eqs.length > 0,
    evidence: eqs.length
      ? `Bad CE 발생 장비 ${eqs.length}대 · 최다 ${top.tid || top.num} (${top.bad_cnt}명, CEI ${top.avg_cei ?? '-'})`
      : 'Bad CE 발생 장비 없음',
  });

  // ⑤Auto-reset 미복구 — 관제 AI 추천 리스트(targets)의 지난밤 리셋 결과 참조.
  // "현장조치 필요" 칩이 붙은 건물이 진단 카드에서 정상처럼 보이는 모순 방지:
  // 미복구 장비가 있으면 축으로 노출하고 결론도 현장 조치로 이어지게 한다.
  const bldId = String((_currentBuilding || {}).id || '');
  const ctlT = (window._ctlTargets || []).find(t => String(t.bld_cd) === bldId);
  const arFail = ctlT ? Number(ctlT.ar_fail || 0) : 0;
  if (arFail) {
    axes.push({
      key: 'ar_fail', label: 'Auto-reset(자율복구) 미복구', hit: true,
      evidence: `지난밤 원격 리셋 시도 후 미복구 ${arFail}대 — 현장 조치(지시서) 대상`,
    });
  }

  // ④자율복구(Auto-reset) 복구 — 전일 위험 → 기준일 정상 회복 (시연 5-6).
  // 회복 건물이면 축을 추가해 "지난밤 자율복구로 정상화" 를 관제 진단에서 바로 보여준다.
  const tr = (r.cei || {}).trend || [];
  const arPrev = Number(tr[tr.length - 2]), arCur = Number(tr[tr.length - 1]);
  const recovered = Number.isFinite(arPrev) && Number.isFinite(arCur)
    && arPrev > 0 && arPrev < 75 && arCur >= 75;
  if (recovered) {
    axes.unshift({
      key: 'ar', label: 'Auto-reset(자율복구)', hit: true, badge: '복구',
      evidence: `지난밤 리셋 수행 — CEI ${arPrev} → ${arCur} 회복 · D+7까지 CEI 효과검증 추적 중`,
    });
  }

  // 주원인: 장비 > 선로 > 작업 (조치 동선이 장비 화면으로 이어지는 순).
  // 단, 자율복구로 정상화(기준일 CEI ≥ 87)된 건물은 잔존 지표가 있어도
  // "정상화" 결론이 우선 — 회복 시연 동선에서 결론이 모순되지 않게.
  let primary = ['equip', 'line', 'work'].find(k => axes.find(a => a.key === k)?.hit) || null;
  const arNormalized = recovered && arCur >= 87;
  if (arNormalized) primary = null;
  const HEAD = {
    equip: '장비 품질 상태가 좋지 않은 것으로 진단됩니다.',
    line: '선로(광레벨·손실) 요인이 큰 것으로 진단됩니다.',
    work: '전일 작업 영향으로 판단됩니다.',
  };
  return {
    axes, primary, recovered,
    headline: primary ? HEAD[primary]
      : recovered ? '지난밤 Auto-reset(자율복구)으로 정상화되었습니다 — CEI 효과검증을 추적 중입니다.'
      : arFail ? '원격 자율복구로 해소되지 않았습니다 — 장비 단위 현장 조치가 필요한 것으로 진단됩니다.'
      : '뚜렷한 단일 원인 없이 품질 저하가 지속되고 있습니다.',
  };
}

async function _appendBuildingDiagnosis(thread, report, alive = () => true) {
  if (!report) { _lastDiagnosis = null; return; }
  const diag = _diagnoseBuilding(report);
  _lastDiagnosis = diag;
  await _delay(345);
  if (!alive()) return;

  const bubble = createMsgRow('ai');
  bubble.className = 'ap-bubble';
  // 주의: .ap-bubble 은 pre-wrap — 템플릿 선행 공백이 빈 줄로 보이므로 trim
  bubble.innerHTML = `<div class="ap-diag">
      <div class="ap-diag-hd"><i data-lucide="stethoscope"></i> 건물 종합 진단 — 품질 저하 원인</div>
      ${diag.axes.map(a => `
      <div class="ap-diag-row ${a.hit ? 'is-hit' : ''} ${diag.primary === a.key ? 'is-primary' : ''}">
        <span class="ap-diag-badge">${a.badge || (a.hit ? (diag.primary === a.key ? '주원인' : '영향') : '정상')}</span>
        <div class="ap-diag-body">
          <div class="ap-diag-label">${a.label}</div>
          <div class="ap-diag-ev">${_escapeHtml(a.evidence)}</div>
        </div>
      </div>`).join('')}
      <div class="ap-diag-conclusion">${_escapeHtml(diag.headline)}</div>
      <div class="ap-diag-ai">
        ${aiGaugeHtml(aiBuildingScore(report, diag), '이상탐지 스코어')}
        <span class="ap-diag-ai-badges">${modelBadgeHtml('anomaly')} ${modelBadgeHtml('downgrade')}</span>
      </div>
    </div>`.trim();
  if (window.lucide) lucide.createIcons({ rootElement: bubble });
  _scrollThreadBottom(true);
}

// ── 분석 완료 → BS 관리 화면 이동 CTA (관제→장비 탭 연계, TODO-시연 1-1) ──
async function _appendBsManageCta(thread, alive = () => true) {
  const b = _currentBuilding || {};
  const bldId = String(b.id || '').replace(/'/g, '');
  if (!bldId) return;
  await new Promise(r => setTimeout(r, 318));
  if (!alive()) return;
  const row = document.createElement('div');
  row.className = 'ap-msg ai ap-followup-row';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';
  // 진단 결과(1-2)에 맞춘 CTA 문구 — 회의 요구 흐름 (56 02:16).
  // 결론 문장은 진단 카드에 이미 있으므로 여기선 반복하지 않는다.
  const LEAD = {
    equip: '장비 단위 세부 진단과 지시서 발행이 필요해 보입니다.',
    line: '선로 요인과 함께 장비 단위 세부 확인이 필요해 보입니다.',
    work: '전일 작업 영향 구간의 장비 상태 확인이 필요해 보입니다.',
  };
  const lead = LEAD[_lastDiagnosis?.primary]
    || (_lastDiagnosis?.recovered
        ? '지난밤 자율복구 수행 내역과 CEI 효과검증 현황을 확인해 보시죠.'
        : '장비 단위 세부 진단과 조치가 필요해 보입니다.');
  const wrap = document.createElement('div');
  wrap.className = 'ap-followup';
  wrap.innerHTML = `
    <div class="ap-followup-text">${lead} 세부 건물 BS 관리 화면으로 가시겠습니까?</div>
    <div class="ap-followup-chips">
      <button class="ap-chip ap-chip--go" onclick="goBsManage('${bldId}', '${String(b.name || b.building || '').replace(/['"\\]/g, '')}')">
        BS 관리 화면으로 이동 — 장비별 진단·지시서 발행</button>
    </div>`;
  row.appendChild(avatar);
  row.appendChild(wrap);
  thread.appendChild(row);
  _scrollThreadBottom(true);
  if (window.lucide) lucide.createIcons({ rootElement: row });
}

// ── Network 토폴로지 다이어그램 빌더 ──────────────────────────────
function _buildTopodiagram(topo) {
  const orgName = topo.org || '-';
  const oltCnt = Number(topo.olt_cnt || 0);
  const onuCnt = Number(topo.onu_cnt || 0);
  const termCnt = Number(topo.term_cnt || 0);
  const termList = topo.term_list || [];

  // OLT: 전체 유니크 이름 출력
  const fmtOltNames = (arr) => {
    if (!arr || !arr.length) return '<span class="topo-v3-empty">—</span>';
    return arr.map(n => `<div class="topo-v3-item">${_escapeHtml(n)}</div>`).join('');
  };
  // ONU: 최대 4개, 초과 시 …
  const fmtOnuNames = (arr) => {
    if (!arr || !arr.length) return '<span class="topo-v3-empty">—</span>';
    const show = arr.slice(0, 4);
    const more = arr.length > 4;
    return show.map(n => `<div class="topo-v3-item">${_escapeHtml(n)}</div>`).join('') +
           (more ? `<div class="topo-v3-more">…</div>` : '');
  };
  // 단말: 모델명 string 배열 — "2P 이더넷(HFR H614G)" 형식의 값을
  // 종류(앞부분)와 모델(괄호 안)로 파싱해 두 줄로 분리 표시.
  const fmtTermNames = (arr) => {
    if (!arr || !arr.length) return '<span class="topo-v3-empty">—</span>';
    return arr.map(raw => {
      const v = String(raw || '').trim();
      const m = v.match(/^(.+?)\s*\((.+)\)\s*$/);
      if (m) {
        return `<div class="topo-v3-term-item">` +
                 `<span class="topo-v3-term-kind">${_escapeHtml(m[1].trim())}</span>` +
                 `<span class="topo-v3-term-model">${_escapeHtml(m[2].trim())}</span>` +
               `</div>`;
      }
      // 괄호 없는 값은 모델만 단독 표기
      return `<div class="topo-v3-term-item">` +
               `<span class="topo-v3-term-model">${_escapeHtml(v)}</span>` +
             `</div>`;
    }).join('');
  };

  const ICON_ORG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="4" y="4" width="16" height="16" rx="2"></rect>
      <path d="M9 20v-5h6v5"></path>
      <path d="M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01"></path>
    </svg>`;
  const ICON_OLT = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="5" width="18" height="5" rx="1"></rect>
      <rect x="3" y="14" width="18" height="5" rx="1"></rect>
      <circle cx="7" cy="7.5" r="0.9"></circle><circle cx="10" cy="7.5" r="0.9"></circle>
      <circle cx="7" cy="16.5" r="0.9"></circle><circle cx="10" cy="16.5" r="0.9"></circle>
    </svg>`;
  const ICON_ONU = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="14" width="20" height="6" rx="2"></rect>
      <circle cx="6" cy="17" r="1"></circle>
      <circle cx="10" cy="17" r="1"></circle>
      <line x1="18" y1="14" x2="18" y2="10"></line>
      <line x1="14" y1="14" x2="14" y2="8"></line>
      <line x1="10" y1="14" x2="10" y2="11"></line>
    </svg>`;
  const ICON_TERM = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="12" width="18" height="8" rx="2"></rect>
      <circle cx="7" cy="16" r="1"></circle>
      <circle cx="11" cy="16" r="1"></circle>
      <path d="M8 8a6 6 0 0 1 8 0"></path>
      <path d="M5.5 5.5a10 10 0 0 1 13 0"></path>
    </svg>`;

  return `
    <div class="topo-v3-wrap">
      <div class="topo-v3-flow">
        <div class="topo-v3-node is-org">
          <div class="topo-v3-hd">
            <span class="topo-v3-icon">${ICON_ORG}</span>
            <div class="topo-v3-hd-text">
              <span class="topo-v3-type">정보센터</span>
            </div>
          </div>
          <div class="topo-v3-name">${_escapeHtml(orgName)}</div>
        </div>

        <div class="topo-v3-arrow"></div>

        <div class="topo-v3-node is-olt">
          <div class="topo-v3-hd">
            <span class="topo-v3-icon">${ICON_OLT}</span>
            <div class="topo-v3-hd-text">
              <span class="topo-v3-type">OLT</span>
              <span class="topo-v3-cnt">${oltCnt}대</span>
            </div>
          </div>
          <div class="topo-v3-name-list">${fmtOltNames(topo.olt_list)}</div>
        </div>

        <div class="topo-v3-arrow"></div>

        <div class="topo-v3-node is-onu">
          <div class="topo-v3-hd">
            <span class="topo-v3-icon">${ICON_ONU}</span>
            <div class="topo-v3-hd-text">
              <span class="topo-v3-type">ONU</span>
              <span class="topo-v3-cnt">${onuCnt}대</span>
            </div>
          </div>
          <div class="topo-v3-name-list">${fmtOnuNames(topo.onu_list)}</div>
        </div>

        <div class="topo-v3-arrow"></div>

        <div class="topo-v3-node is-term">
          <div class="topo-v3-hd">
            <span class="topo-v3-icon">${ICON_TERM}</span>
            <div class="topo-v3-hd-text">
              <span class="topo-v3-type">단말</span>
              <span class="topo-v3-cnt">${termCnt}대</span>
            </div>
          </div>
          <div class="topo-v3-name-list">${fmtTermNames(termList)}</div>
        </div>
      </div>
    </div>
  `;
}

// ── 문서 HTML 빌더 ───────────────────────────────────────────
function _buildReportDoc(r) {
  const cei       = r.cei   || {};
  const loss      = r.loss  || {};
  const pwr       = r.power || {};
  const voc       = r.voc   || {};
  const work      = r.work  || {};
  const equipment = r.equipment || [];

  const ceiAvg  = Number(cei.avg  || 0).toFixed(1);
  const badCnt  = cei.bad_count || 0;
  const svcCnt  = cei.svc_cnt   || 0;
  const ceiCls  = ceiAvg < 75 ? 'val-bad' : ceiAvg < 85 ? 'val-warn' : 'val-ok';

  const lossTotal = loss.total_7d || 0;
  const lossLatest = loss.latest  || 0;

  const pwrVal  = Number(pwr.level || 0).toFixed(1);
  const pwrAbn  = pwr.is_abnormal;

  const strdDt  = String(r.strd_dt || '');
  const dtLabel = strdDt.length >= 8
    ? `${strdDt.slice(0,4)}-${strdDt.slice(4,6)}-${strdDt.slice(6,8)}`
    : strdDt;

  const uid = Date.now();

  // 장비 테이블 행
  const equipRows = equipment.length
    ? equipment.map(e => `
        <tr>
          <td style="max-width:90px">${e.num}</td>
          <td style="max-width:140px">${e.tid}</td>
          <td class="bad-col">${e.bad_cnt}명</td>
          <td>${e.svc_cnt}명</td>
          <td class="${e.avg_cei < 75 ? 'bad-col' : 'ok-col'}">${e.avg_cei}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:10px">75점 이하 고객 없음</td></tr>`;

  // 작업/고장 칩
  let workChip = '';
  if (work.has_work) {
    const isF = (work.work_name || '').includes('고장');
    workChip = `<span class="doc-work-chip ${isF ? 'fault' : 'work'}">${work.work_name}</span>
                <span class="doc-work-chip work">${work.work_type}</span>`;
    if (work.broken_level && work.broken_level !== '#') {
      workChip += `<span class="doc-work-chip fault">등급: ${work.broken_level}</span>`;
    }
  } else {
    workChip = `<span class="doc-work-chip normal">작업/고장 없음</span>`;
  }

  const doc = document.createElement('div');
  doc.className = 'doc-report';
  doc.innerHTML = `
    <!-- 헤더 -->
    <div class="doc-header">
      <div class="doc-header-top">
        <span class="doc-header-icon">&#9776;</span>
        <span class="doc-title">${r.bld_nm} 점검</span>
      </div>
      <div class="doc-meta">
        분석일: ${dtLabel}<span class="sep">·</span>${r.org || '-'}<span class="sep">·</span>${r.team || '-'}<span class="sep">·</span>OLT: ${r.l3_tid || '-'}
      </div>
    </div>

    <!-- 1. CEI -->
    <div class="doc-section">
      <div class="doc-sec-title">
        <span class="doc-sec-num">1</span> CEI (고객체감품질지수)
      </div>
      <div class="doc-sec-body">
        <div class="doc-stat-line">
          <span>평균</span> <span class="${ceiCls}">${ceiAvg}점</span><span>· 75점 이하</span>
          <span class="val-bad">${badCnt}명</span> <span>존재 (전체 ${svcCnt}명 중</span>
          <span class="val-bad">${svcCnt > 0 ? (badCnt/svcCnt*100).toFixed(0) : 0}%</span><span>)</span>
        </div>
        <div class="doc-chart-label">75점이하 고객 추이 (최근 7일)</div>
        <div class="doc-chart-wrap">
          <canvas id="doc-cei-chart-${uid}"></canvas>
        </div>
      </div>
    </div>

    <!-- 2. 세부 점검 -->
    <div class="doc-section">
      <div class="doc-sec-title">
        <span class="doc-sec-num">2</span> 세부 점검
      </div>
      <div class="doc-sec-body">

        <!-- ① Loss -->
        <div class="doc-subsection">
          <div class="doc-sub-label">
            <span class="doc-sub-badge">①</span> Loss 발생 고객
          </div>
          <div class="doc-stat-line">
            <span>7일 연속 Loss 발생 고객수</span>
            <span class="${lossTotal > 0 ? 'val-bad' : 'val-ok'}">${lossTotal}명</span>
            <span>/ 당일 Loss 발생 고객수</span>
            <span class="${lossLatest > 0 ? 'val-bad' : 'val-ok'}">${lossLatest}명</span>
          </div>
          <div class="doc-chart-label">Loss 발생 고객수 추이 (최근 7일)</div>
          <div class="doc-chart-wrap">
            <canvas id="doc-loss-chart-${uid}"></canvas>
          </div>
        </div>

        <!-- ② 장비 집중 여부 -->
        <div class="doc-subsection">
          <div class="doc-sub-label">
            <span class="doc-sub-badge">②</span> 장비별 75점 이하 고객
          </div>
          <div class="doc-stat-line">동일 장비에 집중된 75점 이하 고객 현황</div>
          <div style="overflow-x:auto">
            <table class="doc-table">
              <thead>
                <tr>
                  <th>장비번호</th><th>TID</th>
                  <th>75점이하</th><th>전체</th><th>평균CEI</th>
                </tr>
              </thead>
              <tbody>${equipRows}</tbody>
            </table>
          </div>
        </div>

        <!-- ③ 광파워 -->
        <div class="doc-subsection">
          <div class="doc-sub-label">
            <span class="doc-sub-badge">③</span> 광파워 (Power Level)
          </div>
          <div class="doc-stat-line">
            ${pwrAbn
              ? `<span class="doc-power-badge abn">[!] ${pwrVal} dBm — 이상 (기준 -26 dBm 이하)</span>`
              : pwrVal === '0.0'
              ? `<span class="doc-power-badge ok">측정값 없음 (정상 범위 내)</span>`
              : `<span class="doc-power-badge ok">[OK] ${pwrVal} dBm — 정상</span>`
            }
          </div>
        </div>

        <!-- ④ VoC & 작업/고장 -->
        <div class="doc-subsection">
          <div class="doc-sub-label">
            <span class="doc-sub-badge">④</span> VoC · 작업/고장 이력
          </div>
          <div class="doc-stat-line">
            <span>당일 VoC</span>
            <span class="${(voc.latest||0) >= 3 ? 'val-bad' : 'val-ok'}">${voc.latest || 0}건</span>
            <span>/</span>
            <span>7일 합계</span>
            <span class="${(voc.total_7d||0) >= 5 ? 'val-bad' : 'val-ok'}">${voc.total_7d || 0}건</span>
          </div>
          <div style="margin-top:4px">${workChip}</div>
          ${work.has_work && work.oper_nm && work.oper_nm !== '-'
            ? `<div class="doc-stat-line" style="margin-top:6px;font-size:11.5px;color:var(--text-secondary)">${work.oper_nm}</div>`
            : ''}
        </div>

      </div>
    </div>

    <!-- 액션 바 -->
    <div class="doc-actions">
      <button class="doc-mail-btn" onclick="openDocMailModal('${r.bld_nm}')">
        <i data-lucide="mail" style="width:13px;height:13px"></i> 메일로 보고서 받기
      </button>
      <button class="doc-rerun-btn" onclick="runAnalysis()">
        <i data-lucide="refresh-cw" style="width:12px;height:12px"></i> 재분석
      </button>
      <span class="doc-actions-note">데이터 기준일: ${dtLabel}</span>
    </div>
  `;

  // uid를 data 속성에 저장 (차트 렌더링에 사용)
  doc.dataset.uid = uid;
  doc.dataset.reportJson = JSON.stringify(r);
  return doc;
}

// ── 차트 렌더링 ──────────────────────────────────────────────
function _renderDocCharts(r) {
  const uid   = Date.now(); // 이미 삽입된 canvas id와 맞춰야 함 — doc에서 uid 읽기
  const docEl = document.querySelector('.doc-report[data-uid]');
  if (!docEl) return;
  const u = docEl.dataset.uid;

  const cei  = r.cei  || {};
  const loss = r.loss || {};
  const dates = cei.dates || loss.dates || [];

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color:CHART_TEXT, font:{size:10}, boxWidth:10 } } },
    scales: {
      x: { ticks:{color:CHART_TICK,font:{size:9}}, grid:{color:CHART_GRID} },
      y: _yScaleAuto([]),
    },
  };

  // CEI / 75점이하 차트
  const ceiCtx = document.getElementById(`doc-cei-chart-${u}`);
  if (ceiCtx && (cei.bad_trend || []).length) {
    new Chart(ceiCtx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label:'75점이하 고객', data: cei.bad_trend, borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), borderWidth:2, tension:0.3, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2, fill:true },
        ],
      },
      options: { ...baseOpts, scales: { ...baseOpts.scales, y: _yScaleAuto(cei.bad_trend) } },
    });
  }

  // Loss 차트
  const lossCtx = document.getElementById(`doc-loss-chart-${u}`);
  if (lossCtx && (loss.trend || []).length) {
    new Chart(lossCtx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label:'Loss 발생 고객수', data: loss.trend, borderColor:CHART_RED, backgroundColor:chartAlpha(CHART_RED, .08), tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:CHART_RED, pointBorderColor:'#fff', pointBorderWidth:2 },
        ],
      },
      options: { ...baseOpts, scales: { ...baseOpts.scales, y: _yScaleAuto(loss.trend) } },
    });
  }
}

// ── 문서 메일 발송 모달 (보고서만 캡쳐) ──────────────────────
async function openDocMailModal(bldNm) {
  const modal = _openModal('mail-modal');
  if (!modal) return;

  const subjectEl = document.getElementById('mail-subject');
  if (subjectEl) subjectEl.value = `[C-One Agent] ${bldNm || ''} 건물 점검 보고서`;

  if (window.lucide) lucide.createIcons({ rootElement: modal });

  const preview = document.getElementById('mail-preview');
  preview.innerHTML = '<div class="mail-preview-placeholder"><i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i><span>보고서 캡쳐 중...</span></div>';
  if (window.lucide) lucide.createIcons({ rootElement: preview });

  _screenshotDataUrl = null;
  try {
    // 보고서 문서 요소만 캡쳐
    const docBubble = document.querySelector('#ap-thread .doc-bubble');
    if (!docBubble) throw new Error('보고서 없음');

    // 스크롤 없이 전체 높이로 캡쳐하기 위해 임시 확장
    const origOverflow = docBubble.style.overflow;
    const origMaxH     = docBubble.style.maxHeight;
    docBubble.style.overflow  = 'visible';
    docBubble.style.maxHeight = 'none';

    const canvas = await html2canvas(docBubble, {
      useCORS: true, allowTaint: true, scale: 1.5,
      backgroundColor: '#f7f8fa',
    });

    docBubble.style.overflow  = origOverflow;
    docBubble.style.maxHeight = origMaxH;

    _screenshotDataUrl = canvas.toDataURL('image/png');
    const img = document.createElement('img');
    img.src = _screenshotDataUrl;
    preview.innerHTML = '';
    preview.appendChild(img);
  } catch(e) {
    preview.innerHTML = '<div class="mail-preview-placeholder" style="color:var(--sem-bad)">캡쳐 실패: 먼저 건물 분석을 실행해주세요.</div>';
  }
}

// ── Mock 분석 (데이터 없는 건물 fallback) ────────────────────
async function _runMockAnalysis() {
  const session = _typingSession;
  const alive = () => session === _typingSession;
  const faultP = fetchAnalysis('fault');
  const workP  = fetchAnalysis('work');
  const alarmP = fetchAnalysis('alarm');

  appendThinking();
  const faultData = await faultP;
  if (!alive()) return;
  removeThinking();
  const faultR = faultData.result;
  if (faultR && !faultR.error) {
    const sb = createMsgRow('ai');
    await typewriterEl(sb, faultR.summary || '—', 45, { session });
    if (!alive()) return;
    if ((faultR.top_causes || []).length) await renderCauses(faultR.top_causes);
  }

  appendDivider('');
  appendThinking();
  const workData = await workP;
  if (!alive()) return;
  removeThinking();
  const workR = workData.result;
  if (workR && !workR.error) {
    const sb = createMsgRow('ai');
    await typewriterEl(sb, workR.summary || '—', 45, { session });
    if (!alive()) return;
  }

  appendDivider('');
  appendThinking();
  const alarmData = await alarmP;
  if (!alive()) return;
  removeThinking();
  const alarmR = alarmData.result;
  if (alarmR && !alarmR.error) {
    const sb = createMsgRow('ai');
    await typewriterEl(sb, alarmR.summary || '—', 45, { session });
  }
  if (!alive()) return;
  const thread = document.getElementById('ap-thread');
  await _appendFollowUp(thread);
}

function _appendMiniThinking(alive) {
  if (alive && !alive()) return;
  const thread = document.getElementById('ap-thread');
  if (!thread) return;
  // 기존 mini-thinking이 남아 있다면 먼저 제거 (중복 방지)
  const old = document.getElementById('_mini_thinking_row');
  if (old) old.remove();
  const row = document.createElement('div');
  row.className = 'ap-msg ai';
  row.id = '_mini_thinking_row';
  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble';
  bubble.innerHTML = '<div class="ap-thinking"><span></span><span></span><span></span></div>';
  row.appendChild(avatar);
  row.appendChild(bubble);
  thread.appendChild(row);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  _scrollThreadBottom(true);
}

function _removeMiniThinking() {
  const row = document.getElementById('_mini_thinking_row');
  if (row) row.remove();
}

// ── 분석 완료 후 "조치 방법" 디폴트 응답 ────────────────────────
async function _appendDefaultActionAnswer(session, alive = () => true) {
  if (!_currentBuilding) return;
  if (!alive()) return;
  const question = '조치 방법 알려줘';
  await appendChat('ai', '수집된 데이터와 분석 내용을 기반으로 조치 가이드를 제공해 드리겠습니다.', { session, speed: 17 });
  if (!alive()) return;
  _appendMiniThinking(alive);
  try {
    const res = await fetch(`${BASE_PATH}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, mode: 'fault', building_id: String(_currentBuilding.id), history: _chatHistory }),
      signal: _aiAbortSignal(),
    });
    const data = await res.json();
    _removeMiniThinking();
    if (!alive() || session !== _typingSession) return;
    const clean = _stripMarkdown(data.response);
    await appendChat('ai', clean, { session, speed: 20 });
    if (!alive()) return;
    _chatHistory.push({ role:'user', content: question }, { role:'ai', content: clean });
    if (_chatHistory.length > 20) _chatHistory = _chatHistory.slice(-20);
  } catch(e) {
    _removeMiniThinking();
    if (!alive() || e?.name === 'AbortError') return;
    await appendChat('ai', '조치 방법 생성 중 오류가 발생하였습니다.', { session });
  }
}

// ── 분석 완료 후 후속 질문 유도 ────────────────────────────────
async function _appendFollowUp(thread, alive = () => true, opts = {}) {
  if (!opts.skipGuide) await _appendDefaultActionAnswer(_typingSession, alive);
  if (!alive()) return;
  await new Promise(r => setTimeout(r, 318));
  if (!alive()) return;
  const row = document.createElement('div');
  row.className = 'ap-msg ai ap-followup-row';

  const avatar = document.createElement('div');
  avatar.className = 'ap-avatar';
  avatar.innerHTML = '<i data-lucide="bot"></i>';

  const wrap = document.createElement('div');
  wrap.className = 'ap-followup';
  wrap.innerHTML = `
    <div class="ap-followup-text" id="ap-followup-text">추가로 궁금한 사항이 있으신가요?</div>
    <div class="ap-followup-chips">
      <button class="ap-chip" onclick="prefillChat(this)">CEI 하락 원인은?</button>
      <button class="ap-chip" onclick="prefillChat(this)">유사 건물 현황은?</button>
    </div>
  `;

  row.appendChild(avatar);
  row.appendChild(wrap);
  thread.appendChild(row);
  _scrollThreadBottom(true);
  if (window.lucide) lucide.createIcons({ rootElement: row });
  const txt = row.querySelector('#ap-followup-text');
  if (txt) {
    txt.id = '';
    await typewriterEl(txt, '추가로 궁금한 사항이 있으신가요?', 37, { maxChars: 120 });
  }
}

function prefillChat(btn) {
  const input = document.getElementById('ap-chat-input');
  if (input) {
    input.value = btn.textContent;
    input.focus();
    sendChat();
  }
}

/* 우측 인사이트 패널의 빠른 질문 칩(quickPromptFromPanel)은 0820 피드백으로 제거 */

async function sendChat() {
  const input = document.getElementById('ap-chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await appendChat('user', message);
  if (!_currentBuilding) {
    await appendChat('ai', '분석할 건물을 먼저 선택해 주세요. 지도에서 마커를 클릭하거나 테이블 행을 선택해 주세요.');
    return;
  }
  const chatSession = _bumpTypingSession();
  try {
    const res = await fetch(`${BASE_PATH}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode: 'fault', building_id: String(_currentBuilding.id), history: _chatHistory }),
    });
    const data = await res.json();
    if (data.llm) {
      console.group('[LLM Status] /api/chat');
      console.log('ready:', data.llm.ready, '| key_set:', data.llm.api_key_set, '| key_prefix:', data.llm.api_key_prefix);
      if (!data.llm.ready) console.warn('LLM NOT READY — mock 응답 사용 중');
      console.groupEnd();
    }
    await appendChat('ai', data.response, { session: chatSession, speed: 43, md: true });
    _chatHistory.push({ role:'user', content: message }, { role:'ai', content: data.response });
    if (_chatHistory.length > 20) _chatHistory = _chatHistory.slice(-20);
  } catch(e) {
    await appendChat('ai', '응답 처리 중 오류가 발생하였습니다.', { session: chatSession });
  }
}

// ── 캡쳐 & 메일 발송 ─────────────────────────────────────────
let _screenshotDataUrl = null;

// 범용 캡쳐 메일 — targetEl(특정 패널)만 캡쳐해 메일 모달로. subject 지정 시 제목 프리필.
// 기존 헤더 ✉(전체 화면)과 장비별 정보 패널 등 부분 캡쳐가 같은 흐름을 공유한다.
async function openMailModalFor(targetEl, subject) {
  const modal = _openModal('mail-modal');
  if (!modal) return;
  if (window.lucide) lucide.createIcons({ rootElement: modal });
  if (subject) {
    const subj = document.getElementById('mail-subject');
    if (subj) subj.value = subject;
  }
  // 받는 사람 — 로그인 사용자 이메일 자동 채움 (비어 있을 때만, 수정 가능)
  // CURRENT_USER 는 const 선언이라 window 속성이 아님 — typeof 로 존재 확인
  const to = document.getElementById('mail-to');
  if (to && !to.value && typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.email)
    to.value = CURRENT_USER.email;

  // 미리보기 초기화
  const preview = document.getElementById('mail-preview');
  preview.innerHTML = '<div class="mail-preview-placeholder"><i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i><span>캡쳐 중...</span></div>';
  if (window.lucide) lucide.createIcons({ rootElement: preview });

  _screenshotDataUrl = null;
  try {
    const canvas = await html2canvas(targetEl || document.body, {
      useCORS: true, allowTaint: true, scale: targetEl ? 2 : 1,
      ignoreElements: el => el.id === 'mail-modal',
    });
    _screenshotDataUrl = canvas.toDataURL('image/png');
    const img = document.createElement('img');
    img.src = _screenshotDataUrl;
    preview.innerHTML = '';
    preview.appendChild(img);
  } catch(e) {
    preview.innerHTML = '<div class="mail-preview-placeholder" style="color:var(--sem-bad)">캡쳐 실패</div>';
  }
}

async function openMailModal() {
  return openMailModalFor(document.body, null);
}

function closeMailModal() {
  _closeModalById('mail-modal');
}

async function sendMail() {
  const to      = document.getElementById('mail-to').value.trim();
  const subject = document.getElementById('mail-subject').value.trim();
  const note    = document.getElementById('mail-note').value.trim();
  const status  = document.getElementById('mail-status');
  const btn     = document.getElementById('mail-send-btn');

  if (!to) { status.textContent = '받는 사람 이메일을 입력하세요.'; status.className = 'mail-status error'; return; }
  if (!_screenshotDataUrl) { status.textContent = '캡쳐 이미지가 없습니다.'; status.className = 'mail-status error'; return; }

  btn.disabled = true;
  status.textContent = '발송 중...'; status.className = 'mail-status';

  try {
    const res = await fetch(`${BASE_PATH}/api/send-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, note, image: _screenshotDataUrl }),
    });
    const data = await res.json();
    if (data.ok) {
      status.textContent = data.message || `${to} 으로 발송 완료`;
      status.className = 'mail-status success';
      setTimeout(closeMailModal, data.simulated ? 3000 : 1800);
    } else {
      status.textContent = data.error || '발송 실패'; status.className = 'mail-status error';
    }
  } catch(e) {
    status.textContent = '네트워크 오류'; status.className = 'mail-status error';
  } finally {
    btn.disabled = false;
  }
}

// ── SMS 모달 ─────────────────────────────────────────────────
function openSmsModal(preText) {
  const modal = _openModal('sms-modal');
  if (!modal) return;
  if (preText) document.getElementById('sms-content').value = preText;
  _updateSmsChar();
  if (window.lucide) lucide.createIcons({ rootElement: modal });
  document.getElementById('sms-to').focus();
}

function closeSmsModal() {
  _closeModalById('sms-modal');
  document.getElementById('sms-status').textContent = '';
}

function _updateSmsChar() {
  const ta = document.getElementById('sms-content');
  const counter = document.getElementById('sms-char');
  if (!ta || !counter) return;
  const len = ta.value.length;
  counter.textContent = len;
  counter.style.color = len > 90 ? 'var(--red)' : len > 70 ? 'var(--orange)' : 'var(--text-dim)';
}

async function sendSms() {
  const to      = document.getElementById('sms-to').value.trim();
  const content = document.getElementById('sms-content').value.trim();
  const statusEl = document.getElementById('sms-status');
  const sendBtn  = document.getElementById('sms-send-btn');

  if (!to)      { statusEl.textContent = '받는 번호를 입력하세요.'; statusEl.className = 'sms-status error'; return; }
  if (!content) { statusEl.textContent = '내용을 입력하세요.'; statusEl.className = 'sms-status error'; return; }
  if (content.length > 90) { statusEl.textContent = '내용이 90자를 초과했습니다.'; statusEl.className = 'sms-status error'; return; }

  sendBtn.disabled = true;
  statusEl.textContent = '발송 준비 중...';
  statusEl.className = 'sms-status';

  // TODO: 실제 SMS API 연동
  await new Promise(r => setTimeout(r, 800));
  statusEl.textContent = 'SMS 발송 기능은 준비 중입니다.';
  statusEl.className = 'sms-status error';
  sendBtn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('sms-content');
  if (ta) ta.addEventListener('input', _updateSmsChar);
  _syncOverlayState();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModalId = _OVERLAY_MODAL_IDS.find(id => document.getElementById(id)?.classList.contains('open'));
    if (openModalId) {
      _closeModalById(openModalId);
      return;
    }
    if (_isPanelOpen()) togglePanel();
  });
});

window.addEventListener('resize', () => {
  _panelSizes = _getPanelSizes();
  const panel = document.getElementById('ai-panel');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.classList.contains('panel-fullscreen')) return;
  _resetPanelPosition(panel, _currentPanelSize);
});

/* =====================================================
   마스터 데이터 바텀시트
   숨김 → (버튼) → peek(6행) → (드래그 위) → full
                ← (드래그 아래) ←
   ===================================================== */
(function() {
  const PEEK_H    = 310;  // --sheet-peek-h (CSS :root와 동일)
  const FULL_H    = 520;  // --sheet-full-h (CSS :root와 동일, 고정 px)
  const SNAP_PX   = 50;   // snap 전환 최소 드래그 거리

  // 상태: 'hidden' | 'peek' | 'full'
  let state = 'hidden';

  let sheet, handle, fab;
  let startY = 0, startTranslateY = 0;
  let isDragging = false;
  let dataLoaded = false;

  /* 현재 상태의 translateY 값 */
  function translateForState(s) {
    if (s === 'hidden') return FULL_H;
    if (s === 'peek')   return FULL_H - PEEK_H;
    return 0; // full
  }

  function applyState(s, animate) {
    state = s;
    sheet.classList.toggle('dragging', !animate);
    sheet.classList.remove('full', 'peek');
    if (s === 'peek') sheet.classList.add('peek');
    if (s === 'full') sheet.classList.add('full');
    sheet.style.transform = '';       // CSS 클래스가 transform 담당
    if (fab) fab.classList.toggle('hidden', s !== 'hidden');
  }

  /* 드래그 중 직접 translateY 설정 */
  function setY(py) {
    sheet.classList.add('dragging');
    sheet.style.transform = `translateY(${py}px)`;
  }

  /* ── 데이터 로드 ── */
  function loadData() {
    if (dataLoaded) return;
    dataLoaded = true;
    const tbody = document.getElementById('master-tbl-body');
    fetch(`${BASE_PATH}/api/master-table`)
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="master-tbl-loading">데이터 없음</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(r => {
          const cei = parseFloat(r.avg_cei);
          const ceiClass = cei < 75 ? 'cei-bad' : cei < 82 ? 'cei-warn' : '';
          const fmt = v => (typeof v === 'number' ? v.toLocaleString() : v);
          return `<tr>
            <td>${r.bld_cd}</td>
            <td class="master-tbl-bld-nm" data-bld="${r.bld_cd}" style="text-align:left;padding-left:14px;cursor:pointer">${r.bld_nm}</td>
            <td>${fmt(r.gen_cnt)}</td>
            <td>${fmt(r.svc_cnt)}</td>
            <td class="${ceiClass}">${r.avg_cei}</td>
            <td class="${r.bad_ce_cnt > 0 ? 'cei-bad' : ''}">${fmt(r.bad_ce_cnt)}</td>
            <td>${fmt(r.voc_cnt)}</td>
            <td>${(parseFloat(r.voc_rate) * 100 || 0).toFixed(1).replace(/\.0$/, '')}</td>
          </tr>`;
        }).join('');

        // 건물명 클릭 → 지도 이동
        tbody.querySelectorAll('.master-tbl-bld-nm').forEach(td => {
          td.addEventListener('click', () => {
            const bldCd = td.dataset.bld;
            const b = (window._buildingData || []).find(x => x.bld_cd === bldCd);
            if (!b) return;
            // 탭 전환 (메인 탭으로)
            const mainTab = document.getElementById('tab-main');
            if (mainTab) {
              document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
              document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
              mainTab.classList.add('active');
              const btn = document.querySelector('.tab[onclick*="main"]');
              if (btn) btn.classList.add('active');
              if (window._map) setTimeout(() => window._map.invalidateSize(), 50);
            }
            // 시트 닫기
            applyState('hidden', true);
            // 지도 이동 + 마커 강조 + 패널 업데이트
            const targetZoom = Math.max((window._map ? window._map.getZoom() : 0), 15);
            window._map && window._map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.8, easeLinearity: 0.5 });
            highlightMarker(bldCd);
            selectBuilding({ id: b.bld_cd, name: b.bld_nm, cei: b.cei_avg,
                             region: (b.province||'') + ' ' + (b.region||''),
                             status: b.status, cust_cnt: b.cust_cnt });
          });
        });
      })
      .catch(() => {
        dataLoaded = false;
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="master-tbl-loading">불러오기 실패</td></tr>';
      });
  }

  /* ── 공개 함수 ── */
  window.openMasterSheet = function() {
    loadData();
    applyState('peek', true);
  };

  /* ── 드래그 핸들러 ── */
  function onDown(e) {
    if (state === 'hidden') return;
    isDragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startTranslateY = translateForState(state);
    e.preventDefault();
  }

  function onMove(e) {
    if (!isDragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = y - startY;
    // 위로는 0(full)까지, 아래로는 FULL_H(완전숨김)까지
    const newY = Math.max(0, Math.min(FULL_H, startTranslateY + delta));
    setY(newY);
  }

  function onUp(e) {
    if (!isDragging) return;
    isDragging = false;
    sheet.classList.remove('dragging');

    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const delta = y - startY;

    if (state === 'full') {
      if (delta > SNAP_PX)        applyState('peek', true);
      else                         applyState('full', true);
    } else if (state === 'peek') {
      if (delta > SNAP_PX)        applyState('hidden', true);  // 아래로 → 숨김
      else if (delta < -SNAP_PX)  applyState('full', true);    // 위로 → full
      else                         applyState('peek', true);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    sheet  = document.getElementById('master-sheet');
    handle = document.getElementById('master-sheet-handle');
    fab    = document.getElementById('master-sheet-fab');
    if (!sheet || !handle) return;

    // 마우스
    handle.addEventListener('mousedown',   onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);

    // 터치
    handle.addEventListener('touchstart',  onDown, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  });
})();


// ── 개인화 시작 화면 — 로그인 사용자의 팀/담당지역부터 ──────
(function personalizeStart() {
  if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) return;
  const u = CURRENT_USER;
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const teamSel = document.getElementById('team-select');
    const ready = window._map && teamSel && teamSel.options.length > 1;
    if (!ready && tries < 80) return;
    clearInterval(timer);
    try {
      // 1) 내 팀 필터 자동 적용
      if (u.team && teamSel && [...teamSel.options].some(o => o.value === u.team)) {
        teamSel.value = u.team;
        onTeamChange(u.team);
      }
      // 2) 담당지역으로 지도 이동 (admin 기본 = 서울)
      const regions = u.regions || [];
      if (regions.length && window._map) {
        if (regions.some(r => r.includes('서울'))) {
          _map.setView([37.5665, 126.9780], 12);
        } else {
          const markers = (typeof MAP_MARKERS !== 'undefined' ? MAP_MARKERS : []);
          const hit = markers.find(m => regions.some(r =>
            (m.region || '').includes(r) || (m.province || '').includes(r) || (m.dong || '').includes(r)));
          if (hit && hit.lat && hit.lng) _map.setView([hit.lat, hit.lng], 13);
        }
      }
    } catch (e) { console.warn('개인화 시작 적용 실패', e); }
  }, 250);
})();


// ── 챗 헤더 LLM 연결 상태 배지 ────────────────────────────────
(async function llmBadge() {
  const el = document.getElementById('ap-llm-badge');
  if (!el) return;
  try {
    const st = await fetch(`${BASE_PATH}/api/llm-status`).then(r => r.json());
    el.textContent = st.ready ? '생성형 연결됨' : '로컬 분석 모드';
    el.classList.add(st.ready ? 'on' : 'off');
    el.title = st.ready ? `모델: ${st.deployment}` : 'LLM 미연결 — 규칙 기반 분석으로 동작 중';
  } catch (e) { el.textContent = ''; }
})();
