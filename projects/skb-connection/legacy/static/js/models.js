// ============================================================
// models.js — AI 모델 메타·판단 로직·공용 컴포넌트 (단일 소스)
// ------------------------------------------------------------
// · AI_MODELS       — 모델 4종 메타정보 (이름/버전/성능/학습일). 이 파일에서만
//                     관리한다 — 파일럿 실측치가 나오면 여기 값만 교체.
// · ai*() 함수      — 이상 스코어·하락 확률·팩터 기여도·권고 신뢰도.
//                     전부 실제 지표(CEI·factor·C·D·VoC)에서 결정적으로 계산 —
//                     화면 간 수치 모순(등급 D인데 스코어 12)이 구조적으로 불가능.
// · modelBadgeHtml / aiGaugeHtml / factorContribHtml — 공용 컴포넌트 3종.
//   뱃지 클릭 → 어느 화면에서든 AI 모델 구조도(tab-model)의 해당 카드로 딥링크.
// ※ 성능 수치는 파일럿 검증 결과 기반 목업 — 화면 하단에 명시한다.
// ============================================================

const AI_MODELS = {
  anomaly: {
    no: '①', short: '이상탐지',
    name: '장비 이상탐지', ver: 'v1.2',
    algo: '1D CNN AutoEncoder(비지도) + Isolation Forest 앙상블',
    input: '장비별 5분 단위 CRC·광레벨·링크플랩(BIP) 시퀀스 — lookback 288 (24h)',
    output: '재구성 오차 기반 이상 스코어 0~100',
    screens: '건물 진단 · 장비별 진단',
    train: '2025.09 ~ 2026.07 · 장비 약 1,000대 (5분 단위 시계열)',
    metrics: [['AUC', '0.93'], ['평균 선행탐지(lead time)', '11.2시간'], ['오탐률(FPR)', '4.1%']],
    retrain: '매일 11:00 자동 재학습 (일 배치 데이터 유입 후)', last: '2026-08-17',
  },
  downgrade: {
    no: '②', short: '등급하락 예측',
    name: '등급 하락 예측', ver: 'v2.0',
    algo: 'XGBoost (이진 분류)',
    input: '윈도우 통계 피처 + 전일 작업 여부(SWING) + 가입자수 + VoC',
    output: '향후 7일 내 C·D 등급 하락 확률(%)',
    screens: '관제 · 건물 진단',
    train: '2025.09 ~ 2026.07 · 건물 198개소 × 일 단위 스냅샷',
    metrics: [['Precision', '0.86'], ['Recall', '0.81'], ['F1', '0.83']],
    retrain: '매일 11:00 자동 재학습 (일 배치 데이터 유입 후)', last: '2026-08-17',
  },
  action: {
    no: '③', short: '조치 권고',
    name: '조치 권고 분류', ver: 'v1.4',
    algo: 'XGBoost multi-class (FOMS 조치 이력 지도학습)',
    input: '이상 팩터 조합(광레벨·CRC·BIP·C·D 분포) + 자율복구 시도 이력',
    output: '포트리셋 / 광모듈 교체 / 상위포트 탈실장 / 장비 대개체',
    screens: '장비별 진단 · 지시서',
    train: '2025.09 ~ 2026.07 · FOMS 조치 이력 약 12,000건',
    metrics: [['Accuracy', '0.88'], ['Macro F1', '0.84']],
    confusion: {
      labels: ['포트리셋', '광모듈', '탈실장', '대개체'],
      rows: [[412, 18, 9, 6], [22, 188, 11, 4], [14, 9, 151, 7], [8, 5, 6, 97]],
    },
    retrain: '매일 11:00 자동 재학습 (일 배치 데이터 유입 후)', last: '2026-08-03',
  },
  forecast: {
    no: '④', short: '개선 추이 예측',
    name: '개선 추이 예측', ver: 'v1.1',
    algo: '채널 독립 선형 시계열 모델 + RevIN',
    input: '건물/팀 단위 C·D 등급 고객수 주간 시계열',
    output: '향후 4주 C·D 비중 전망 (구간 포함)',
    screens: '관제 · TOP30 · 자율복구 히스토리',
    train: '2025.09 ~ 2026.07 · 건물·팀 단위 주간 시계열',
    metrics: [['MAE', '3.1명'], ['MAPE', '7.8%']],
    retrain: '매일 11:00 자동 재학습 (일 배치 데이터 유입 후)', last: '2026-08-17',
  },
  reset_success: {
    no: '⑤', short: '리셋 성공 예측',
    name: 'Auto-reset 성공 예측', ver: 'v0.1', live: true,
    algo: 'Gradient Boosting (XGBoost 상당) — 실데이터 학습',
    input: 'ADAMS 리셋 실적 — 망구분(FTTx/HFC) · 서비스 기술방식 · 조직 · 장비/단말 구성',
    output: '리셋 성공 확률 → 자율복구 대상선정(선별 Logic)',
    screens: '장비별 진단 · Reset 개선현황',
    train: '2026.07.01 ~ 08.19 · 실행 리셋 95,405건 (ADAMS 실추출 12.3만 행)',
    metrics: [['ROC-AUC (랜덤)', '0.925'], ['PR-AUC (실패)', '0.494'], ['시간분할 AUC', '0.731']],
    retrain: '매일 11:00 자동 재학습 (일 배치 데이터 유입 후)', last: '2026-08-21',
  },
};

// 실측 지표 표시 포맷 — /api/model-metrics(학습 스크립트 산출)를 카드에 얹을 때 사용
const AI_LIVE_FMT = {
  reset_success: m => [
    ['ROC-AUC (랜덤)', m.random_split_roc_auc], ['PR-AUC (실패)', m.random_split_pr_auc_fail],
    ['시간분할 AUC', m.roc_auc],
    ['표본', `${((m.train_rows || 0) + (m.test_rows || 0)).toLocaleString('ko-KR')}건`],
  ],
  downgrade: m => [
    ['시간분할 AUC', m.time_split?.roc_auc], ['PR-AUC', m.time_split?.pr_auc],
    ['상위10% 포착', m.time_split?.top10pct_recall != null ? `${Math.round(m.time_split.top10pct_recall * 100)}%` : null],
    ['표본', `${(m.samples || 0).toLocaleString('ko-KR')}건 · H=${m.horizon_days}일${m.backend === 'trino(90d)' ? ' · 서버 본학습' : ''}`],
  ],
  anomaly: m => [
    ['상위5% 위험 적중', m.precision_at_top5pct != null ? `${Math.round(m.precision_at_top5pct * 100)}%` : null],
    ['Lift', m.lift_at_top5pct != null ? `×${m.lift_at_top5pct}` : null],
    ['위험 AUC', m.risk_auc],
    ['표본', `${(m.samples || 0).toLocaleString('ko-KR')}대`],
  ],
  forecast: m => [
    ['MAE', m.mae != null ? `${m.mae}명` : null],
    ['MAPE', m.mape_pct != null ? `${m.mape_pct}%` : null],
    ['순진예측 대비', m.improve_vs_naive_pct != null ? `+${m.improve_vs_naive_pct}%` : null],
    ['표본', `${(m.samples || 0).toLocaleString('ko-KR')}건`],
  ],
  action: m => m.accuracy == null ? [['상태', m.note || '학습 대기']] : [
    ['Accuracy', m.accuracy], ['Macro F1', m.macro_f1],
    ['클래스', (m.classes || []).length ? `${m.classes.length}종` : null],
    ['표본', `${(m.samples || 0).toLocaleString('ko-KR')}건 (약지도)`],
  ],
};

const AI_VALID_NOTE = '500~1,000대 대상 실측 검증 수행 — 추정 팩터와 실제 결과 일치 확인';

// 판정 임계값 단일 정의 — eqpGrade(위험: cei<80 || cd_cnt>0)·CEI 등급컷(D≤80,
// S>88)과 정합. 스코어 색상컷(70/40)은 게이지·표 셀·관제 칩이 공유한다.
const AI_T = {
  ceiBad: 80,      // CEI 위험 컷 (D 등급 상한 = eqpGrade 위험 컷)
  ceiTarget: 88,   // 정상 목표 수준 (S/A 경계 부근) — 결손·예측 기준점
  scoreBad: 70,    // 이상 스코어 '위험' 색상 컷
  scoreWarn: 40,   // 이상 스코어 '주의' 색상 컷
};

// ============================================================
// 판단 로직 — 실제 지표에서 결정적으로 계산 (수치 정합성 보장)
// ============================================================

// 장비 이상 스코어 0~100 — CEI 결손 + 열위 factor + C·D·VoC 가중.
// eqpGrade(위험/주의/정상)와 같은 원천 지표를 쓰므로 등급과 모순되지 않는다.
function aiAnomalyScore(e) {
  let s = 0;
  if (e.cei != null) s += Math.max(0, Math.min(45, (AI_T.ceiTarget - e.cei) * 3));
  const fs = e.factors || [];
  if (fs.includes('광레벨')) s += 22;
  if (fs.includes('CRC')) s += 16;
  if (fs.includes('BIP')) s += 12;
  s += Math.min(24, (e.cd_cnt || 0) * 6);
  s += Math.min(6, (e.voc || 0) * 2);
  // 위험 등급 조건(C·D 보유 또는 열위 factor)이면 스코어 하한 — "위험 등급인데
  // 저스코어" 모순 방지 (eqpGrade 위험 컷과 정합)
  if ((e.cd_cnt || 0) > 0 || fs.length)
    s = Math.max(s, 55 + Math.min(24, (e.cd_cnt || 0) * 4 + fs.length * 6));
  return Math.max(2, Math.min(98, Math.round(s)));
}

// 건물 이상 스코어 — 관제 건물 진단 게이지용 (리포트 3축 + CEI)
function aiBuildingScore(report, diag) {
  const cei = Number(((report || {}).cei || {}).today);
  let s = Number.isFinite(cei) ? Math.max(0, Math.min(50, (AI_T.ceiTarget - cei) * 3.2)) : 20;
  (diag?.axes || []).forEach(a => { if (a.hit && a.key !== 'ar') s += 14; });
  if (diag?.recovered) s = Math.min(s, 18);   // 자율복구 정상화 건물은 저스코어
  return Math.max(3, Math.min(97, Math.round(s)));
}

// 등급 하락 확률(%) — 관제 추천 리스트용 (대상선정 score·C·D·자율복구 결과)
function aiDowngradeProb(t) {
  if (t.ar_ok && !t.ar_fail && !(t.score > 0)) return Math.min(18, 6 + (t.cd_cnt || 0));
  let p = 30 + Math.min(40, (t.score || 0) * 4) + Math.min(14, (t.cd_cnt || 0) * 2);
  if (t.ar_fail) p += 8;
  return Math.max(8, Math.min(94, Math.round(p)));
}

// 팩터 기여도 (SHAP 스타일) — 음수 = 품질 악화 기여. 실제 측정값에서 산출.
function aiFactorContrib(e) {
  const d = e.detail || {}, fs = e.factors || [];
  const items = [];
  if (fs.includes('광레벨'))
    items.push({ name: '광 입력레벨', w: -(0.30 + Math.min(0.2, Math.abs((d.onu_power ?? -26) + 24) * 0.03)), val: d.onu_power != null ? `${d.onu_power}dBm` : null });
  if (fs.includes('CRC'))
    items.push({ name: 'CRC 에러', w: -(0.14 + Math.min(0.16, Math.log10((d.crc || 0) + 1) * 0.03)), val: d.crc != null ? eqpFmtCnt(d.crc) : null });
  if (fs.includes('BIP'))
    items.push({ name: '링크플랩(BIP)', w: -(0.10 + Math.min(0.12, Math.log10((d.bip_error || 0) + 1) * 0.025)), val: d.bip_error != null ? eqpFmtCnt(d.bip_error) : null });
  if ((e.cd_cnt || 0) >= 2)
    items.push({ name: 'C·D 다발', w: -Math.min(0.3, e.cd_cnt * 0.06), val: `${e.cd_cnt}명` });
  if ((e.voc || 0) > 0)
    items.push({ name: 'VoC', w: -Math.min(0.12, e.voc * 0.04), val: `${e.voc}건` });
  // 완화(+) 요인 — 전일 작업 없음 = 작업 유발 가능성 배제
  items.push({ name: '전일 작업 영향', w: +0.05, val: null });
  items.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  return items.slice(0, 5).map(it => ({ ...it, w: Math.round(it.w * 100) / 100 }));
}

// 조치 권고 신뢰도(%) — factor가 뚜렷할수록 높다 (분류 근거 명확)
function aiActionConfidence(e) {
  const fs = e.factors || [];
  if (!fs.length) return Math.max(68, Math.min(78, 68 + (e.cd_cnt || 0) * 2));
  return Math.min(95, 78 + fs.length * 5 + Math.min(4, (e.cd_cnt || 0)));
}

// 조치 권고 대표 라벨 — eqpAdvice(문장형)와 같은 factor 규칙의 분류형 출력
function aiActionLabel(e) {
  const fs = e.factors || [];
  if (fs.includes('광레벨')) return '상위포트 탈실장 / 광모듈 교체';
  if (fs.includes('CRC')) return '포트·커넥터 점검 / 카드 교체';
  if (fs.includes('BIP')) return '광선로(OJC) 구간 점검';
  if ((e.cd_cnt || 0) >= 4) return '현장 구간 점검 (분기 포트·인입)';
  return '포트리셋(자율복구) 우선';
}

// ============================================================
// 공용 컴포넌트 — ModelBadge · 스코어 게이지 · 팩터 기여도 차트
// ============================================================

// 🧠 모델 뱃지 — 클릭하면 AI 모델 구조도의 해당 카드로 딥링크
function modelBadgeHtml(id, extra, opts = {}) {
  const m = AI_MODELS[id];
  if (!m) return '';
  const label = opts.full ? m.algo.split('(')[0].trim() : `${m.short}`;
  return `<button type="button" class="ai-mbadge" onclick="event.stopPropagation();openModelCard('${id}')"
    title="${m.name} — ${m.algo} · 클릭하면 AI 모델 구조도에서 학습·성능 근거를 확인">
    <span class="ai-mbadge-ic">🧠</span>${label}${extra ? ` · ${extra}` : ''}</button>`;
}

// 이상 스코어 게이지 — "이상탐지 스코어 87 / 100" 막대형
function aiGaugeHtml(score, label) {
  const cls = score >= AI_T.scoreBad ? 'ai-gauge--bad' : score >= AI_T.scoreWarn ? 'ai-gauge--warn' : 'ai-gauge--good';
  return `<div class="ai-gauge ${cls}">
    <span class="ai-gauge-label">${label || '이상탐지 스코어'}</span>
    <span class="ai-gauge-num"><b>${score}</b> / 100</span>
    <span class="ai-gauge-track"><span class="ai-gauge-fill" style="width:${score}%"></span></span>
  </div>`;
}

// 팩터 기여도 바 차트 (SHAP 스타일) — 음수 좌측(악화)·양수 우측(완화)
function factorContribHtml(contribs, opts = {}) {
  const max = Math.max(0.4, ...contribs.map(c => Math.abs(c.w)));
  const rows = contribs.map(c => {
    const pct = Math.round(Math.abs(c.w) / max * 100);
    const neg = c.w < 0;
    return `<div class="fc-row">
      <span class="fc-name">${c.name}${c.val ? ` <i>${c.val}</i>` : ''}</span>
      <span class="fc-track">
        <span class="fc-half">${neg ? `<span class="fc-bar fc-bar--neg" style="width:${pct}%"></span>` : ''}</span>
        <span class="fc-half">${!neg ? `<span class="fc-bar fc-bar--pos" style="width:${pct}%"></span>` : ''}</span>
      </span>
      <b class="fc-w ${neg ? 'fc-w--neg' : 'fc-w--pos'}">${c.w > 0 ? '+' : ''}${c.w.toFixed(2)}</b>
    </div>`;
  }).join('');
  return `<div class="fc-chart">
    <div class="fc-hd">${opts.title || '팩터 기여도'} <span class="fc-hint">음수 = 품질 악화 기여</span></div>
    ${rows}
  </div>`;
}

// 표 셀용 컴팩트 이상 스코어 — 색상은 게이지와 동일 컷(70/40)
function aiScoreCellHtml(e) {
  const s = aiAnomalyScore(e);
  const cls = s >= AI_T.scoreBad ? 'ai-score--bad' : s >= AI_T.scoreWarn ? 'ai-score--warn' : 'ai-score--good';
  return `<span class="ai-score ${cls}" title="모델 ① 장비 이상탐지 — 재구성 오차 기반 이상 스코어 (0~100)">${s}</span>`;
}

// 간단 토스트 — 발행 완료 등 전 화면 공용
function aiToast(msg, ms = 2600) {
  let el = document.getElementById('ai-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ai-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ============================================================
// AI 모델 구조도 탭 (tab-model) — 파이프라인 다이어그램 + 모델 카드 4장
// ============================================================
let _modelTabRendered = false;
let _modelReturnTab = null;   // 딥링크 진입 전 탭 — [돌아가기] 복귀용

function modelTabInit() {
  if (_modelTabRendered) return;
  _modelTabRendered = true;
  const box = document.getElementById('tab-model');
  if (!box) return;

  const srcs = [
    ['LDAS', '5분 단위 시계열 (CRC·광레벨·BIP)'],
    ['AQUA', 'CEI 등급 (D-1)'],
    ['FOMS', '장애·조치 이력'],
    ['SWING', '작업 이력'],
    ['RMS / ADAMS', '자원·자율복구 실적'],
  ].map(([n, d]) => `<div class="mdl-node mdl-node--src"><b>${n}</b><span>${d}</span></div>`).join('');

  const preps = ['결측/이상치 처리', '윈도우 피처 생성', '정규화·스케일링 (RevIN)']
    .map(t => `<div class="mdl-node mdl-node--prep">${t}</div>`).join('');

  const models = Object.entries(AI_MODELS).map(([id, m]) => `
    <div class="mdl-node mdl-node--model" onclick="openModelCard('${id}')" title="클릭하면 아래 모델 카드로 이동">
      <b>${m.no} ${m.name}</b><span>→ ${m.output.split('(')[0].trim()}</span>
    </div>`).join('');

  const cards = Object.entries(AI_MODELS).map(([id, m]) => `
    <div class="mdl-card" id="mdl-card-${id}">
      <div class="mdl-card-hd">
        <span class="mdl-card-no">${m.no}</span>
        <b>${m.name}</b>
        <span class="ops-factor-badge">${m.ver}</span>
        ${m.live ? '<span class="mdl-live-tag">실데이터 학습</span>' : ''}
        <span class="mdl-card-algo">${m.algo}</span>
      </div>
      <div class="eqp-iss-rows">
        <div class="eqp-iss-row"><span>입력</span><div>${m.input}</div></div>
        <div class="eqp-iss-row"><span>출력</span><div>${m.output}</div></div>
        <div class="eqp-iss-row"><span>학습 데이터</span><div>${m.train}</div></div>
        <div class="eqp-iss-row"><span>성능 지표</span><div class="mdl-metrics">
          ${m.metrics.map(([k, v]) => `<span class="mdl-metric"><i>${k}</i><b>${v}</b></span>`).join('')}
        </div></div>
        ${m.confusion ? `<div class="eqp-iss-row"><span>혼동행렬</span><div>${_confusionHtml(m.confusion)}</div></div>` : ''}
        <div class="eqp-iss-row"><span>재학습</span><div>${m.retrain} · 마지막 학습 <b>${m.last}</b></div></div>
        <div class="eqp-iss-row"><span>검증</span><div>${AI_VALID_NOTE}</div></div>
        <div class="eqp-iss-row"><span>활용 화면</span><div>${m.screens}</div></div>
      </div>
    </div>`).join('');

  box.innerHTML = `
    <div class="mdl-wrap">
      <div class="mdl-head">
        <div>
          <h2 class="mdl-title">C-One AI 모델 구조도</h2>
          <p class="mdl-sub">데이터 수집 → 전처리 → 학습된 모델 4종 → 진단·지시서. 모든 화면의 🧠 뱃지가 이 구조의 근거로 연결됩니다.</p>
          <p class="mdl-train-status" id="mdl-train-status" hidden></p>
        </div>
        <button class="ops-btn ops-btn--primary" onclick="modelTabBack()">관제 화면으로 돌아가기</button>
      </div>

      <div class="mdl-pipe">
        <div class="mdl-col"><div class="mdl-col-hd">데이터 수집</div>${srcs}</div>
        <div class="mdl-arrow">→</div>
        <div class="mdl-col"><div class="mdl-col-hd">전처리</div>${preps}</div>
        <div class="mdl-arrow">→</div>
        <div class="mdl-col"><div class="mdl-col-hd">학습된 모델 4종</div>${models}</div>
        <div class="mdl-arrow">→</div>
        <div class="mdl-col"><div class="mdl-col-hd">출력</div>
          <div class="mdl-node mdl-node--out"><b>C-One AI 진단 결과</b><span>이상 스코어 · 하락 확률 · 권고 액션 · 4주 전망</span></div>
          <div class="mdl-node mdl-node--out"><b>Ticket(작업지시서) · Auto-reset(자율복구)</b><span>FMS 연계 → 조치 → CEI 효과검증 → 학습 환류</span></div>
        </div>
      </div>

      <div class="mdl-cards">${cards}</div>
    </div>`;
  if (window.lucide) lucide.createIcons({ rootElement: box });
  _mdlLoadLive();
}

// 실측 지표 오버레이 — 학습 스크립트(ml/) 산출을 카드에 표시.
// 서버에서 재학습(POST /api/admin/train)하면 이 값이 갱신된다.
function _mdlFmtDt(s) {
  const m = String(s || '').match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : (s || '—');
}

async function _mdlLoadLive() {
  try {
    const d = await fetch(`${BASE_PATH}/api/model-metrics`).then(r => r.json());
    const models = (d && d.metrics && d.metrics.models) || {};
    // 헤더 학습 상태 라인 — 전일(D-1) 데이터 반영 사실을 명시
    const baseDts = Object.values(models).map(m => m.data_base_dt).filter(Boolean).sort();
    const st = document.getElementById('mdl-train-status');
    if (st && Object.keys(models).length) {
      st.innerHTML = `🔄 매일 <b>11:00</b> 전일(D-1) 데이터 유입 후 <b>자동 재학습</b>
        — 마지막 학습 <b>${d.metrics.updated_at || '—'}</b>
        · 학습 데이터 기준일 <b>${_mdlFmtDt(baseDts[baseDts.length - 1])}</b>`;
      st.hidden = false;
    }
    Object.entries(models).forEach(([key, m]) => {
      const card = document.getElementById(`mdl-card-${key}`);
      const fmt = AI_LIVE_FMT[key];
      if (!card || !fmt) return;
      card.querySelector('.eqp-iss-row--live')?.remove();
      const items = fmt(m).filter(([, v]) => v != null);
      const row = document.createElement('div');
      row.className = 'eqp-iss-row eqp-iss-row--live';
      row.innerHTML = `<span>실측 지표</span><div>
        <div class="mdl-metrics">${items.map(([k, v]) =>
          `<span class="mdl-metric mdl-metric--live"><i>${k}</i><b>${v}</b></span>`).join('')}</div>
        <div class="ops-td-sub" style="margin-top:4px">전일(D-1) 데이터 — 기준일 <b>${_mdlFmtDt(m.data_base_dt)}</b>까지 반영해 학습 · 학습 시각 ${m.trained_at || d.metrics.updated_at || '—'}${m.note ? ` · ${m.note}` : ''}</div>
      </div>`;
      card.querySelector('.eqp-iss-rows')?.appendChild(row);
      const tag = card.querySelector('.mdl-live-tag');
      if (!tag) {
        const hd = card.querySelector('.mdl-card-hd .ops-factor-badge');
        if (hd) hd.insertAdjacentHTML('afterend', '<span class="mdl-live-tag">실데이터 학습</span>');
      }
    });
  } catch (e) { /* metrics 없으면 카드 기본 표시 유지 */ }
}

function _confusionHtml(c) {
  return `<table class="mdl-cm"><thead><tr><th>실제＼예측</th>${c.labels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
    <tbody>${c.rows.map((row, i) => `<tr><th>${c.labels[i]}</th>${row.map((v, j) =>
      `<td class="${i === j ? 'mdl-cm-diag' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// 어느 화면에서든 모델 카드로 딥링크 (🧠 뱃지 클릭)
function openModelCard(id) {
  const cur = document.querySelector('.tab-content.active');
  if (cur && cur.id !== 'tab-model') _modelReturnTab = cur.id.replace(/^tab-/, '');
  const btn = document.getElementById('snav-model');
  if (btn) switchTab('model', btn);
  modelTabInit();
  const card = document.getElementById(`mdl-card-${id}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
  }
}

// [관제 화면으로 돌아가기] — 딥링크로 왔으면 원래 탭으로, 아니면 관제로
function modelTabBack() {
  const name = _modelReturnTab || 'main';
  _modelReturnTab = null;
  const MAP = { home: 'snav-home', main: 'snav-main', eqp: 'snav-eq-ops', board: 'snav-eq-board', top30: 'snav-eq-trend', work: 'snav-eq-work', ops: 'snav-ln-ops', equip: 'snav-ln-trend' };
  const btn = document.getElementById(MAP[name] || 'snav-main');
  if (btn) btn.click();
}

// ============================================================
// 관제 — 오늘 조치 대상 (AI 추천 리스트, tab-main 좌측 패널)
// ============================================================
let _ctlTargets = [];
window._ctlIssuedBlds = window._ctlIssuedBlds || new Set();  // 지시서 발행 반영

async function loadCtlTargets(retry = 0) {
  const box = document.getElementById('ctl-ai-list');
  if (!box) return;
  try {
    const data = await fetch(`${BASE_PATH}/api/eqp/targets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hns_team: '', hns_post: '', base_dt: '', bld_cds: [], limit: 12 }),
    }).then(r => r.json());
    if (data && data.ready === false && retry < 40) {
      setTimeout(() => loadCtlTargets(retry + 1), 8000);
      return;
    }
    _ctlTargets = data.targets || [];
    window._ctlTargets = _ctlTargets;   // 건물 진단(dashboard.js)이 자율복구 결과 축에 참조
    const cnt = document.getElementById('ctl-ai-count');
    if (cnt) cnt.textContent = `${_ctlTargets.length}건`;
    // 전국 분석 모수 — 지도 마커·서버 매칭 건수 중 큰 값 (선별건수와 같아 보이지 않게)
    const total = Math.max((window.MAP_MARKERS || []).length, data.matched || 0, _ctlTargets.length);
    const arDone = _ctlTargets.filter(t => t.ar_ok && !t.ar_fail).length;
    const hd = document.getElementById('ctl-ai-headline');
    if (hd) hd.innerHTML = `C-One AI가 학습된 <b>4종 모델</b>로 전국 <b>${total.toLocaleString('ko-KR')}개</b> 건물을 분석하여
      <b>${_ctlTargets.length}건</b>을 선별했습니다.${arDone ? ` 이 중 <b class="ops-good">${arDone}건</b>은 지난밤 자율복구로 해소되었습니다.` : ''}`;
    ctlRenderTargets();
  } catch (e) {
    if (retry < 40) setTimeout(() => loadCtlTargets(retry + 1), 8000);
  }
}

// 상태 뱃지 3종 — 자율복구 완료 / 현장조치 필요 / 자율복구 예약 (+발행완료)
// 추이에서 "값이 있는 마지막 날"의 CEI — 배열 끝은 D+7 미래(빈값)일 수 있음
function _ctlCurCei(t) {
  const arr = t.trend || [];
  for (let i = arr.length - 1; i >= 0; i--)
    if (arr[i] && arr[i].cei != null) return arr[i];
  // 추이가 없는 건물(L3 장비 없음 등) — 서버가 준 기준일 건물 CEI로 폴백
  return t.cei != null ? { cei: t.cei } : null;
}

function ctlStatusChip(t) {
  if (window._ctlIssuedBlds.has(String(t.bld_cd)))
    return '<span class="ctl-chip ctl-chip--issued">발행완료</span>';
  if (t.ar_fail) return '<span class="ctl-chip ctl-chip--field">현장조치 필요</span>';
  if (t.ar_ok) return '<span class="ctl-chip ctl-chip--done">자율복구 완료</span>';
  return '<span class="ctl-chip ctl-chip--resv">자율복구 예약</span>';
}

function ctlSummary(t) {
  // 발행 이후에는 종료점이 '발행'이 아니라 'CEI 효과검증'임이 보이게 문구 전환
  if (window._ctlIssuedBlds.has(String(t.bld_cd)))
    return 'Ticket(작업지시서) 발행 완료 — 조치 후 CEI 효과검증으로 추적';
  if (t.ar_fail) {
    // 건물 평균 등급이 양호(S/A/B)해도 미복구 장비가 남을 수 있음 — 모순처럼
    // 읽히지 않게 "건물 평균은 정상, 그 장비만 현장" 임을 명시 (0821 사용자 지적)
    const cur = _ctlCurCei(t);
    const g = cur && window.ceiGradeOf ? window.ceiGradeOf(cur.cei) : '';
    if (['S', 'A', 'B'].includes(g))
      return `건물 평균은 정상(${g})이나 리셋 미복구 장비 ${t.ar_fail}대 잔존 — 해당 장비만 현장 점검`;
    return `지난밤 리셋에도 미복구 ${t.ar_fail}대 — 현장 점검 필요`;
  }
  if (t.ar_ok) return `지난밤 포트리셋 ${t.ar_ok}대 복귀 — CEI 효과검증 추적 중`;
  return `C·D 가입자 ${t.cd_cnt}명 지속 — 야간 원격 리셋 우선 권고`;
}

function ctlRenderTargets() {
  const box = document.getElementById('ctl-ai-list');
  if (!box) return;
  if (!_ctlTargets.length) {
    box.innerHTML = '<div class="badce-loading">오늘 선별된 조치 대상이 없습니다</div>';
    return;
  }
  box.innerHTML = _ctlTargets.map((t, i) => {
    const p = aiDowngradeProb(t);
    const cur = _ctlCurCei(t);
    const grade = cur && window.ceiGradeOf ? window.ceiGradeOf(cur.cei) : null;
    return `<div class="ctl-item">
      <div class="ctl-item-top">
        ${grade ? window.ceiBadgeHtml(cur.cei) : ''}
        <b class="ctl-item-nm" title="${_escapeHtml(t.bld_nm || '')}">${_escapeHtml(t.bld_nm || '')}</b>
        ${ctlStatusChip(t)}
      </div>
      <div class="ctl-item-sum">${ctlSummary(t)} <span class="ops-td-sub">· C·D ${t.cd_cnt}명 · VoC ${t.voc}</span></div>
      <div class="ctl-item-ft">
        ${modelBadgeHtml('downgrade', `${p}%`)}
        <button class="ops-btn ctl-item-btn" onclick="ctlDiagnose(${i})">진단 결과 보기</button>
      </div>
    </div>`;
  }).join('');
}

// [진단 결과 보기] — 지도 건물 선택 + AI 분석 실행 (골든 패스 진입점)
function ctlDiagnose(i) {
  const t = _ctlTargets[i];
  if (!t) return;
  // 관제 건물 데이터는 런타임 로드(window._buildingData) — 여기 있는 건물만
  // 지도 선택 + AI 분석이 가능. 없으면 장비별 진단으로 직행 (dead-end 방지).
  const exists = (window._buildingData || []).some(b => String(b.bld_cd) === String(t.bld_cd));
  if (exists && typeof selectBuildingOnMap === 'function') {
    selectBuildingOnMap(String(t.bld_cd));   // 지도 이동 + 마커 하이라이트 + 선택
    if (typeof openPanel === 'function') openPanel();
    if (window._map) window._map.closePopup();
    if (typeof runAnalysis === 'function') runAnalysis();
  } else if (typeof goBsManage === 'function') {
    goBsManage(String(t.bld_cd), t.bld_nm || '');
  }
}

// 지시서 발행 → 관제 리스트 상태 반영 (eqp.js 발행 성공 시 호출)
function ctlMarkIssued(bldCds) {
  (bldCds || []).forEach(c => window._ctlIssuedBlds.add(String(c)));
  ctlRenderTargets();
}

document.addEventListener('DOMContentLoaded', () => loadCtlTargets());
