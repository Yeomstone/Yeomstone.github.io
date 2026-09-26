// ============================================================
//  c1-shell.js — c-1 디자인 이식: 사이드바 + 브레드크럼 헤더 + 홈 런처
//  dashboard.js 뒤에 로드된다. 기존 dashboard.js 는 수정하지 않고
//  switchTab 만 래핑해 브레드크럼 갱신을 덧붙인다.
// ============================================================

// ── switchTab 래핑 — 헤더 브레드크럼 갱신 (사이드바 네비의 data-tab-label) ──
//    도메인 그룹(장비품질개선/회선품질개선) 진입 시 data-tab-domain 을
//    중간 크럼으로 표시: C-One › 도메인 › 화면
(function wrapSwitchTab() {
  const orig = window.switchTab;
  if (typeof orig !== 'function') return;
  window.switchTab = function (name, btn) {
    orig(name, btn);
    const ds = (btn && btn.dataset) || {};
    const crumb = document.getElementById('crumb-current');
    if (crumb && ds.tabLabel) crumb.textContent = ds.tabLabel;
    const dom = document.getElementById('crumb-domain');
    const sep = document.getElementById('crumb-domain-sep');
    if (dom && sep) {
      const d = ds.tabDomain || '';
      dom.textContent = d;
      dom.hidden = !d;
      sep.hidden = !d;
    }
  };
})();

// ── 로딩 표시 헬퍼 (전 화면 공통 — 차분한 중앙 스피너 + 한 줄 안내) ──
//    행별 shimmer 는 어지럽다는 피드백으로 제거. 호출부 시그니처는 유지.
function _ldgBlock(note) {
  return `
    <div class="ldg">
      <span class="ldg-spin" aria-hidden="true"></span>
      <span class="ldg-txt">${note || '불러오는 중…'}</span>
    </div>`;
}

function skelTableRows(cols, rows = 5, note = '') {
  return `<tr class="ldg-tr"><td colspan="${cols}">${_ldgBlock(note)}</td></tr>`;
}

function skelCards(n = 3, note = '') {
  return _ldgBlock(note);
}

// ── 사이드바 접기/펼치기 (localStorage 기억) ─────────────────
function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  try { localStorage.setItem('c1.sidebar.collapsed', collapsed ? '1' : '0'); } catch (e) {}
  if (window._map) setTimeout(() => window._map.invalidateSize(), 220);
}

// ── 홈 런처 — 카드 클릭 시 해당 사이드바 네비 버튼 클릭을 재사용
//    (switchTab 내부 로직 무수정: 사이드바 활성 상태·브레드크럼·
//     관제 맵 진입 시 map.invalidateSize()가 기존 경로 그대로 동작) ──
function homeGo(name) {
  const btn = document.getElementById('snav-' + name);
  if (btn) btn.click();
}

// 홈이 기본 탭이 되면서 부팅 시 #tab-main이 숨김(0x0) 상태로 지도가 초기화된다.
// Leaflet flyTo는 컨테이너 크기로 나누는 비행경로 계산 때문에 0x0에서 NaN LatLng
// 오류를 낸다 → 크기가 없을 때만 setView(무애니메이션)로 대체하는 가드를
// 프로토타입에 덧씌운다. (스크립트 로드 시점 즉시 적용 — 기존 호출부 무수정,
// 지도가 표시된 뒤에는 원래 flyTo 그대로 동작)
(function guardHiddenMapFlyTo() {
  if (!window.L || !L.Map) return;
  const origFlyTo = L.Map.prototype.flyTo;
  L.Map.prototype.flyTo = function (latlng, zoom, opts) {
    const s = this.getSize();
    if (!s.x || !s.y) return this.setView(latlng, zoom, { animate: false });
    return origFlyTo.call(this, latlng, zoom, opts);
  };
})();

// ── 화면 사용법 매뉴얼 모달 (dashboard.js 의 _openModal 헬퍼 재사용) ──
function openHelpModal() {
  if (typeof _openModal === 'function') _openModal('help-modal');
  else document.getElementById('help-modal')?.classList.add('open');
  if (window.lucide) lucide.createIcons();
}
function closeHelpModal() {
  if (typeof _closeModalById === 'function') _closeModalById('help-modal');
  else document.getElementById('help-modal')?.classList.remove('open');
}
function switchHelpTab(key, btn) {
  document.querySelectorAll('#help-modal .help-tab').forEach(b => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('#help-modal .help-pane').forEach(p => {
    p.classList.toggle('active', p.id === `help-pane-${key}`);
  });
}

// ── 화면 초기화 — 현재 탭을 처음 진입한 상태로 (헤더 공통 버튼) ──
// 탭별 부분 초기화는 숨은 상태(필터·선택·AI 대화·체크박스·진입 컨텍스트)를
// 놓치기 쉬워 리로드로 확실히 되돌린다. 현재 탭만 sessionStorage 에 남겨
// 리로드 후 같은 화면으로 복귀한다 (홈이면 그냥 기본 화면).
function resetCurrentView() {
  const active = document.querySelector('.snav-item.tab.active');
  try { sessionStorage.setItem('c1.reset.nav', active ? active.id : ''); } catch (e) {}
  location.reload();
}

(function restoreTabAfterReset() {
  let id = '';
  try {
    id = sessionStorage.getItem('c1.reset.nav') || '';
    sessionStorage.removeItem('c1.reset.nav');
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  if (!id) {
    const tabIds = {
      main: 'snav-main', eqp: 'snav-eq-ops', board: 'snav-eq-board',
      top30: 'snav-eq-trend', work: 'snav-eq-work', ops: 'snav-ln-ops',
      equip: 'snav-ln-trend', model: 'snav-model',
    };
    id = tabIds[params.get('tab')] || '';
  }
  // snav 버튼 클릭 재사용 — switchTab + 탭별 init(eqpInit 등)이 기존 경로로 실행
  if (id && id !== 'snav-home') document.getElementById(id)?.click();
  const modelId = params.get('model');
  if (modelId && typeof openModelCard === 'function') openModelCard(modelId);
  if (params.get('autodemo') === '1' && typeof adStart === 'function') setTimeout(adStart, 0);
})();

// ── 헤더 서브라인 — 데이터 기준일 (cei-kpi 의 strd_dt) ───────
(function initHeaderSubline() {
  let tries = 0;
  function load() {
    fetch(`${BASE_PATH}/api/cei-kpi`)
      .then(r => r.json())
      .then(d => {
        const sub = document.getElementById('header-subline');
        if (sub && d && d.strd_dt) {
          const s = String(d.strd_dt);
          const dt = s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
          sub.textContent = `품질 관리 종합 Agent · 데이터 기준일 ${dt}`;
        } else if (++tries < 24) {
          setTimeout(load, 5000);   // 데이터 적재 전이면 잠시 뒤 재시도
        }
      })
      .catch(() => { if (++tries < 24) setTimeout(load, 5000); });
  }
  load();
})();
