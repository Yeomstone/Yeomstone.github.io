/* ============================================================
   autodemo.js — 자동 시연 모드 (고스트 커서)
   ------------------------------------------------------------
   헤더 [▶ 자동 시연] → 고스트 커서가 실제 버튼을 순서대로 눌러
   골든 패스(관제→건물진단→장비 러너북→지시서 실발행→관제 복귀→
   자율복구 히스토리→TOP30→모델 구조도)를 재생하고, 하단 자막 바에
   시연 멘트를 띄운다. 목업 화면 재생이 아니라 **진짜 앱이 눌린다**.
   제어: Space 일시정지/재개 · ESC 또는 실제 마우스 클릭 시 즉시 중단.
   각 단계는 타임아웃 시 건너뛰고 계속 진행 — 시연 중 멈춤 사고 방지.
   멘트 원문: DEMO_SCRIPT.md (여기 자막은 축약본).
   ============================================================ */

let _adRunning = false;
let _adPaused = false;
let _adAbort = false;
let _adStepNo = 0;

class AdAbortError extends Error {}

// ── 오버레이 요소 (커서·자막·배지) ──────────────────────────
function _adMount() {
  const cur = document.createElement('div');
  cur.id = 'ad-cursor';
  cur.innerHTML = `<span class="ad-halo"></span>
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path d="M5 2 L5 19 L9.5 15.2 L12.4 21.6 L15.1 20.4 L12.2 14 L18 14 Z"
        fill="var(--color-bg, #fff)" stroke="var(--color-text-1, #111)" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`;
  const cap = document.createElement('div');
  cap.id = 'ad-caption';
  cap.innerHTML = '<span class="ad-cap-step"></span><span class="ad-cap-text"></span>';
  const badge = document.createElement('div');
  badge.id = 'ad-badge';
  badge.textContent = '자동 시연 중 — Space 일시정지 · ESC 중단';
  document.body.append(cur, cap, badge);
}

function _adUnmount() {
  ['ad-cursor', 'ad-caption', 'ad-badge'].forEach(id => document.getElementById(id)?.remove());
}

function adSay(text, opts = {}) {
  const cap = document.getElementById('ad-caption');
  if (!cap) return;
  if (!opts.keepStep) _adStepNo++;
  cap.querySelector('.ad-cap-step').textContent = opts.wait ? '…' : `STEP ${_adStepNo}`;
  cap.querySelector('.ad-cap-text').textContent = text;
  cap.classList.toggle('is-wait', !!opts.wait);
}

// ── 대기·이동·클릭 헬퍼 (전부 pause/abort 관통) ──────────────
function _adTick() {
  if (_adAbort) throw new AdAbortError();
}

async function adSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end || _adPaused) {
    _adTick();
    await new Promise(r => setTimeout(r, 100));
    if (!_adPaused && Date.now() >= end) break;
  }
}

// 조건 충족까지 폴링. 타임아웃이면 null 반환 (단계 스킵용) — throw 안 함.
async function adWaitFor(fn, timeout = 30000, waitText) {
  if (waitText) adSay(waitText, { wait: true, keepStep: true });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    _adTick();
    if (!_adPaused) {
      let v = null;
      try { v = fn(); } catch (e) { /* 대상 미존재 등은 계속 대기 */ }
      if (v) return v;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

function _adCursorTo(x, y, ms) {
  const cur = document.getElementById('ad-cursor');
  if (!cur) return;
  cur.style.transitionDuration = `${ms}ms`;
  cur.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

async function adMoveTo(el) {
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await adSleep(450);
  const r = el.getBoundingClientRect();
  const x = r.left + Math.min(r.width / 2, 120);
  const y = r.top + r.height / 2;
  const cur = document.getElementById('ad-cursor');
  const m = cur ? new DOMMatrixReadOnly(getComputedStyle(cur).transform) : { e: 0, f: 0 };
  const dist = Math.hypot(x - m.e, y - m.f);
  const ms = Math.max(350, Math.min(950, dist * 0.9));
  _adCursorTo(x, y, ms);
  await adSleep(ms + 150);
}

async function adClick(el, sayText) {
  if (!el) return false;
  await adMoveTo(el);
  const cur = document.getElementById('ad-cursor');
  if (cur) {
    const rip = document.createElement('span');
    rip.className = 'ad-ripple';
    cur.appendChild(rip);
    setTimeout(() => rip.remove(), 700);
  }
  el.classList.add('ad-press');
  setTimeout(() => el.classList.remove('ad-press'), 350);
  await adSleep(250);
  _adTick();
  el.click();
  if (sayText) adSay(sayText);
  return true;
}

function adFindBtn(rootSel, re) {
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return null;
  return [...root.querySelectorAll('button')].find(b => re.test(b.textContent) && !b.disabled) || null;
}

// ── 시나리오 본편 ─────────────────────────────────────────────
async function _adScenario() {
  // 1. 관제 진입 + 인트로
  await adClick(document.getElementById('snav-main'),
    '지금까지는 담당자가 FOMS·RMS·엑셀을 하나씩 열어 경험으로 판단했습니다. 이제 C-One AI가 학습된 4종 모델로 오늘의 조치 대상을 먼저 골라줍니다.');
  await adSleep(2600);

  // 2. 오늘 조치 대상 — 추천 리스트 (내곡한라 우선, 없으면 현장조치 필요 첫 건)
  const item = await adWaitFor(() => {
    const items = [...document.querySelectorAll('#ctl-ai-list .ctl-item')];
    return items.find(i => i.textContent.includes('내곡한라'))
      || items.find(i => i.querySelector('.ctl-chip--field')) || items[0] || null;
  }, 60000, '오늘의 조치 대상을 불러오는 중…');
  if (item) {
    await adMoveTo(item);
    adSay('상태가 세 가지로 나뉩니다 — 자율복구 완료(기계가 처리), 자율복구 예약(오늘 밤 원격), 현장조치 필요(사람이 가야 할 것만 선별). 하락 확률은 XGBoost 등급하락 예측 모델의 판단입니다.');
    await adSleep(4200);

    // 3. 진단 결과 보기 → 건물 진단
    await adClick(item.querySelector('.ctl-item-btn'),
      '건물을 고르는 순간 C-One이 CEI·광파워·작업이력·VoC를 자동 수집해 진단을 시작합니다.');
  }

  // 4. 리포트 스트리밍 → [출력]
  const outBtn = await adWaitFor(() => adFindBtn('#ai-panel', /출력/), 90000,
    'C-One AI가 데이터를 수집·분석하는 중입니다…');
  if (outBtn) await adClick(outBtn, 'Network 토폴로지 진단 리포트를 이어서 출력합니다.');

  // 5. 건물 종합 진단 카드 — 3축 + 이상탐지 게이지
  const diagAi = await adWaitFor(() => document.querySelector('#ai-panel .ap-diag-ai'), 60000,
    '토폴로지 진단과 건물 종합 진단을 생성하는 중입니다…');
  if (diagAi) {
    await adMoveTo(diagAi);
    adSay('원인을 전일 작업(SWING)·선로·장비 품질 축으로 구분하고, 지난밤 자율복구 결과까지 반영해 결론을 냅니다. 이 게이지가 이상탐지 모델(1D CNN AutoEncoder)의 스코어입니다.');
    await adSleep(4600);
  }

  // 6. BS 관리 화면으로 이동
  const goBtn = await adWaitFor(() => document.querySelector('#ai-panel .ap-chip--go'), 20000);
  if (goBtn) await adClick(goBtn, '사람은 승인만 — 장비 단위 세부 진단으로 이동합니다.');

  // 7. 장비 러너북 (STEP 1~4)
  await adWaitFor(() => document.querySelector('#eqp-steps .eqp-step-card'), 30000,
    '장비를 전개해 토폴로지 진단을 수행하는 중입니다…');
  await adSleep(2200);
  const steps = document.getElementById('eqp-steps');
  if (steps) {
    await adMoveTo(steps.querySelector('.eqp-step'));
    adSay('C-One이 장비를 전개해 개별 회선은 자율복구로, 구간·물리 지표 이상은 현장 지시서로 — 조치 방법까지 분류했습니다. 표의 AI 스코어는 장비별 이상탐지 모델 값입니다.');
    await adSleep(4600);
  }

  // 8. 장비 행 클릭 → 팩터 기여도 (SHAP)
  const row = document.querySelector('#eqp-steps .eqp-tt-row');
  if (row) {
    await adClick(row);
    const aiBlk = await adWaitFor(() => document.querySelector('#eqp-ins-body .eqp-ins-ai'), 15000,
      '장비별 정보를 수집하는 중입니다…');
    if (aiBlk) {
      await adMoveTo(aiBlk);
      adSay('왜 이 장비가 문제인지 — 모델이 본 팩터별 기여도입니다. 기여가 큰 팩터가 그대로 조치 권고(신뢰도 %)로 이어집니다.');
      await adSleep(4600);
    }
  }

  // 9. 지시서 발행 미리보기 (STEP4 자동 체크분 우선, 없으면 구간 점검 발행)
  const issueBtn = document.querySelector('#eqp-step4-issue:not([disabled])')
    || adFindBtn('#eqp-steps', /지시서 발행/);
  if (issueBtn) {
    await adClick(issueBtn, 'Ticket(작업지시서) 발행 미리보기 — 경험 없는 담당자도 그대로 조치할 수 있는 수준으로 만듭니다.');
    await adWaitFor(() => document.getElementById('eqp-issue-modal')?.classList.contains('open'), 10000);

    // 10. AI 판단 근거 블록
    const aiRow = await adWaitFor(() => document.querySelector('#eqp-iss-body .eqp-iss-row--ai'), 8000);
    if (aiRow) {
      await adMoveTo(aiRow);
      adSay('지시서에 AI 판단 근거가 담깁니다 — 사용 모델·버전, 이상 스코어, 주 기여 팩터, 권고 분류 신뢰도까지. 이 문서 자체가 모델의 판단입니다.');
      await adSleep(5200);
    }

    // 11. 개별 발행 → 12. 전체 발행/복귀
    const oneBtn = adFindBtn(document.getElementById('eqp-iss-card-ft-0'), /발행/);
    if (oneBtn) {
      await adClick(oneBtn, '발행 즉시 FMS로 연계돼 담당 Post에 자동 할당됩니다.');
      await adWaitFor(() => (document.getElementById('eqp-iss-card-ft-0')?.textContent || '').includes('발행 완료'), 15000);
      await adSleep(1500);
    }
    const allBtn = document.getElementById('eqp-iss-all-btn');
    if (allBtn && !allBtn.disabled) await adClick(allBtn);
    await adWaitFor(() => !document.getElementById('eqp-issue-modal')?.classList.contains('open'), 10000);
  }

  // 관제 복귀 + 발행완료 칩
  if (!document.getElementById('tab-main')?.classList.contains('active'))
    await adClick(document.getElementById('snav-main'));
  adSay('관제로 복귀하면 해당 건물이 발행완료로 바뀝니다 — 발행이 끝이 아니라 조치 후 CEI 효과검증까지 추적합니다.');
  const chip = await adWaitFor(() => document.querySelector('#ctl-ai-list .ctl-chip--issued'), 8000);
  if (chip) await adMoveTo(chip);
  await adSleep(3800);

  // 13. 자율복구 복귀 히스토리 (주례경동리인)
  await adClick(document.getElementById('snav-eq-ops'),
    '이번엔 사람이 가기 전에 기계가 먼저 처리한 케이스 — 지난밤 자율복구로 복귀한 건물입니다.');
  // 관제→BS 진입은 건물코드 프리필 검색(1건)이라, 전체 목록으로 리셋 후 재추출.
  const backBtn = document.querySelector('#eqp-detail-view:not([hidden]) .eqp-dx-back');
  if (backBtn) await adClick(backBtn);
  const bldInput = document.getElementById('eqp-blds');
  if (bldInput && bldInput.value) {
    bldInput.value = '';
    const searchBtn = adFindBtn('#eqp-list-view', /추출/);
    if (searchBtn) await adClick(searchBtn);
  }
  const jRow = await adWaitFor(() => {
    const rows = [...document.querySelectorAll('#eqp-target-body .eqp-target-row')];
    return rows.find(r => r.textContent.includes('주례경동'))
      || rows.find(r => r.querySelector('.eqp-arc--ok')) || null;
  }, 30000, '조치 대상 건물을 불러오는 중…');
  if (jRow) {
    await adClick(jRow);
    await adWaitFor(() => document.querySelector('#eqp-steps .eqp-step-card'), 20000);
    await adSleep(2200);

    // 14. 세부이력 → 전후 비교(예측 오버레이)
    const histBtn = await adWaitFor(() => document.querySelector('#eqp-steps .eqp-st-histcol button'), 10000);
    if (histBtn) {
      await adClick(histBtn, '지난밤 02시 자율복구 Agent가 포트 리셋을 수행해 위험에서 정상으로 회복됐습니다.');
      const note = await adWaitFor(() => document.querySelector('#eqp-ar-modal.open #eqp-ar-pred-note'), 12000);
      if (note) {
        await adMoveTo(note);
        adSay('점선이 모델이 예측한 개선폭, 실선이 실제입니다. 예측 대비 실제를 계속 비교하며 대상선정 로직이 다시 학습됩니다 — Closed-loop입니다.');
        await adSleep(5200);
      }
      const closeBtn = adFindBtn('#eqp-ar-modal', /닫기/);
      if (closeBtn) await adClick(closeBtn);
    }
  }

  // 15. TOP30 — 전망 음영
  await adClick(document.getElementById('snav-eq-trend'),
    '이 Loop가 매일 돌면 TOP30이 졸업하고 전국 C·D 비중이 내려갑니다.');
  const goal = await adWaitFor(() => {
    const g = document.getElementById('t30-ins-goal');
    return g && !document.getElementById('t30-insight')?.hidden ? g : null;
  }, 30000, 'TOP30 개선 성과를 불러오는 중…');
  if (goal) {
    await adMoveTo(goal);
    adSay('그래프의 음영 구간이 시계열 모델의 전망입니다 — 이 추세면 3개월 내 약 60% 개선 전망입니다.');
    await adSleep(4200);
  }

  // 16. 🧠 뱃지 → AI 모델 구조도
  const mb = document.querySelector('#t30-insight .ai-mbadge') || document.getElementById('snav-model');
  await adClick(mb, '화면 곳곳의 🧠 뱃지를 누르면 그 판단을 내린 모델로 이동합니다.');
  await adWaitFor(() => document.getElementById('tab-model')?.classList.contains('active'), 8000);
  const pipe = await adWaitFor(() => document.querySelector('.mdl-pipe'), 8000);
  if (pipe) {
    await adMoveTo(pipe);
    adSay('데이터 수집 → 전처리 → 학습된 모델 4종 → 진단·지시서. 모델별 학습 기간·성능 지표·재학습 주기가 카드에 있습니다.');
    await adSleep(5200);
  }

  // 17. 마무리 — 관제 복귀
  await adClick(document.getElementById('snav-main'),
    '사건 발생 → 탐지 → 진단 → 대상선정 → Auto-reset 또는 Ticket → 조치 → CEI 효과검증 → 학습. 이 Loop가 매일 같은 기준으로 반복되는 것이 C-One입니다.');
  await adSleep(5200);
}

// ── 시작/종료 ─────────────────────────────────────────────────
function _adKeydown(e) {
  if (!_adRunning) return;
  if (e.key === 'Escape') { _adAbort = true; e.preventDefault(); }
  if (e.code === 'Space') {
    _adPaused = !_adPaused;
    const b = document.getElementById('ad-badge');
    if (b) b.textContent = _adPaused
      ? '⏸ 일시정지 — Space 재개 · ESC 중단'
      : '자동 시연 중 — Space 일시정지 · ESC 중단';
    e.preventDefault();
  }
}

// 실제 사용자 클릭(isTrusted)이 들어오면 시연자를 방해하지 않게 즉시 중단
function _adUserClick(e) {
  if (_adRunning && e.isTrusted) _adAbort = true;
}

async function adStart() {
  if (_adRunning) return;
  _adRunning = true;
  _adPaused = false;
  _adAbort = false;
  _adStepNo = 0;
  const startBtn = document.getElementById('ad-start-btn');
  if (startBtn) startBtn.disabled = true;
  _adMount();
  document.addEventListener('keydown', _adKeydown, true);
  document.addEventListener('mousedown', _adUserClick, true);
  _adCursorTo(window.innerWidth / 2, window.innerHeight / 2, 0);
  try {
    await _adScenario();
    adSay('자동 시연을 마쳤습니다. 이어서 자유롭게 조작하세요.', { keepStep: true });
    await adSleep(2600);
  } catch (e) {
    if (!(e instanceof AdAbortError)) console.warn('[autodemo]', e);
  } finally {
    document.removeEventListener('keydown', _adKeydown, true);
    document.removeEventListener('mousedown', _adUserClick, true);
    _adUnmount();
    _adRunning = false;
    if (startBtn) startBtn.disabled = false;
  }
}
