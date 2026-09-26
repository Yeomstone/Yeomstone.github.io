/* ============================================================
   home.js — 모닝 브리핑 홈 (0819 3차 피드백 R1)
   "아침에 열면 C-One이 밤새 분석한 오늘의 할 일이 먼저 보인다."
   사람은 결과를 읽고 승인(지시서 발행·자율복구)만 한다.
   데이터: 기존 API 재사용 — POST /api/eqp/targets(자율복구 리포트·대상선정),
           GET /api/eqp/workitems(진행 중 지시서). 백엔드 무수정.
   ============================================================ */

let _brfData = null;      // targets 응답 캐시 — 행 클릭 딥링크에 사용
let _brfItems = null;     // workitems 캐시 — 물량 조절 재렌더용
let _brfArH = null;       // 자율복구 과거 실적(/api/ar-hist) — 없어도 브리핑은 동작
let _brfLoading = false;
let _brfVol = 5;          // 오늘 처리 물량 (케파 조절 — 사람 개입 지점, R1)

function brfDateLabel(d8) {
  if (!d8 || String(d8).length < 8) return '';
  const s = String(d8);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// 큰 수 천단위 콤마 — 실데이터(전국 스코프)에서 십만 단위가 나온다
function brfFmt(n) { return (n ?? 0).toLocaleString('ko-KR'); }

// 부팅 직후 데이터 적재가 끝나기 전이면 ready 될 때까지 폴링 후 로드.
// 주의: data-status의 inf/tot 준비와 별개로 장비(equip) 마스터는 더 늦게
// 적재된다 — targets 응답의 ready/base_dt 로 최종 판정하고, 준비 전이면
// 0건을 그리지 말고 스피너를 유지한 채 재시도한다 (0820 서버 0건 문제).
const _BRF_LOADING_HTML = `<div class="ldg"><span class="ldg-spin" aria-hidden="true"></span>
  <span class="ldg-txt">C-One이 금일 레포트를 출력하는 중…</span></div>`;

async function brfInit(attempt) {
  attempt = attempt || 0;
  if (_brfLoading) return;
  _brfLoading = true;
  const box = document.getElementById('brf-root');
  if (!box) return;
  for (let i = 0; i < 60; i++) {
    try {
      const st = await fetch(`${BASE_PATH}/api/data-status`).then(r => r.json());
      if (st && st.inf_ready && st.tot_ready) break;
    } catch (e) { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 2500));
  }
  try {
    const [tg, wi, arh] = await Promise.all([
      fetch(`${BASE_PATH}/api/eqp/targets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      }).then(r => r.json()),
      fetch(`${BASE_PATH}/api/eqp/workitems`).then(r => r.json()),
      fetch(`${BASE_PATH}/api/ar-hist`).then(r => r.json()).catch(() => null),
    ]);
    _brfArH = (arh && arh.ready) ? arh : null;
    // 장비 데이터 미적재 (재기동 직후) — 최대 10분 재시도
    if (!tg || tg.ready === false || !tg.base_dt) {
      _brfLoading = false;
      if (attempt < 60) {
        box.innerHTML = _BRF_LOADING_HTML;
        setTimeout(() => brfInit(attempt + 1), 10000);
      } else {
        box.innerHTML = `<div class="ops-empty">서버 데이터 적재가 오래 걸리고 있습니다 — 잠시 뒤 새로고침해 주세요.</div>`;
      }
      return;
    }
    _brfData = tg;
    _brfItems = (wi && wi.items) || [];
    // 스킵 시엔 brfStreamSkip이 이미 렌더했으므로 완주(true)일 때만 그린다
    if (_brfStreamDone || await brfPlayStream(tg, _brfItems)) brfRender(tg, _brfItems);
  } catch (e) {
    box.innerHTML = `<div class="ops-empty">브리핑 데이터를 불러오지 못했습니다 — 네트워크 확인 후 새로고침해 주세요.</div>`;
  }
  _brfLoading = false;
}

/* ── C-One 분석 스트림 (0820) — 홈 첫 진입 시 1회 재생 ────────
   Closed-loop 앞 4단계(탐지→진단→대상선정→액션)를 카드로 순차 재생해
   "Agent가 스스로 판단해 대상을 골랐다"를 화면으로 보여준다.
   본문은 실데이터로 생성 — 0건/자율복구 유무에 따라 문장이 달라진다.
   클릭(건너뛰기) 시 즉시 브리핑 본문으로 넘어간다. 재생은 페이지 로드당 1회. */
let _brfStreamDone = false;
let _brfStreamRun = 0;

function brfStreamSteps(tg, items) {
  const ar = tg.ar_report || { tried: 0, ok: 0, fail: 0 };
  const targets = tg.targets || [];
  const pendingTotal = tg.pending ?? targets.filter(t => (t.score || 0) > 0).length;
  const doneTotal = tg.done_total ?? targets.filter(t => (t.score || 0) <= 0 && t.ar_ok > 0).length;
  const nTrack = items.filter(i => i.status === 'issued' || i.status === 'resolved').length;
  const vol = Math.min(_brfVol, pendingTotal) || _brfVol;
  const s1 = `시스템별 개별 조회 대신, 기준일 ${brfDateLabel(tg.base_dt)} 전국 CEI·VoC·장비 데이터를 통합 스캔했습니다 — 품질 위험 신호가 감지된 건물 ${brfFmt(pendingTotal + doneTotal)}곳${ar.tried ? `, 위험 장비 ${brfFmt(ar.tried)}대` : ''}를 확인했습니다.`;
  const s2 = ar.tried
    ? `위험 장비 ${brfFmt(ar.tried)}대의 원인을 진단해 원격 복구 가능 ${brfFmt(ar.ok)}대, 현장 조치 필요 ${brfFmt(ar.fail)}대로 분류했습니다.`
    : '감지된 위험 신호를 원인 유형별로 진단했습니다 — 원격 복구 가능 대상은 없습니다.';
  const s3 = pendingTotal
    ? `물량이 아니라 개선 효과 기준 — C·D 가입자·VoC·복구 이력을 종합한 스코어로 건물 ${brfFmt(pendingTotal)}곳을 선별했습니다.`
    : '스코어 기준을 넘는 신규 조치 대상이 없습니다 — 기존 진행 건 추적에 집중합니다.';
  let s4;
  if (ar.tried && pendingTotal) {
    s4 = `지난밤 Auto-reset으로 ${brfFmt(ar.ok)}대를 원격 복구해 CEI 효과검증을 추적 중입니다${doneTotal ? ` (건물 ${brfFmt(doneTotal)}곳은 지시서 없이 정상화)` : ''}. 남은 ${brfFmt(pendingTotal)}곳은 상위 ${vol}곳부터 지시서 검토를 권장합니다.`;
  } else if (ar.tried) {
    s4 = `지난밤 Auto-reset으로 ${brfFmt(ar.ok)}대를 원격 복구했습니다. 신규 지시서 대상은 없으며, 복구분의 CEI 효과검증을 추적합니다.`;
  } else if (pendingTotal) {
    s4 = `상위 ${vol}곳부터 지시서 검토를 권장합니다. 조치 후 CEI 효과검증까지 C-One이 추적합니다.`;
  } else {
    s4 = `진행 중 지시서 ${nTrack}건의 조치·CEI 효과검증을 추적합니다.`;
  }
  // 과거 실적 — '물량'이 아니라 '선별 정확도'가 주어 (컨셉: 효과 높은 대상의
  // 정확한 선별). 실행 성공률은 명령 기준임을 명시해 CEI 효과검증과 구분한다.
  const h = _brfArH;
  if (h && h.ok) {
    s4 += ` 최근 ${h.window_days}일 Auto-reset 실행 성공률(명령 기준)은 ${h.rate}% — 정확히 선별된 ${brfFmt(h.ok)}건이 자율복구로 정상화됐습니다.`;
  }
  return [
    { no: 1, name: '탐지', text: s1 },
    { no: 2, name: '진단', text: s2 },
    { no: 3, name: '대상선정', text: s3 },
    { no: 4, name: 'Auto-reset · Ticket', text: s4 },
  ];
}

function brfStreamCard(s) {
  return `
  <div class="brf-sc pending">
    <span class="brf-sc-rail"><span class="brf-sc-dot"></span></span>
    <div class="brf-sc-main">
      <div class="brf-sc-hd">
        <span class="brf-sc-step">STEP ${s.no}</span>
        <span class="brf-sc-name">${s.name}</span>
        <span class="brf-sc-status">대기</span>
      </div>
      <p class="brf-sc-text"></p>
    </div>
  </div>`;
}

// 스트림 문장 숫자 강조 — 단위(곳/대/건/명)가 붙은 수치만 <b> 처리
// (기준일 날짜처럼 단위 없는 숫자는 제외). 문장은 앱 생성 템플릿이라 안전.
function brfEmphNum(text) {
  return String(text).replace(/(\d[\d,]*)\s?(곳|대|건|명)/g, '<b>$1$2</b>');
}

// 한 글자씩 타이핑 — 문장부호 뒤엔 잠깐 쉼. run 불일치(건너뛰기) 시 즉시 중단.
async function brfTypeText(el, text, run) {
  for (let i = 0; i < text.length; i++) {
    if (run !== _brfStreamRun) return false;
    el.textContent = text.slice(0, i + 1);
    await new Promise(r => setTimeout(r, '.!?'.includes(text[i]) ? 55 : 12));
  }
  return true;
}

// 완주하면 true, 건너뛰기로 중단되면 false (중단 시 렌더는 brfStreamSkip 몫)
async function brfPlayStream(tg, items) {
  const box = document.getElementById('brf-root');
  if (!box) return true;
  _brfStreamDone = true;
  const run = ++_brfStreamRun;
  const steps = brfStreamSteps(tg, items);
  box.innerHTML = `
    <div class="brf-stream" onclick="brfStreamSkip()" title="클릭 — 브리핑 바로 보기">
      <div class="brf-stream-hd">
        <span class="brf-dot"></span> C-One이 오늘의 브리핑을 준비하고 있습니다
        <span class="brf-stream-skip">건너뛰기</span>
      </div>
      ${steps.map(brfStreamCard).join('')}
    </div>`;
  const cards = box.querySelectorAll('.brf-sc');
  for (let i = 0; i < cards.length; i++) {
    if (run !== _brfStreamRun) return false;
    const card = cards[i];
    card.classList.remove('pending');
    card.classList.add('current');
    card.querySelector('.brf-sc-status').textContent = '생성중';
    const textEl = card.querySelector('.brf-sc-text');
    textEl.classList.add('typing');
    if (!await brfTypeText(textEl, steps[i].text, run)) return false;
    textEl.classList.remove('typing');
    textEl.innerHTML = brfEmphNum(steps[i].text); // 타이핑 완료 후 숫자 강조
    card.classList.remove('current');
    card.classList.add('done');
    card.querySelector('.brf-sc-status').textContent = '완료';
    await new Promise(r => setTimeout(r, 120));
  }
  // 전부 출력 후 10초 대기 — 하단에 카운트다운 + [바로 넘어가기] 버튼 (0820)
  const stream = box.querySelector('.brf-stream');
  if (stream) {
    const go = document.createElement('div');
    go.className = 'brf-stream-go';
    go.innerHTML = `<span class="brf-stream-go-txt">브리핑 생성 완료 — <b id="brf-go-sec">10</b>초 후 이동합니다</span>
      <button class="brf-stream-go-btn" onclick="brfStreamSkip()">바로 넘어가기 →</button>`;
    stream.appendChild(go);
  }
  for (let s = 10; s > 0; s--) {
    const el = document.getElementById('brf-go-sec');
    if (el) el.textContent = String(s);
    await new Promise(r => setTimeout(r, 1000));
    if (run !== _brfStreamRun) return false;
  }
  return run === _brfStreamRun;
}

// 건너뛰기 — 진행 중 타이핑을 중단하고 곧장 본문 렌더
function brfStreamSkip() {
  _brfStreamRun++;
  if (_brfData) brfRender(_brfData, _brfItems || []);
}

function brfRender(tg, items) {
  const box = document.getElementById('brf-root');
  if (!box) return;
  const ar = tg.ar_report || { tried: 0, ok: 0, fail: 0 };
  const targets = tg.targets || [];
  // 승인 대기 = 위험 스코어가 있는 건물 (자율복구 복귀만으로 남은 건물 제외).
  // 전체 수는 서버 집계(pending — 컷 이전 전수)를 우선, 없으면 수신분 기준.
  const pending = targets.filter(t => (t.score || 0) > 0);
  const pendingTotal = tg.pending ?? pending.length;
  const nIssued = items.filter(i => i.status === 'issued').length;
  const nResolved = items.filter(i => i.status === 'resolved').length;
  const nVerified = items.filter(i => i.status === 'verified').length;

  // 한 문장 헤드라인 — 숫자만 다르고 문장 구조는 고정 (읽는 부담 최소화)
  const headline = ar.tried
    ? `지난밤 Auto-reset이 위험 장비 <b>${brfFmt(ar.tried)}대</b> 중 <b class="ops-good">${brfFmt(ar.ok)}대</b>를 원격 복구했습니다.
       오늘 승인이 필요한 조치 대상은 <b class="ops-bad">건물 ${brfFmt(pendingTotal)}곳</b>입니다.`
    : `오늘 승인이 필요한 조치 대상은 <b class="ops-bad">건물 ${brfFmt(pendingTotal)}곳</b>입니다.`;

  // R1 3갈래 — ①이미 자율복구 완료(지시서 불필요) ②원인 미특정 → 자율복구 우선
  // ③미복구/현장 조치 필요 → 지시서 발행. ②③ 구분은 건물 단위 근사:
  // 지난밤 리셋에도 미복구가 남았으면 현장, 아니면 원격 재시도 우선.
  const done = targets.filter(t => (t.score || 0) <= 0 && t.ar_ok > 0);
  const doneTotal = tg.done_total ?? done.length;
  const top = pending.slice(0, _brfVol);
  const rows = top.map((t, i) => {
    const lane = t.ar_fail > 0
      ? '<span class="eqp-arc eqp-arc--fail">현장 조치 필요</span>'
      : '<span class="eqp-arc">자율복구 우선</span>';
    return `
    <tr class="brf-row" onclick="brfGoBld(${targets.indexOf(t)})" title="클릭 — 장비별 진단·지시서 발행으로 이동">
      <td class="brf-rank">${i + 1}</td>
      <td class="ops-td-bld"><b>${t.bld_nm || t.bld_cd}</b>
        <span class="ops-td-sub">${t.hns_team || ''}${t.hns_post ? ' · ' + t.hns_post : ''}</span></td>
      <td>${window.ceiBadgeHtml(t.cei)}</td>
      <td>${lane}</td>
      <td class="${t.cd_cnt ? 'ops-bad' : ''}">${t.cd_cnt}명</td>
      <td>${t.voc}</td>
      <td>${t.ar_ok ? `<span class="eqp-arc eqp-arc--ok">복귀 ${t.ar_ok}</span>` : ''}
          ${t.ar_fail ? `<span class="eqp-arc eqp-arc--fail">미복구 ${t.ar_fail}</span>` : ''}
          ${!t.ar_ok && !t.ar_fail ? '<span class="ops-td-sub">—</span>' : ''}</td>
      <td><b>${t.score}</b></td>
      <td class="brf-go"><i data-lucide="chevron-right"></i></td>
    </tr>`;
  }).join('');
  const volChips = [5, 10, 20].map(n =>
    `<button class="ops-chip ${_brfVol === n ? 'active' : ''}" onclick="brfSetVol(${n})"
      title="오늘 처리할 물량 — 현장 케파에 맞춰 조절">${n}곳</button>`).join('');

  box.innerHTML = `
    <header class="brf-hd">
      <div>
        <div class="brf-kicker"><span class="brf-dot"></span> C-One 금일 레포트 · 기준일 ${brfDateLabel(tg.base_dt)}</div>
        <h1 class="brf-title">${brfGreet()}</h1>
        <p class="brf-lede">${headline}</p>
      </div>
    </header>

    <div class="brf-steps">
      <button class="brf-step" onclick="arReportOpen()"
        title="Auto-reset(자율복구) — 사람이 가기 전 원격 리셋으로 먼저 복구한 결과">
        <span class="brf-step-no">1</span>
        <span class="brf-step-name">지난밤 자율복구</span>
        <span class="brf-step-num"><b class="ops-good">${brfFmt(ar.ok)}</b><i>/${brfFmt(ar.tried)}대 복구</i></span>
        <span class="brf-step-sub">${ar.fail ? `미복구 ${brfFmt(ar.fail)}대 → 현장 검토` : '전 건 복구 완료'}${
          _brfArH && _brfArH.ok ? ` · 30일 성공률 ${_brfArH.rate}% (${brfFmt(_brfArH.ok)}건)` : ''}</span>
        <span class="brf-step-cta">레포트 보기</span>
      </button>
      <button class="brf-step brf-step--primary" onclick="homeGo('eq-ops')">
        <span class="brf-step-no">2</span>
        <span class="brf-step-name">오늘의 조치 대상</span>
        <span class="brf-step-num"><b>${brfFmt(pendingTotal)}</b><i>곳 승인 대기</i></span>
        <span class="brf-step-sub">C-One이 대상선정을 마쳤습니다</span>
        <span class="brf-step-cta">지시서 검토 →</span>
      </button>
      <button class="brf-step" onclick="homeGo('eq-work')">
        <span class="brf-step-no">3</span>
        <span class="brf-step-name">진행 중 지시서</span>
        <span class="brf-step-num"><b>${nIssued + nResolved}</b><i>건 진행</i></span>
        <span class="brf-step-sub">조치 ${nResolved} · 검증완료 ${nVerified}</span>
        <span class="brf-step-cta">보드 열기</span>
      </button>
    </div>

    <section class="brf-list">
      <div class="brf-list-hd">
        <h2>우선 조치 대상 TOP ${top.length}<span class="loop-tag" title="Closed-loop 단계: 대상선정 — 효과 높은 대상을 선별 Logic으로 추리는 단계">대상선정</span></h2>
        <span class="ops-td-sub">C-One 선별 스코어순 — 행을 클릭하면 장비별 진단으로 이동</span>
        <span class="brf-vol"><span class="ops-td-sub">오늘 처리 물량</span> ${volChips}</span>
      </div>
      <table class="ops-table brf-table">
        <thead><tr>
          <th></th><th>건물</th><th title="건물 CEI(고객 체감 품질 지수) 평균 · 등급 (>90 S / >87 A / >85 B / >80 C / 이하 D)">CEI</th>
          <th title="자율복구 우선 = 원격 Auto-reset 재시도 / 현장 조치 필요 = Ticket(작업지시서) 발행 대상">조치 갈래</th>
          <th title="CEI C·D등급(열위) 가입자 수">C·D 가입자</th>
          <th title="VoC (Voice of Customer) — 고객 불만 접수 건수">VoC</th>
          <th title="Auto-reset(자율복구) — 지난밤 원격 리셋 복귀/미복구 결과">지난밤 자율복구</th>
          <th title="C-One 대상선정 스코어 — 높을수록 조치 효과가 클 것으로 예상">스코어</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="ops-empty">오늘 조치가 필요한 대상이 없습니다</td></tr>'}</tbody>
      </table>
      ${doneTotal ? `<div class="brf-done" onclick="arReportOpen()" title="새벽 자율복구 레포트 열기">
        <span class="eqp-arc eqp-arc--ok">완료</span>
        지난밤 자율복구로 정상화된 건물 <b>${brfFmt(doneTotal)}곳</b> — 지시서 불필요 · CEI 효과검증 추적 중
        <span class="brf-done-cta">레포트 →</span>
      </div>` : ''}
    </section>

    <footer class="brf-foot">
      <span class="brf-loop">탐지 → 진단 → 대상선정 → <b>승인</b> → 조치 → CEI 효과검증 → 학습</span>
      <span class="ops-td-sub">관제 현황은 <a href="javascript:homeGo('main')">관제 화면</a>에서 확인</span>
    </footer>`;
  if (window.lucide) lucide.createIcons({ rootElement: box });
}

function brfGreet() {
  const h = new Date().getHours();
  if (h < 6) return '새벽 근무 중이시군요';
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '오늘의 브리핑입니다';
  return '오늘 하루 마무리 브리핑입니다';
}

// 오늘 처리 물량(케파) 조절 — 캐시 데이터로 즉시 재렌더
function brfSetVol(n) {
  _brfVol = n;
  if (_brfData) brfRender(_brfData, _brfItems || []);
}

// TOP 행 클릭 → 장비 탭 해당 건물 자동 진단 (관제 진입과 동일 원스톱 경로)
function brfGoBld(i) {
  const t = _brfData && _brfData.targets && _brfData.targets[i];
  if (!t) return;
  const btn = document.getElementById('snav-eq-ops');
  if (btn) btn.click();
  if (typeof eqpEnterFromControl === 'function') {
    eqpEnterFromControl({ bld_cd: String(t.bld_cd), bld_nm: t.bld_nm || '', primary: 'equip', src: 'home' });
  }
}

document.addEventListener('DOMContentLoaded', brfInit);
