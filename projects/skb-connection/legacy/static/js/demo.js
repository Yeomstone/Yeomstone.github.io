/* C-One 시연 목업(9/30) — 해시 라우터 SPA.
   #/home  초기 화면(오늘 작업 → 진단 연출 → 유형별 카드)
   #/flow  세 갈래 구조(자율복구 / C-One / 매체고도화)
   #/symptom/<key>  세부 내역(증상 → 분류 → 조치)
   #/autoreset[/1|2|3]  이관 대상 확인 → 실행 시뮬레이션(연출) → 결과 대시보드
   #/map   지도(별도 트랙)
   모든 수치는 서버(services/demo_service.py)의 seeded 더미. */
(function () {
  'use strict';
  const CFG = window.DEMO_CFG;
  const S = {
    boot: null, team: '', post: '',
    diagShownFor: '',          // 진단 연출을 이미 보여준 조직 키 (재방문 시 즉시 결과)
    ar: { batch: null },
    map: null, charts: [],
  };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const view = () => $('#view');

  // ── 유틸 ─────────────────────────────────────────────────────
  // onclick 인라인 인자용 — JSON 직렬화 후 HTML 이스케이프 (속성 디코딩 뒤 유효한 JS 리터럴)
  const jsArg = (v) => esc(JSON.stringify(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
  const fmtDt = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d || '');
  const delta = (d, suffix) => {
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const sign = d > 0 ? '▲' : d < 0 ? '▼' : '─';
    return `<span class="delta ${cls}" title="전일 대비">${sign} ${Math.abs(d)}${suffix || ''}</span>`;
  };
  const AT = { REMOTE: ['원격', 'remote'], FIELD: ['현장', 'field'], TRANSFER: ['이관', 'transfer'], INVESTMENT: ['투자검토', 'investment'] };
  const atBadge = (t) => { const a = AT[t] || [t, 'gray']; return `<span class="badge badge-${a[1]}">${esc(a[0])}</span>`; };
  const segBadge = (s) => `<span class="badge badge-${s === 'OLT' ? 'olt' : s === 'ONU' ? 'onu' : 'term'}">${esc(s)}</span>`;
  const ox = (v) => v === true ? '<span class="ox o">O</span>' : v === false ? '<span class="ox x">X</span>' : '<span class="ox n">–</span>';
  const icons = () => { try { window.lucide && lucide.createIcons(); } catch (e) { /* CDN 미로드 시 무시 */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const orgQ = () => `team=${encodeURIComponent(S.team)}&post=${encodeURIComponent(S.post)}`;
  const orgLabel = () => (S.team ? S.team + ' 운용팀' : '전체') + (S.post ? ' › ' + S.post + ' 파트' : '');
  const orgKey = () => `${S.team}|${S.post}`;

  async function api(path, opts) {
    const r = await fetch(CFG.api + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    if (r.status === 401 || r.redirected) { location.href = CFG.loginUrl; return {}; }
    return r.json();
  }
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function confirmModal(title, bodyHtml, okText) {
    return new Promise((resolve) => {
      const m = $('#modal');
      $('#modal-title').textContent = title;
      $('#modal-body').innerHTML = bodyHtml;
      const ok = $('#modal-ok'), cancel = $('#modal-cancel');
      ok.textContent = okText || '확인';
      m.hidden = false;
      const done = (v) => { m.hidden = true; ok.onclick = cancel.onclick = null; resolve(v); };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      m.onclick = (e) => { if (e.target === m) done(false); };
    });
  }
  function destroyCharts() { S.charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); S.charts = []; }
  function setCrumb(html) { $('#crumb').innerHTML = html; }
  function setNav(name) { document.querySelectorAll('.nav-item[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name)); }

  // ── 조직 필터 ────────────────────────────────────────────────
  function fillOrgSelects() {
    const st = $('#sel-team'), sp = $('#sel-post');
    st.innerHTML = '<option value="">전체 운용팀</option>' + S.boot.orgs.map((o) => `<option value="${esc(o.team)}">${esc(o.team)} 운용팀</option>`).join('');
    st.value = S.team;
    const posts = S.team ? (S.boot.orgs.find((o) => o.team === S.team) || { posts: [] }).posts : [];
    sp.innerHTML = '<option value="">전체 파트</option>' + posts.map((p) => `<option value="${esc(p)}">${esc(p)} 파트</option>`).join('');
    sp.value = S.post;
    sp.disabled = !S.team;
    const note = $('#user-org-note');
    note.textContent = S.boot.my_org.matched ? `내 관할 · ${orgLabel()}` : (S.boot.user.is_admin ? '관리자 · 전체 조회' : '계정 조직 미매핑 · 전체 조회');
  }
  window.onOrgChange = function (which) {
    if (which === 'team') { S.team = $('#sel-team').value; S.post = ''; }
    else { S.post = $('#sel-post').value; }
    try { sessionStorage.setItem('demo.org', JSON.stringify({ team: S.team, post: S.post })); } catch (e) {}
    fillOrgSelects();
    route();
  };
  window.demoLogout = async function () {
    try { await fetch(CFG.logoutUrl, { method: 'POST' }); } catch (e) {}
    location.href = CFG.loginUrl;
  };

  // ── 라우터 ───────────────────────────────────────────────────
  function route() {
    destroyCharts();
    if (S.map) { try { S.map.remove(); } catch (e) {} S.map = null; }
    const h = (location.hash || '#/home').replace(/^#\/?/, '');
    const [name, arg, arg2] = h.split('/');
    setNav(name);
    if (name === 'flow') return renderFlow();
    if (name === 'symptom') return renderSymptom(arg);
    if (name === 'autoreset') return renderAutoreset(Number(arg || 1), arg2);
    if (name === 'map') return renderMap(arg ? decodeURIComponent(arg) : '');
    return renderHome();
  }
  window.addEventListener('hashchange', route);

  // ═════════════════════════════════════════════════════════════
  // 초기 화면
  // ═════════════════════════════════════════════════════════════
  async function renderHome() {
    setCrumb(`초기 화면 <small>${esc(orgLabel())} · ${esc(CFG.now)}</small>`);
    view().innerHTML = `
      <div class="home-grid">
        <section class="card">
          <div class="card-hd">
            <span class="card-title"><i data-lucide="calendar-check"></i>오늘 작업 리스트 <span class="loop-tag">사건(작업)</span></span>
            <span class="card-sub" id="work-meta">불러오는 중…</span>
          </div>
          <div class="tbl-wrap" style="max-height:340px"><table class="tbl work-tbl"><thead><tr>
            <th>시간</th><th>작업명</th><th>분류</th><th>운용팀 › 파트</th><th>장비</th><th>상태</th></tr></thead>
            <tbody id="work-body"><tr><td colspan="6" class="empty">불러오는 중…</td></tr></tbody></table></div>
          <div id="work-note" class="card-bd xs muted" hidden></div>
        </section>
        <section class="card diag" id="diag">
          <div class="diag-title"><i data-lucide="scan-search"></i>오늘 새벽 사이 발생한 이상 징후를 진단합니다
            <span class="stage-tag" title="진단 자체는 D-1 야간 배치로 이미 완료된 결과를 불러오는 것입니다. 순차 표시는 시연 연출입니다.">연출</span></div>
          <div class="diag-sub">CEI C/D 등급 장비를 수집해 증상별로 분류하고, 조치 트랙(자율복구 / C-One / 매체고도화)으로 나눕니다. 위 오늘 작업의 영향 장비도 진단 결과에 포함됩니다.</div>
          <div class="asis xs"><span class="badge badge-gray">As-Is</span> 담당자가 시스템을 개별 조회해 경험으로 판단 <span class="muted">→</span> <span class="badge badge-remote">To-Be</span> C-One이 탐지·진단·대상선정을 마치고 조치만 판단</div>
          <ul class="diag-steps">
            <li class="diag-step" id="ds1"><span class="ico"><i data-lucide="check"></i></span><span class="lbl">CEI C/D 등급 장비 수집</span> <span class="muted xs">· D-1 배치 결과</span><span class="cnt" id="ds1c"></span></li>
            <li class="diag-step" id="ds2"><span class="ico"><i data-lucide="check"></i></span><span class="lbl">증상 분류</span> <span class="muted xs">· 룰 8종(광신호·CRC/BIP·Loss·MisMatch·단말)</span><span class="cnt" id="ds2c"></span></li>
            <li class="diag-step" id="ds3"><span class="ico"><i data-lucide="check"></i></span><span class="lbl">조치 트랙 분기</span><span class="cnt" id="ds3c"></span></li>
          </ul>
          <div class="diag-bar"><i id="diag-bar"></i></div>
          <div class="row mt" style="justify-content:space-between">
            <span class="xs muted" id="diag-status">진단 준비 중…</span>
            <button class="btn btn-sm" id="diag-rerun" onclick="window.demoRerunDiag()" hidden><i data-lucide="rotate-ccw"></i>진단 다시 보기</button>
          </div>
        </section>
      </div>
      <section class="result" id="result" hidden></section>`;
    icons();
    const data = await api(`/overview?${orgQ()}`);
    renderWorks(data.works);
    const first = S.diagShownFor !== orgKey();
    await playDiag(data, first);
    S.diagShownFor = orgKey();
    renderResult(data);
  }
  window.demoRerunDiag = function () { S.diagShownFor = ''; renderHome(); };

  function renderWorks(w) {
    const body = $('#work-body'), meta = $('#work-meta'), note = $('#work-note');
    if (!body) return;
    const items = (w && w.items) || [];
    meta.textContent = `${fmtDt(w.shown_dt || w.base_dt)} · ${items.length}건`;
    if (!items.length) { body.innerHTML = '<tr><td colspan="6" class="empty">등록된 작업이 없습니다.</td></tr>'; }
    else {
      body.innerHTML = items.map((x) => `<tr>
        <td class="num">${esc(x.time)}</td><td><b>${esc(x.oper_nm)}</b></td><td>${esc(x.lv2 || '')}</td>
        <td>${esc(x.team || '')} › ${esc(x.post || '')}</td><td class="muted">${esc(x.equip)}</td>
        <td><span class="badge ${x.status === '완료' ? 'badge-good' : x.status === '진행중' ? 'badge-warn' : 'badge-gray'}">${esc(x.status)}</span></td></tr>`).join('');
    }
    if (w.note) { note.hidden = false; note.textContent = w.note + ' (작업 데이터는 실데이터, 시간·상태는 예시)'; }
  }

  async function playDiag(data, animate) {
    const total = data.total.count;
    const auto = data.cards.filter((c) => c.bucket === 'AUTO_RECOVERY').reduce((a, c) => a + c.count, 0);
    const cone = total - auto;
    const media = (data.media_upgrade || {}).count || 0;
    const steps = [
      ['ds1', `${fmt(total)}대`],
      ['ds2', `${data.cards.length}개 유형`],
      ['ds3', `자율복구 ${fmt(auto)} · C-One ${fmt(cone)} · 매체고도화 ${fmt(media)}`],
    ];
    const bar = $('#diag-bar'), st = $('#diag-status');
    for (let i = 0; i < steps.length; i++) {
      const el = $('#' + steps[i][0]); if (!el) return;
      el.classList.add('run'); st.textContent = ['C/D 등급 장비를 모으는 중…', '증상 룰을 적용하는 중…', '조치 트랙으로 나누는 중…'][i];
      bar.style.width = `${(i + 0.5) / steps.length * 100}%`;
      if (animate) await sleep(700);
      el.classList.remove('run'); el.classList.add('done');
      $('#' + steps[i][0] + 'c').textContent = steps[i][1];
    }
    bar.style.width = '100%';
    st.innerHTML = `진단 완료 · 기준일 ${esc(fmtDt(data.base_dt))} (전일 ${esc(fmtDt(data.prev_dt))} 대비)`;
    const rr = $('#diag-rerun'); if (rr) rr.hidden = false;
    icons();
  }

  function renderResult(data) {
    const total = data.total.count;
    const auto = data.cards.filter((c) => c.bucket === 'AUTO_RECOVERY').reduce((a, c) => a + c.count, 0);
    const cone = total - auto;
    const media = (data.media_upgrade || {}).count || 0;
    const sum = auto + cone + media || 1;
    const el = $('#result'); if (!el) return;
    el.hidden = false;
    el.innerHTML = `
      <div class="card total-tile">
        <div>
          <div class="total-l">문제 장비 <span class="muted">(CEI C/D 등급, 내 관할)</span></div>
          <div class="row"><span class="total-n" id="total-n">0</span><span style="font-size:18px;font-weight:700">대</span>${delta(data.total.delta, '대')}</div>
        </div>
        <div class="grow">
          <div class="small muted">조치 트랙 분기 <a class="sym-go" href="#/flow">세 갈래 구조 보기 ›</a></div>
          <div class="share">
            <i style="width:${auto / sum * 100}%;background:var(--chart-teal)" title="자율복구"></i>
            <i style="width:${cone / sum * 100}%;background:var(--primary)" title="C-One"></i>
            <i style="width:${media / sum * 100}%;background:var(--text-tertiary)" title="매체고도화"></i>
          </div>
          <div class="share-lg">
            <span><b style="background:var(--chart-teal)"></b>자율복구(단말) ${fmt(auto)}</span>
            <span><b style="background:var(--primary)"></b>C-One(OLT/ONU·MisMatch·구내) ${fmt(cone)}</span>
            <span><b style="background:var(--text-tertiary)"></b>매체고도화(HFC/VDSL, 분류만) ${fmt(media)} ${delta((data.media_upgrade || {}).delta || 0)}</span>
          </div>
        </div>
        <div class="xs muted" style="max-width:220px">전체 문제 장비 수를 먼저 보고, 아래 유형 카드에서 세부 내역으로 들어갑니다.</div>
      </div>
      <div class="sym-cards" id="sym-cards">
        ${data.cards.map((c) => `
          <a class="card sym-card ${c.key === 'ONU_MISSMATCH' ? 'hero' : ''}" href="#/symptom/${esc(c.key)}" title="${esc(c.label)} 세부 내역">
            <div class="sym-l"><span>${esc(c.label)}</span>${c.segment.split('/').map(segBadge).join('')}</div>
            <div class="sym-n">${fmt(c.count)}<small>건</small></div>
            <div class="sym-f">${delta(c.delta, '건')}<span class="sym-go">세부 내역 ›</span></div>
            ${c.bucket === 'AUTO_RECOVERY' ? '<div class="xs muted" style="margin-top:6px">→ 자율복구 트랙</div>' : c.key === 'ONU_MISSMATCH' ? `<div class="xs" style="margin-top:6px;display:flex;justify-content:space-between;gap:6px"><span style="color:var(--primary);font-weight:700">대표 시연 시나리오</span><span class="muted" title="리셋 이력이 있는데도 미스매치가 남은 장비 — 현장 구내환경·선로 점검">${esc(c.premises_label || '구내환경')} <b style="color:var(--grade-d)">${fmt(c.premises)}</b></span></div>` : ''}
          </a>`).join('')}
      </div>`;
    // 카운트업 + 카드 순차 노출
    const tn = $('#total-n'); const t0 = performance.now();
    const tick = (t) => { const p = Math.min(1, (t - t0) / 600); tn.textContent = fmt(Math.round(total * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    document.querySelectorAll('.sym-card').forEach((c, i) => setTimeout(() => c.classList.add('show'), 60 * i + 80));
    icons();
  }

  // ═════════════════════════════════════════════════════════════
  // 세 갈래 구조
  // ═════════════════════════════════════════════════════════════
  async function renderFlow() {
    setCrumb('세 갈래 구조 <small>CEI C/D 등급 → 자율복구 / C-One / 매체고도화</small>');
    view().innerHTML = '<div class="empty">불러오는 중…</div>';
    const data = await api(`/overview?${orgQ()}`);
    const sc = data.scope; const B = sc.buckets;
    const total = data.total.count;
    const auto = data.cards.filter((c) => c.bucket === 'AUTO_RECOVERY').reduce((a, c) => a + c.count, 0);
    const mine = { AUTO_RECOVERY: auto, C_ONE: total - auto, MEDIA_UPGRADE: (data.media_upgrade || {}).count || 0 };
    const col = { AUTO_RECOVERY: '#2BB8A8', C_ONE: '#1B3F8F', MEDIA_UPGRADE: '#8A8D91' };
    // SVG: 좌측 전체 규모 → 세 갈래(리본 두께 ∝ 비중) → 각 트랙 처리 → 결과 회수 → 학습 피드백
    const W = 1180, H = 430, x0 = 30, bw = 180, top = 50, bh = 320;
    const bx = x0 + bw + 100, bwid = 330, boxH = 92, gapY = 22;
    const rx = 830, rw = 320;
    const bands = B.map((b, i) => ({ ...b, y: top + i * (boxH + gapY), h: boxH, ribbon: Math.max(8, Math.min(64, 64 * b.share / 0.61)) }));
    const arrowLabel = { AUTO_RECOVERY: '자동 리셋 → 회수', C_ONE: 'Ticket → 조치 → 검증', MEDIA_UPGRADE: '분류만 · 월 1회' };
    const svg = `
    <svg class="flow-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans KR, sans-serif">
      <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8D91"/></marker>
           <marker id="arrb" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1B3F8F"/></marker></defs>
      <rect x="${x0}" y="${top}" width="${bw}" height="${bh}" rx="12" fill="#EBF2FF" stroke="#1B3F8F" stroke-width="1.5"/>
      <text x="${x0 + bw / 2}" y="${top + 54}" text-anchor="middle" font-size="15" font-weight="700" fill="#1C2B33">${esc(sc.total.label)}</text>
      <text x="${x0 + bw / 2}" y="${top + 100}" text-anchor="middle" font-size="36" font-weight="800" fill="#1B3F8F">80만</text>
      <text x="${x0 + bw / 2}" y="${top + 124}" text-anchor="middle" font-size="12" fill="#65676B">${esc(sc.total.volume)} · ${esc(sc.total.unit)} (전사)</text>
      <line x1="${x0 + 24}" x2="${x0 + bw - 24}" y1="${top + 160}" y2="${top + 160}" stroke="#BCCEF8"/>
      <text x="${x0 + bw / 2}" y="${top + 196}" text-anchor="middle" font-size="12" fill="#65676B">내 관할 문제 장비</text>
      <text x="${x0 + bw / 2}" y="${top + 230}" text-anchor="middle" font-size="26" font-weight="800" fill="#1C2B33">${fmt(total)}대</text>
      <text x="${x0 + bw / 2}" y="${top + 254}" text-anchor="middle" font-size="11" fill="#6B6E73">${esc(orgLabel())}</text>
      ${bands.map((b) => `
        <path d="M${x0 + bw},${b.y + b.h / 2} C ${x0 + bw + 50},${b.y + b.h / 2} ${bx - 50},${b.y + b.h / 2} ${bx},${b.y + b.h / 2}" stroke="${col[b.id]}" stroke-width="${b.ribbon}" fill="none" opacity=".3"/>
        <rect x="${bx}" y="${b.y}" width="${bwid}" height="${b.h}" rx="10" fill="#fff" stroke="${col[b.id]}" stroke-width="2"/>
        <text x="${bx + 16}" y="${b.y + 24}" font-size="15" font-weight="800" fill="${col[b.id]}">${esc(b.label)}<tspan dx="8" font-size="11" font-weight="500" fill="#65676B">${esc(b.target.length > 16 ? b.target.slice(0, 15) + '…' : b.target)}</tspan></text>
        <text x="${bx + bwid - 14}" y="${b.y + 24}" text-anchor="end" font-size="13" font-weight="700" fill="#1C2B33">${Math.round(b.share * 100)}% <tspan font-size="11" fill="${col[b.id]}">· 관할 ${fmt(mine[b.id])}대</tspan></text>
        <text x="${bx + 16}" y="${b.y + 48}" font-size="11.5" fill="#1C2B33">${esc(b.rule.length > 34 ? b.rule.slice(0, 33) + '…' : b.rule)}</text>
        <text x="${bx + 16}" y="${b.y + 68}" font-size="11" fill="#6B6E73">C-One 역할 · ${esc(b.cOneRole)}</text>
        ${b.id === 'C_ONE' && data.cone_breakdown ? `<text x="${bx + 16}" y="${b.y + 84}" font-size="10.5" fill="#1B3F8F">OLT/ONU 이상 ${fmt(data.cone_breakdown.olt_onu)} · MisMatch(원격) ${fmt(data.cone_breakdown.mismatch)} · 구내환경(현장) ${fmt(data.cone_breakdown.premises)}</text>` : ''}
        <path d="M${bx + bwid + 6},${b.y + b.h / 2} L ${rx - 10},${b.y + b.h / 2}" stroke="#8A8D91" stroke-width="1.5" fill="none" marker-end="url(#arr)" ${b.id === 'MEDIA_UPGRADE' ? 'stroke-dasharray="5 4"' : ''}/>
        <text x="${(bx + bwid + rx) / 2}" y="${b.y + b.h / 2 - 8}" text-anchor="middle" font-size="11" fill="#65676B">${arrowLabel[b.id]}</text>
      `).join('')}
      <rect x="${rx}" y="${top}" width="${rw}" height="${bh}" rx="12" fill="#F0F2F5" stroke="#CED0D4"/>
      <text x="${rx + rw / 2}" y="${top + 30}" text-anchor="middle" font-size="14" font-weight="800" fill="#1C2B33">결과 회수 · CEI 효과검증</text>
      <text x="${rx + rw / 2}" y="${top + 50}" text-anchor="middle" font-size="11" fill="#65676B">Closed-loop 종료점 = 고객 품질 정상화</text>
      <g font-size="12" fill="#1C2B33">
        <text x="${rx + 18}" y="${top + 92}" font-weight="700" fill="#2BB8A8">자율복구</text><text x="${rx + rw - 18}" y="${top + 92}" text-anchor="end">정상 전환률 ${Math.round(B[0].result.ok_rate * 100)}%</text>
        <text x="${rx + 18}" y="${top + 112}" fill="#65676B" font-size="11">재발 건은 현장 대상으로 복귀 · 리셋 이력으로 축적</text>
        <text x="${rx + 18}" y="${top + 156}" font-weight="700" fill="#1B3F8F">C-One</text><text x="${rx + rw - 18}" y="${top + 156}" text-anchor="end">조치 후 CEI 회복 ${Math.round(B[1].result.verify_ok * 100)}%</text>
        <text x="${rx + 18}" y="${top + 176}" fill="#65676B" font-size="11">Ticket별 전후 CEI 비교(D+3) · 미회복은 재진단</text>
        <text x="${rx + 18}" y="${top + 220}" font-weight="700" fill="#6B6E73">매체고도화</text><text x="${rx + rw - 18}" y="${top + 220}" text-anchor="end">분류 건수 집계</text>
        <text x="${rx + 18}" y="${top + 240}" fill="#65676B" font-size="11">사업화 트랙(투자) 의사결정 입력</text>
        <rect x="${rx + 14}" y="${top + 268}" width="${rw - 28}" height="34" rx="8" fill="#EBF2FF"/>
        <text x="${rx + rw / 2}" y="${top + 290}" text-anchor="middle" font-weight="700" fill="#1B3F8F">→ 대상선정 룰 재학습 (효과 높은 대상)</text>
      </g>
      <path d="M${rx + rw / 2},${top + bh} C ${rx + rw / 2},${H - 12} ${x0 + bw / 2},${H - 12} ${x0 + bw / 2},${top + bh + 3}" stroke="#1B3F8F" stroke-width="1.5" stroke-dasharray="6 4" fill="none" marker-end="url(#arrb)"/>
      <text x="${(rx + x0 + bw) / 2}" y="${top + bh + 18}" text-anchor="middle" font-size="11" fill="#1B3F8F">학습 결과가 다음 날 대상선정에 반영</text>
      <text x="${W - 8}" y="${H - 4}" text-anchor="end" font-size="10" fill="#9A5C00">비중(61/27/12%)·회수율은 예시 데이터</text>
    </svg>`;
    view().innerHTML = `
      <section class="card"><div class="card-hd"><span class="card-title"><i data-lucide="git-fork"></i>CEI C/D 등급 80만 → 세 갈래 처리 → 결과 회수</span>
        <span class="card-sub">C-One은 세 갈래 전체를 다루되, 개선 작업은 가운데(OLT/ONU·MisMatch·구내환경)가 중심</span></div>
        <div class="card-bd">${svg}</div></section>
      <div class="flow-legend">
        ${B.map((b, i) => `<div class="card flow-box b${i}"><h4>${esc(b.label)} <span class="muted small">· ${esc(b.target)}</span></h4>
          <p>${esc(b.rule)}</p><p><b>C-One 역할</b> — ${esc(b.cOneRole)}</p><p class="xs">${esc(b.result.label)}</p>
          ${b.id === 'C_ONE' && data.cone_breakdown ? `<p class="xs"><b>관할 내역</b> — OLT/ONU 이상 ${fmt(data.cone_breakdown.olt_onu)} · 속도 MisMatch(원격) ${fmt(data.cone_breakdown.mismatch)} · 구내환경(현장) ${fmt(data.cone_breakdown.premises)}</p>` : ''}
          ${b.id === 'AUTO_RECOVERY' ? '<a class="sym-go" href="#/autoreset">자율복구 트랙 열기 ›</a>' : b.id === 'C_ONE' ? '<a class="sym-go" href="#/home">초기 화면에서 유형 카드로 진입 ›</a>' : '<span class="xs muted">사업화 트랙 — 이 화면에서는 분류·건수만</span>'}
        </div>`).join('')}
      </div>`;
    icons();
  }

  // ═════════════════════════════════════════════════════════════
  // 세부 내역 (증상 → 분류 → 조치)
  // ═════════════════════════════════════════════════════════════
  const CARD_RULES = { LOSS: ['OLT_LOSS', 'ONU_LOSS'] };
  const CARD_LABEL = { ONU_MISSMATCH: '속도 MisMatch', OLT_OPTICAL_LOW: 'OLT 광신호 저하', OLT_CRC_BIP: 'OLT CRC/BIP 증가', ONU_OPTICAL_LOW: 'ONU 광신호 저하', ONU_CRC_BIP: 'ONU CRC/BIP 증가', LOSS: 'Loss/Flap/RTT 증가', TERMINAL_AP: 'NW단말/AP 이상' };
  let symState = { key: '', devices: [], selected: null };
  const thresholdsOf = (rid) => ((S.boot && S.boot.thresholds) || {})[rid];

  async function renderSymptom(key) {
    const ids = CARD_RULES[key] || [key];
    const label = CARD_LABEL[key] || key;
    setCrumb(`<a href="#/home" class="muted" style="font-weight:500">초기 화면</a> › ${esc(label)} <small>${esc(orgLabel())}</small>`);
    view().innerHTML = '<div class="empty">불러오는 중…</div>';
    const res = await Promise.all(ids.map((id) => api(`/symptom/${id}?${orgQ()}`)));
    const rules = res.map((r) => r.rule);
    let devices = [].concat(...res.map((r) => r.devices || []));
    devices.sort((a, b) => a.cei - b.cei || b.cd_cnt - a.cd_cnt);
    symState = { key, devices, selected: devices[0] || null, rules };
    const rule0 = rules[0];
    const branchesTxt = (r) => r.branches.map((b) => `${b.when} → ${b.action}`).join(' / ');
    view().innerHTML = `
      <div class="sym-head">
        <h2>${esc(label)} ${rules.map((r) => segBadge(r.segment)).join('')} <span class="muted" style="font-size:14px;font-weight:500">${fmt(devices.length)}대 표시</span></h2>
        <div class="row"><a class="btn" href="#/home"><i data-lucide="arrow-left"></i>초기 화면</a>
          ${key === 'ONU_MISSMATCH' ? '<a class="btn" href="#/autoreset"><i data-lucide="refresh-cw"></i>자율복구 트랙</a>' : ''}</div>
      </div>
      <div class="card mb"><div class="card-bd">
        ${rules.map((r) => `<div class="pipe3 ${rules.length > 1 ? 'mb' : ''}">
          <div><b>① 증상</b>${esc(r.segment)} · ${esc(r.symptom)}</div>
          <div><b>② 분류</b>${esc(r.classification.check)} <span class="badge badge-gray">${esc(r.classification.type)}</span></div>
          <div><b>③ 조치</b>${esc(branchesTxt(r))}</div></div>`).join('')}
        ${rule0.detail && rule0.detail.note ? `<div class="note blue mt xs">${esc(rule0.detail.note)}</div>` : ''}
        ${rules.some((r) => (thresholdsOf(r.id) || []).some((t) => t.assumed)) ? `<div class="note amber mt xs"><b>임계치는 운영 기준 확정 전 가정값</b>입니다 — ${rules.map((r) => (thresholdsOf(r.id) || []).filter((t) => t.assumed).map((t) => `${esc(t.label)} ${esc(t.op)} ${esc(t.value)}${esc(t.unit || '')}`).join(', ')).filter(Boolean).join(' / ')}. 실제 기준값을 받으면 룰 파일의 값만 교체합니다.</div>` : ''}
      </div></div>
      <div class="detail-grid">
        <section class="card">
          <div class="card-hd"><span class="card-title">대상 장비 <span class="loop-tag">대상선정</span></span><span class="card-sub">CEI 낮은 순 · 클릭하면 우측에 판정</span></div>
          <div class="tbl-wrap dev-list"><table class="tbl"><thead><tr><th>장비(TID)</th><th>구분</th><th>파트</th><th class="num">CEI</th><th class="num">C/D 고객</th><th>판정</th><th>조치</th></tr></thead>
            <tbody id="dev-body">${devices.map((d, i) => devRow(d, i)).join('') || '<tr><td colspan="7" class="empty">대상 없음</td></tr>'}</tbody></table></div>
        </section>
        <section class="card" id="dev-detail"></section>
      </div>`;
    icons();
    if (symState.selected) selectDevice(0);
  }
  function devRow(d, i) {
    const ans = d.rule_id === 'ONU_MISSMATCH' ? `${d.ports.filter((p) => p.mismatch).length}포트 MM` : d.answer;
    return `<tr class="clickable ${i === 0 ? 'sel' : ''}" data-i="${i}" onclick="window.demoSelectDevice(${i})">
      <td><b>${esc(d.tid)}</b><div class="xs muted">${esc(d.model)}</div></td><td>${segBadge(d.segment)}</td><td>${esc(d.post)}</td>
      <td class="num" style="color:${d.cei < 65 ? 'var(--grade-d)' : 'var(--grade-c)'};font-weight:700">${d.cei}</td><td class="num">${fmt(d.cd_cnt)}</td>
      <td><span class="badge ${d.answer === 'YES' || d.answer === '포화' ? 'badge-bad' : d.answer === 'NO' || d.answer === '정상' ? 'badge-warn' : 'badge-gray'}">${esc(ans)}</span></td>
      <td>${atBadge(d.branch.actionType)}</td></tr>`;
  }
  window.demoSelectDevice = selectDevice;
  async function selectDevice(i) {
    const d = symState.devices[i]; if (!d) return;
    symState.selected = d;
    document.querySelectorAll('#dev-body tr').forEach((tr) => tr.classList.toggle('sel', Number(tr.dataset.i) === i));
    const rule = symState.rules.find((r) => r.id === d.rule_id);
    let full = d;
    if (d.rule_id === 'ONU_MISSMATCH') { const r = await api(`/device/${encodeURIComponent(d.id)}`); if (r.device) full = r.device; }
    renderDetail(full, rule);
  }
  function evRow(e) {
    const val = `${esc(e.value)}${e.unit ? ' ' + esc(e.unit) : ''}`;
    const th = (e.threshold == null ? '-' : `${esc(e.threshold)}${e.unit && typeof e.threshold === 'number' ? ' ' + esc(e.unit) : ''}`)
      + (e.assumed ? ' <span class="badge badge-warn" title="운영 기준 확정 전 가정값" style="font-size:10px;padding:0 5px">가정</span>' : '');
    const mark = e.breach === true ? '<span class="ev-br">● 초과</span>' : e.breach === false ? '<span class="muted">○ 이내</span>' : '<span class="muted">–</span>';
    return `<tr><td>${esc(e.label)}${e.note ? `<div class="xs muted">${esc(e.note)}</div>` : ''}</td><td class="num"><b>${val}</b></td><td class="num muted">${th}</td><td>${mark}</td></tr>`;
  }
  function renderDetail(d, rule) {
    const el = $('#dev-detail'); if (!el) return;
    const type = rule.classification.type;
    let verdictHtml = '';
    if (type === 'YES_NO' && d.rule_id !== 'ONU_MISSMATCH') {
      verdictHtml = `<div class="verdict"><span class="q">${esc(rule.classification.check)}</span>
        <span class="badge ${d.answer === 'YES' ? 'badge-bad' : 'badge-warn'}" style="font-size:13px;padding:4px 12px">${d.answer === 'YES' ? 'Yes' : 'No'}</span>${ox(d.answer === 'YES')}</div>`;
    } else if (type === 'MULTI') {
      verdictHtml = (d.checks || []).map((c) => `<div class="verdict" style="margin-bottom:6px"><span class="q">${esc(c.label)}</span>${ox(c.yes)}</div>`).join('');
    } else if (type === 'THRESHOLD') {
      verdictHtml = `<div class="verdict"><span class="q">${esc(rule.classification.check)}</span><span class="badge ${d.answer === '포화' ? 'badge-bad' : 'badge-good'}" style="font-size:13px;padding:4px 12px">${esc(d.answer)}</span>${ox(d.answer === '포화')}</div>`;
    } else if (d.rule_id === 'ONU_MISSMATCH') {
      const mm = d.ports.filter((p) => p.mismatch);
      verdictHtml = `<div class="verdict"><span class="q">${esc(rule.classification.check)}</span><span class="badge badge-bad" style="font-size:13px;padding:4px 12px">MisMatch ${mm.length}포트</span>${ox(true)}</div>
        <div class="verdict" style="margin-top:6px"><span class="q">리셋 이력 없는 포트 있음 → 원격(자율복구) 우선</span>${ox(mm.some((p) => !p.reset_hist))}</div>
        <div class="verdict" style="margin-top:6px"><span class="q">리셋 이력 있어도 미스매치 지속 → 현장 대상</span>${ox(mm.some((p) => !!p.reset_hist))}</div>`;
    } else {
      verdictHtml = `<div class="verdict"><span class="q">분류 없음 — 단말 이상은 자율복구/서비스 점검으로 직행</span>${ox(null)}</div>`;
    }
    const hit = (b) => b.when === d.branch.when && b.action === d.branch.action;
    const branches = rule.branches.map((b) => `<div class="branch ${hit(b) ? 'hit' : ''}"><span class="when">${esc(b.when)}</span><span class="arrow">→</span><span class="act">${esc(b.action)}</span>${atBadge(b.actionType)}${hit(b) ? '<i data-lucide="check-circle-2" style="color:var(--primary)"></i>' : ''}</div>`).join('')
      + (rule.branches.some(hit) ? '' : `<div class="branch hit"><span class="when">${esc(d.branch.when)}</span><span class="arrow">→</span><span class="act">${esc(d.branch.action)}</span>${atBadge(d.branch.actionType)}</div>`);
    const det = rule.detail || {};
    const lists = [['원격 확인', det.remoteCheck], ['현장 확인', det.fieldCheck], ['이관', det.transfer]].filter((x) => x[1] && x[1].length)
      .map((x) => `<div class="mt"><div class="xs muted" style="font-weight:700">${x[0]}</div><div class="chip-list">${x[1].map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>`).join('');
    let actions = '';
    if (d.rule_id === 'ONU_MISSMATCH') actions = mismatchPorts(d);
    else actions = `<div class="row wrap mt">${actionButton(d)}</div>`;
    el.innerHTML = `
      <div class="card-hd"><span class="card-title">${esc(d.tid)} ${segBadge(d.segment)}<span class="muted small" style="font-weight:500">${esc(d.model)} · ${esc(d.tpo_nm)} · ${esc(d.team)} › ${esc(d.post)}</span></span>
        <span class="card-sub row">CEI <b style="color:var(--grade-d)">${d.cei}</b> · C/D 고객 <b>${fmt(d.cd_cnt)}</b> · VoC(7일) ${d.voc_7d}${d.mac ? ` · <span class="muted" title="마스킹 MAC (가번 미노출)">${esc(d.mac)}</span>` : ''}
          <a class="btn btn-sm" href="#/map/${encodeURIComponent(d.id)}" title="지도에서 위치·주변 장비 상태 보기"><i data-lucide="map-pin"></i>지도에서 보기</a></span></div>
      <div class="dstep"><div class="dstep-h"><span class="n">1</span>증상 <span class="muted small" style="font-weight:500">${esc(rule.symptom)} — 판정 근거(임계치 대비 실측값)</span></div>
        <table class="tbl ev-tbl"><thead><tr><th>항목</th><th class="num">실측</th><th class="num">임계</th><th>판정</th></tr></thead><tbody>${d.evidence.map(evRow).join('')}</tbody></table></div>
      <div class="dstep"><div class="dstep-h"><span class="n">2</span>분류 판정 <span class="loop-tag">진단</span></div>${verdictHtml}<div class="mt">${branches}</div></div>
      <div class="dstep"><div class="dstep-h"><span class="n">3</span>권장 조치 ${atBadge(d.branch.actionType)} <span style="font-weight:800;color:var(--primary)">${esc(d.branch.action)}</span></div>
        ${lists}${actions}
        <div class="hint-loop"><i data-lucide="repeat"></i><span>조치 후 CEI 전후 효과검증(D+3)까지 자동 추적합니다. 업무 종료점은 '작업 완료'가 아니라 <b>고객 품질(CEI) 정상화</b>입니다.</span></div>
      </div>`;
    icons();
  }
  function actionButton(d) {
    const t = d.branch.actionType;
    if (t === 'REMOTE') return `<button class="btn btn-primary" onclick="window.demoTransfer(${jsArg([d.id])}, ${jsArg(d.tid)})"><i data-lucide="refresh-cw"></i>자율복구로 넘기기</button><span class="xs muted">야간 최한시에 원격 실행 · 결과 회수 후 재판정</span>`;
    if (t === 'FIELD') return `<button class="btn btn-danger" onclick="window.demoTicket(${jsArg(d.id)}, ${jsArg('현장 조치 Ticket · ' + d.branch.action)}, ${jsArg(d.tid)})"><i data-lucide="wrench"></i>현장 Ticket 발행</button><span class="xs muted">FMS 연계 → Post(현장 BS 조직) 할당</span>`;
    if (t === 'TRANSFER') return `<button class="btn" onclick="window.demoTicket(${jsArg(d.id)}, ${jsArg('이관 · ' + d.branch.action + ' (' + (d.branch.assignee || '서비스 지점') + ')')}, ${jsArg(d.tid)})"><i data-lucide="send"></i>${esc(d.branch.assignee || '서비스 지점')} 점검 요청 (이관)</button>`;
    if (t === 'INVESTMENT') return `<button class="btn" onclick="window.demoTicket(${jsArg(d.id)}, ${jsArg('투자검토 · ' + d.branch.action)}, ${jsArg(d.tid)})"><i data-lucide="landmark"></i>투자검토 대상 등록</button><span class="xs muted">${esc(d.branch.action)} — 사업화/투자 트랙 입력</span>`;
    return '';
  }
  function mismatchPorts(d) {
    const done = new Set(d.transferred_ports || []);
    const mm = d.ports.filter((p) => p.mismatch);
    const pending = mm.filter((p) => !p.reset_hist && !done.has(p.port));
    const field = mm.filter((p) => p.reset_hist);
    return `
      <div class="xs muted mt" style="font-weight:700">포트별 미스매치 현황 <span class="muted" style="font-weight:500">— 기가 상품인데 100M 링크 = 미스매치</span></div>
      <div class="ports">${d.ports.map((p) => `<div class="port ${p.mismatch ? 'mm' : ''} ${p.reset_hist ? 'hist' : ''} ${done.has(p.port) ? 'done' : ''}" title="${esc(p.recommend || '정상')}">
        <div class="pn">P${p.port}</div><div class="pl">${esc(p.product)}</div><div style="font-weight:700">${esc(p.link)}</div>
        <div class="pl">${done.has(p.port) ? '이관됨' : p.reset_hist ? '리셋 이력' : p.mismatch ? 'MM' : '정상'}</div></div>`).join('')}</div>
      <div class="share-lg"><span><b style="background:var(--red-bg);border:1px solid var(--grade-d)"></b>미스매치</span><span><b style="background:var(--amber-bg);border:1px solid var(--amber-fg)"></b>미스매치 + 자율복구 리셋 이력</span><span><b style="background:var(--green-bg);border:1px solid var(--grade-b)"></b>자율복구 이관 완료</span></div>
      <table class="tbl port-tbl mt"><thead><tr><th>포트</th><th>상품 / 링크</th><th>리셋 이력</th><th>판정</th><th>조치</th></tr></thead><tbody>
        ${mm.map((p) => `<tr>
          <td><b>P${p.port}</b></td><td>${esc(p.product)} / <b style="color:var(--grade-d)">${esc(p.link)}</b></td>
          <td>${p.reset_hist ? `<span class="badge badge-warn">있음 · ${esc(p.reset_hist.at)}</span><div class="xs muted">${esc(p.reset_hist.result)}</div>` : '<span class="badge badge-gray">없음</span>'}</td>
          <td>${p.reset_hist ? '리셋 후에도 미스매치 지속' : '리셋 미시도'}</td>
          <td>${done.has(p.port) ? '<span class="badge badge-good">자율복구 이관 완료</span>'
              : p.reset_hist ? `<button class="btn btn-sm btn-danger" onclick="window.demoTicket(${jsArg(d.id + '#P' + p.port)}, ${jsArg('현장 출동 · 구내환경·선로 점검 요청')}, ${jsArg(d.tid + ' P' + p.port)})"><i data-lucide="wrench"></i>구내환경·선로 점검 요청</button>`
              : `<button class="btn btn-sm btn-primary" onclick="window.demoTransfer(${jsArg([d.id + '#P' + p.port])}, ${jsArg(d.tid + ' P' + p.port)})"><i data-lucide="refresh-cw"></i>자율복구로 넘기기</button>`}</td></tr>`).join('')}
      </tbody></table>
      <div class="row wrap mt">
        ${pending.length ? `<button class="btn btn-primary" onclick="window.demoTransfer(${jsArg(pending.map((p) => `${d.id}#P${p.port}`))}, ${jsArg(d.tid + ' 이력 없는 ' + pending.length + '개 포트')})"><i data-lucide="refresh-cw"></i>이력 없는 ${pending.length}개 포트 자율복구로 넘기기</button>` : '<span class="badge badge-good">이력 없는 포트 모두 이관됨</span>'}
        ${field.length ? `<span class="xs muted">리셋 이력 있는 ${field.length}개 포트(${field.map((p) => 'P' + p.port).join(', ')})는 현장 출동 대상 — 구내환경·선로 점검</span>` : ''}
      </div>`;
  }
  window.demoTransfer = async function (ids, label) {
    const ok = await confirmModal('자율복구로 넘기겠습니까?', `<b>${esc(label)}</b><ul><li>대상 ${ids.length}건 — 야간 최한시(02:00~04:00)에 포트 리셋을 자동 실행합니다.</li><li>실행 결과(정상 전환/재발)는 다음 날 아침 C-One으로 회수되어 CEI 효과검증에 반영됩니다.</li></ul>`, '자율복구로 넘기기');
    if (!ok) return;
    const r = await api('/autoreset/transfer', { method: 'POST', body: JSON.stringify({ ids }) });
    if (!r.ok) return toast('이관 실패: ' + esc(r.error || ''), 'warn');
    S.ar.batch = r.batch;
    toast(`자율복구 이관 완료 · 배치 ${esc(r.batch.batch_id)} (${ids.length}건) — <a href="#/autoreset/2" style="color:#fff;text-decoration:underline">실행 시뮬레이션 보기</a>`, 'good');
    if (symState.selected) { const i = symState.devices.indexOf(symState.selected); if (i >= 0) selectDevice(i); }
  };
  window.demoTicket = async function (targetId, kind, label) {
    const ok = await confirmModal('Ticket(작업지시서)을 발행하겠습니까?', `<b>${esc(label)}</b><ul><li>${esc(kind)}</li><li>Ticket(작업지시서)은 FMS로 연계되어 담당 Post에 할당됩니다.</li><li>조치 완료 후 D+3 CEI 전후 비교로 효과를 검증합니다.</li></ul>`, '발행');
    if (!ok) return;
    const r = await api('/inspect-request', { method: 'POST', body: JSON.stringify({ target_id: targetId, kind }) });
    if (r.ok) toast(`Ticket ${esc(r.ticket.ticket_no)} 발행 · ${esc(kind)}`, 'good'); else toast('발행 실패', 'warn');
  };

  // ═════════════════════════════════════════════════════════════
  // 자율복구 트랙
  // ═════════════════════════════════════════════════════════════
  function arSteps(cur) {
    const names = ['이관 대상 확인', '실행 시뮬레이션', '결과 대시보드'];
    return `<div class="steps">${names.map((n, i) => `<a class="step ${cur === i + 1 ? 'active' : ''} ${cur > i + 1 ? 'done' : ''}" href="#/autoreset/${i + 1}"><span class="n">${i + 1}</span>${n}${i === 1 ? ' <span class="stage-tag">연출</span>' : ''}</a>`).join('')}</div>`;
  }
  async function renderAutoreset(step) {
    setCrumb(`자율복구 <small>Auto-reset Agent 트랙 · ${esc(orgLabel())}</small>`);
    if (step === 2) return renderArSim();
    if (step === 3) return renderArResults();
    view().innerHTML = arSteps(1) + '<div class="empty">불러오는 중…</div>';
    const data = await api(`/autoreset/candidates?${orgQ()}`);
    const s = data.summary;
    view().innerHTML = arSteps(1) + `
      <div class="grid g4 mb">
        <div class="card kpi"><div class="kpi-l">진단 결과 단말·포트 대상</div><div class="kpi-v">${fmt(s.total)}</div><div class="kpi-s">NW단말/AP 이상 + MisMatch 포트</div></div>
        <div class="card kpi"><div class="kpi-l">자동 제외</div><div class="kpi-v" style="color:var(--amber-fg)">${fmt(s.excluded)}</div><div class="kpi-s">리셋 이력 있음 → 현장/서비스 점검</div></div>
        <div class="card kpi"><div class="kpi-l">자율복구 이관 가능</div><div class="kpi-v" style="color:var(--primary)">${fmt(s.eligible)}</div><div class="kpi-s">리셋 이력 없음</div></div>
        <div class="card kpi"><div class="kpi-l">자율복구 이관 완료(이 세션)</div><div class="kpi-v" style="color:var(--grade-b)">${fmt(s.transferred)}</div><div class="kpi-s">야간 배치 대기</div></div>
      </div>
      <div class="note blue mb xs"><b>'무조건 많이 Reset'이 아니라 '잘 될 대상'만 넘깁니다.</b> 이미 리셋했는데도 재발한 건은 자동 제외하고 현장·서비스 점검으로 보냅니다.</div>
      <section class="card">
        <div class="card-hd"><span class="card-title">이관 대상 확인 <span class="loop-tag">대상선정 → Auto-reset</span></span>
          <div class="row"><label class="toggle"><input type="checkbox" class="chk" id="ar-all" onchange="window.arToggleAll(this.checked)"> 이관 가능 전체 선택</label>
            <button class="btn btn-primary" id="ar-go" onclick="window.arTransferSelected()" disabled><i data-lucide="refresh-cw"></i>선택 <span id="ar-n">0</span>건 자율복구로 넘기기</button></div></div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 420px)"><table class="tbl"><thead><tr><th></th><th>장비(TID)</th><th>포트</th><th title="마스킹 MAC — 가번 대신 쓰는 보조 식별자">MAC</th><th>구분</th><th>증상</th><th>운용팀 › 파트</th><th class="num">CEI</th><th>상태 / 제외 사유</th></tr></thead>
          <tbody>${data.items.map((it) => `<tr class="${it.excluded || it.transferred ? 'muted' : ''}">
            <td>${it.excluded || it.transferred ? '' : `<input type="checkbox" class="chk ar-chk" value="${esc(it.id)}" onchange="window.arCount()">`}</td>
            <td><b>${esc(it.tid)}</b></td><td>${it.port ? 'P' + it.port : '-'}</td><td class="muted xs" style="font-family:ui-monospace,monospace">${esc(it.mac || '')}</td><td>${esc(it.segment)}</td><td>${esc(it.symptom)}</td><td>${esc(it.team)} › ${esc(it.post)}</td><td class="num">${it.cei}</td>
            <td>${it.transferred ? '<span class="badge badge-good">이관 완료 · 야간 실행 대기</span>' : it.excluded ? `<span class="badge badge-warn">자동 제외</span> <span class="xs">${esc(it.exclude_reason)}</span>` : '<span class="badge badge-remote">자율복구 이관 가능</span>'}</td></tr>`).join('')}
          </tbody></table></div>
      </section>`;
    icons();
  }
  window.arCount = function () { const n = document.querySelectorAll('.ar-chk:checked').length; $('#ar-n').textContent = n; $('#ar-go').disabled = !n; };
  window.arToggleAll = function (v) { document.querySelectorAll('.ar-chk').forEach((c) => { c.checked = v; }); window.arCount(); };
  window.arTransferSelected = async function () {
    const ids = [...document.querySelectorAll('.ar-chk:checked')].map((c) => c.value);
    if (!ids.length) return;
    const ok = await confirmModal('자율복구로 넘기겠습니까?', `<b>${ids.length}건</b>을 자율복구 Agent에 이관합니다.<ul><li>야간 최한시(02:00~04:00)에 원격 리셋을 배치 실행합니다.</li><li>실행 결과는 다음 날 아침 결과 대시보드와 CEI 효과검증에 반영됩니다.</li></ul>`, `${ids.length}건 넘기기`);
    if (!ok) return;
    const r = await api('/autoreset/transfer', { method: 'POST', body: JSON.stringify({ ids }) });
    if (!r.ok) return toast('이관 실패', 'warn');
    S.ar.batch = r.batch;
    toast(`배치 ${esc(r.batch.batch_id)} 생성 · ${ids.length}건 이관`, 'good');
    location.hash = '#/autoreset/2';
  };

  let simToken = 0;
  async function renderArSim() {
    let batch = S.ar.batch;
    if (!batch) { const r = await api('/autoreset/batches'); batch = (r.batches || [])[0]; S.ar.batch = batch || null; }
    if (!batch) {
      view().innerHTML = arSteps(2) + `<div class="card"><div class="empty">아직 이관된 배치가 없습니다. <a class="sym-go" href="#/autoreset/1">1단계에서 대상을 이관</a>하거나 초기 화면의 MisMatch 세부 내역에서 포트를 넘겨 주세요.</div></div>`;
      return;
    }
    const token = ++simToken;
    view().innerHTML = arSteps(2) + `
      <div class="note amber mb"><b>실제 실행은 야간에 수행됩니다. 아래는 동작 예시입니다.</b> — 배치 ${esc(batch.batch_id)} · 예정 ${esc(batch.scheduled)} · 이관 ${esc(batch.created_at)}${batch.by ? ' · ' + esc(batch.by) : ''}</div>
      <div class="grid g4 mb">
        <div class="card kpi"><div class="kpi-l">이관 대상</div><div class="kpi-v">${fmt(batch.summary.count)}</div></div>
        <div class="card kpi"><div class="kpi-l">리셋 시행</div><div class="kpi-v" id="sim-run">0</div><div class="kpi-s">보류 <span id="sim-hold">0</span> (트래픽·세션 감지)</div></div>
        <div class="card kpi"><div class="kpi-l">정상 전환</div><div class="kpi-v" style="color:var(--grade-b)" id="sim-ok">0</div><div class="kpi-s">리셋 후 링크 1G 복귀 / C·D 해소</div></div>
        <div class="card kpi"><div class="kpi-l">재발</div><div class="kpi-v" style="color:var(--grade-d)" id="sim-recur">0</div><div class="kpi-s">→ 현장 대상으로 복귀</div></div>
      </div>
      <section class="card">
        <div class="card-hd"><span class="card-title">항목별 리셋 시행 <span class="stage-tag">연출</span></span>
          <div class="row"><span class="card-sub" id="sim-status">실행 중…</span><button class="btn btn-sm" id="sim-skip">끝까지 보기</button><a class="btn btn-sm btn-primary" href="#/autoreset/3">결과 대시보드 ›</a></div></div>
        <div class="sim-row" style="font-weight:700;color:var(--text-secondary)"><span>#</span><span>대상</span><span>MAC</span><span>구분</span><span>리셋 시행</span><span>사유</span><span>결과</span></div>
        <div id="sim-rows">${batch.items.map((it, i) => {
          const [dev, port] = it.id.split('#'); const tid = it.tid || dev.split(':')[1] || dev; const seg = it.segment || (dev.startsWith('TERMINAL') ? '단말' : 'ONU 포트');
          return `<div class="sim-row" id="sim-${i}"><span class="muted">${i + 1}</span><span><b>${esc(tid)}</b>${port ? ' ' + esc(port) : ''}</span><span class="muted xs" style="font-family:ui-monospace,monospace">${esc(it.mac || '')}</span><span>${esc(seg)}</span><span class="st muted">대기</span><span class="muted"></span><span class="muted"></span></div>`; }).join('')}</div>
      </section>`;
    icons();
    let fast = false; $('#sim-skip').onclick = () => { fast = true; };
    const c = { run: 0, hold: 0, ok: 0, recur: 0 };
    const per = batch.items.length > 25 ? 120 : 260;
    for (let i = 0; i < batch.items.length; i++) {
      if (token !== simToken) return;
      const it = batch.items[i]; const row = $('#sim-' + i); if (!row) return;
      row.classList.add('running'); row.children[4].innerHTML = '<span class="spin"></span> 실행 중';
      row.scrollIntoView({ block: 'nearest' });
      if (!fast) await sleep(per);
      row.classList.remove('running'); row.classList.add('finished');
      const run = it.status === '시행';
      row.children[4].innerHTML = run ? '<span class="badge badge-good">시행</span>' : '<span class="badge badge-warn">보류</span>';
      row.children[5].textContent = it.reason || (run ? '리셋 명령 전송 → 링크 재협상' : '');
      if (run) { c.run++; if (it.outcome === '정상 전환') { c.ok++; row.children[6].innerHTML = '<span class="badge badge-good">정상 전환</span>'; } else { c.recur++; row.children[6].innerHTML = '<span class="badge badge-bad">재발 → 현장</span>'; } }
      else { c.hold++; row.children[6].innerHTML = '<span class="muted">다음 배치 재시도</span>'; }
      $('#sim-run').textContent = c.run; $('#sim-hold').textContent = c.hold; $('#sim-ok').textContent = c.ok; $('#sim-recur').textContent = c.recur;
      if (!fast) await sleep(per * 0.5);
    }
    if (token === simToken) $('#sim-status').textContent = `완료 · 시행 ${c.run} / 보류 ${c.hold} · 정상 전환 ${c.ok} · 재발 ${c.recur} → 결과는 CEI 효과검증으로`;
  }

  async function renderArResults(days) {
    days = days || S.ar.days || 30; S.ar.days = days;
    view().innerHTML = arSteps(3) + '<div class="empty">불러오는 중…</div>';
    const r = await api(`/autoreset/results?days=${days}`);
    const k = r.kpi, g = r.grade;
    const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0) || 1;
    const bar = (o, order) => `<div class="gbar">${order.filter((x) => o[x[0]]).map((x) => `<span class="${x[1]}" style="flex:${o[x[0]]}" title="${x[0]} ${fmt(o[x[0]])}">${x[0]} ${Math.round(o[x[0]] / tot(o) * 100)}%</span>`).join('')}</div>`;
    view().innerHTML = arSteps(3) + `
      <div class="row mb" style="justify-content:space-between">
        <div class="xs muted">일별 추이는 자율복구 실적 원천(ADAMS) 집계값, C/D 등급 전후 변화는 <b>예시 데이터</b>입니다. 재발 = 리셋 후 7일 내 C/D 재진입(근사).</div>
        <div class="row period">${[7, 30, 90].map((d) => `<button class="btn btn-sm ${d === days ? 'active' : ''}" onclick="window.arResults(${d})">${d}일</button>`).join('')}</div>
      </div>
      <div class="grid g3 mb">
        <div class="card kpi"><div class="kpi-l">리셋 시행 건수</div><div class="kpi-v">${fmt(k.tried)}</div><div class="kpi-s">최근 ${days}일 (데이터 있는 날 기준)</div></div>
        <div class="card kpi"><div class="kpi-l">정상 전환 건수</div><div class="kpi-v" style="color:var(--grade-b)">${fmt(k.ok)}</div><div class="kpi-s">정상 전환률 ${k.ok_rate}%</div></div>
        <div class="card kpi"><div class="kpi-l">재발 건수</div><div class="kpi-v" style="color:var(--grade-d)">${fmt(k.recur)}</div><div class="kpi-s">재발률 ${k.recur_rate}% → 현장 대상으로 복귀</div></div>
      </div>
      <div class="grid g2 mb">
        <section class="card"><div class="card-hd"><span class="card-title">조치 전후 C/D 등급 변화 <span class="loop-tag">CEI 효과검증</span></span><span class="card-sub">시행 대상 ${fmt(k.tried)}건</span></div>
          <div class="card-bd">
            <div class="xs muted" style="font-weight:700">조치 전</div>${bar(g.before, [['C', 'g-c'], ['D', 'g-d']])}
            <div class="xs muted mt" style="font-weight:700">조치 후 (D+3)</div>${bar(g.after, [['S/A', 'g-sa'], ['B', 'g-b'], ['C', 'g-c'], ['D', 'g-d']])}
            <div class="note mt xs">C/D → B 이상 전환 <b>${fmt((g.after['S/A'] || 0) + (g.after.B || 0))}건</b>. 남은 C/D는 재발·미개선 건으로 현장 Ticket 대상이 됩니다.</div>
          </div></section>
        <section class="card"><div class="card-hd"><span class="card-title">기간별 추이</span><span class="card-sub">시행 / 정상 전환 / 재발</span></div>
          <div class="card-bd"><div class="chart-box"><canvas id="ar-chart"></canvas></div></div></section>
      </div>
      <div class="note xs">자율복구 결과는 매일 아침 C-One 초기 화면의 진단에 반영됩니다(재발 건 = 리셋 이력 있음 → 자동 제외 → 현장). 이것이 '효과 높은 대상의 정확한 선별'로 이어지는 학습 고리입니다.</div>`;
    if (window.Chart) {
      const ctx = $('#ar-chart').getContext('2d');
      S.charts.push(new Chart(ctx, {
        type: 'bar',
        data: { labels: r.daily.map((d) => d.dt.slice(4, 6) + '/' + d.dt.slice(6, 8)),
          datasets: [
            { label: '리셋 시행', data: r.daily.map((d) => d.tried), backgroundColor: '#BCCEF8', borderRadius: 3 },
            { label: '정상 전환', data: r.daily.map((d) => d.ok), type: 'line', borderColor: '#27753A', backgroundColor: '#27753A', tension: .3, pointRadius: 2 },
            { label: '재발', data: r.daily.map((d) => d.recur), type: 'line', borderColor: '#D6193A', backgroundColor: '#D6193A', tension: .3, pointRadius: 2 },
          ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
          scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, grid: { color: 'rgba(28,43,51,.06)' } } } },
      }));
    }
    icons();
  }
  window.arResults = (d) => renderArResults(d);

  // ═════════════════════════════════════════════════════════════
  // 지도 (별도 트랙)
  // ═════════════════════════════════════════════════════════════
  async function renderMap(focus) {
    setCrumb(`지도 <small>별도 트랙 · ${esc(orgLabel())}${focus ? ' · 세부 내역에서 이동' : ''}</small>`);
    view().innerHTML = `
      <div class="map-grid">
        <div id="demo-map"></div>
        <div>
          <section class="card mb"><div class="card-hd"><span class="card-title">필터</span></div><div class="card-bd" style="display:grid;gap:8px">
            <label class="toggle"><input type="checkbox" class="chk" id="mf-bad" onchange="window.mapRefresh()"> 불량만 표시</label>
            <label class="toggle"><input type="checkbox" class="chk" id="mf-olt" checked onchange="window.mapRefresh()"> OLT</label>
            <label class="toggle"><input type="checkbox" class="chk" id="mf-onu" checked onchange="window.mapRefresh()"> ONU</label>
            <label class="toggle"><input type="checkbox" class="chk" id="mf-lines" onchange="window.mapRefresh()"> 선로 구성(OLT–ONU) 표시 <span class="xs muted">기본 숨김</span></label>
            <label class="toggle" id="mf-overlay-wrap" hidden><input type="checkbox" class="chk" id="mf-overlay" checked onchange="window.mapRefresh()"> 도면 오버레이 <span class="xs muted" id="mf-overlay-label"></span></label>
          </div></section>
          <div id="map-focus" class="card mb" hidden></div>
          <section class="card mb"><div class="card-hd"><span class="card-title">범례</span></div><div class="card-bd map-legend">
            <div><span class="dot good"></span>양호 (CEI B 이상)</div><div><span class="dot bad"></span>불량 (CEI C/D · 증상 있음)</div>
            <div><span class="dot olt good"></span>OLT (큰 점) · <span class="dot good" style="width:9px;height:9px"></span>ONU (작은 점)</div>
            <div class="xs muted">점 클릭 → 상태 요약 → "점검 요청하겠습니까?"</div></div></section>
          <section class="card"><div class="card-hd"><span class="card-title">요약 <span class="loop-tag">대상선정 → Ticket 발행</span></span></div><div class="card-bd" id="map-sum">불러오는 중…</div></section>
          <div class="note xs mt">좌표·상태는 예시 데이터입니다. 초기 화면 흐름과는 독립된 별도 메뉴이며, 합칠지는 추후 판단합니다.</div>
        </div>
      </div>`;
    if (!window.L) { $('#demo-map').innerHTML = '<div class="empty">지도 라이브러리(Leaflet)를 불러오지 못했습니다. 네트워크(CDN)를 확인하세요.</div>'; return; }
    const data = await api(`/map?${orgQ()}${focus ? '&focus=' + encodeURIComponent(focus) : ''}`);
    S.mapData = data;
    const map = L.map('demo-map', { zoomControl: true });
    S.map = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    S.mapLayers = { pts: L.layerGroup().addTo(map), lines: L.layerGroup().addTo(map), overlay: L.layerGroup().addTo(map) };
    // 도면 이미지 오버레이 — data/demo_map_overlay.json 이 있을 때만 토글 노출 (OSM 위에 얹음)
    if (data.overlay) {
      S.overlay = L.imageOverlay(CFG.staticBase + data.overlay.image, data.overlay.bounds, { opacity: data.overlay.opacity || 0.85 });
      $('#mf-overlay-wrap').hidden = false; $('#mf-overlay-label').textContent = data.overlay.label || '';
    }
    window.mapRefresh();
    const b = L.latLngBounds(data.points.map((p) => [p.lat, p.lng]));
    if (b.isValid()) map.fitBounds(b.pad(0.1));
    setTimeout(() => map.invalidateSize(), 50);
    if (data.focus) {
      const f = data.focus;
      const fb = $('#map-focus'); fb.hidden = false;
      fb.innerHTML = `<div class="card-hd"><span class="card-title"><i data-lucide="map-pin"></i>${esc(f.tid)} <span class="badge badge-${f.kind === 'OLT' ? 'olt' : 'onu'}">${f.kind}</span></span><a class="btn btn-sm" href="#/symptom/${esc(ruleKeyOf(f.rule_id))}">세부 내역 ‹</a></div>
        <div class="card-bd small"><div>증상 <b>${esc(f.symptom)}</b> · CEI <b style="color:var(--grade-d)">${f.cei}</b></div><div class="mt xs">권장 조치 ${atBadge(f.actionType)} ${esc(f.action)}</div><div class="xs muted mt">주변 점 = 같은 파트의 다른 장비 상태(양호/불량)</div></div>`;
      setTimeout(() => { map.setView([f.lat, f.lng], 15); if (S.focusMarker) S.focusMarker.openPopup(); }, 120);
      icons();
    }
  }
  const ruleKeyOf = (rid) => (rid === 'OLT_LOSS' || rid === 'ONU_LOSS') ? 'LOSS' : rid;
  window.mapRefresh = function () {
    const d = S.mapData; if (!d || !S.map) return;
    const onlyBad = $('#mf-bad').checked, showOlt = $('#mf-olt').checked, showOnu = $('#mf-onu').checked, showLines = $('#mf-lines').checked;
    S.mapLayers.pts.clearLayers(); S.mapLayers.lines.clearLayers(); S.mapLayers.overlay.clearLayers();
    if (S.overlay && $('#mf-overlay') && $('#mf-overlay').checked) S.overlay.addTo(S.mapLayers.overlay);
    const vis = d.points.filter((p) => (p.kind === 'OLT' ? showOlt : showOnu) && (!onlyBad || p.status === 'bad'));
    const visIds = new Set(vis.map((p) => p.id));
    if (showLines) d.lines.forEach((l) => { if (visIds.has(l.from) || visIds.has(l.to)) L.polyline(l.coords, { color: '#8A8D91', weight: 1.2, opacity: .6, dashArray: '3 4' }).addTo(S.mapLayers.lines); });
    S.focusMarker = null;
    vis.forEach((p) => {
      const color = p.status === 'bad' ? '#E41E3F' : '#31A24C';
      const m = L.circleMarker([p.lat, p.lng], p.focus
        ? { radius: 13, color: '#1B3F8F', weight: 3, dashArray: '4 3', fillColor: color, fillOpacity: .95 }
        : { radius: p.kind === 'OLT' ? 10 : 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: .95 });
      m.bindPopup(() => popupHtml(p), { maxWidth: 300 });
      m.addTo(S.mapLayers.pts);
      if (p.focus) S.focusMarker = m;
    });
    const bad = vis.filter((p) => p.status === 'bad').length;
    $('#map-sum').innerHTML = `<div class="row" style="justify-content:space-between"><span>표시 장비</span><b>${fmt(vis.length)}</b></div>
      <div class="row" style="justify-content:space-between"><span>불량</span><b style="color:var(--grade-d)">${fmt(bad)}</b></div>
      <div class="row" style="justify-content:space-between"><span>점검 요청 발송</span><b>${fmt(d.points.filter((p) => p.requested).length)}</b></div>
      <div class="xs muted mt">전체 ${fmt(d.summary.total)}대 중 불량 ${fmt(d.summary.bad)}대 (${esc(orgLabel())})</div>`;
  };
  function popupHtml(p) {
    return `<div class="pp-title"><span class="dot ${p.status} ${p.kind === 'OLT' ? 'olt' : ''}"></span>${esc(p.tid)} <span class="badge badge-${p.kind === 'OLT' ? 'olt' : 'onu'}">${p.kind}</span></div>
      <div class="pp-row"><span>상태</span><b style="color:${p.status === 'bad' ? 'var(--grade-d)' : 'var(--grade-b)'}">${p.status === 'bad' ? '불량' : '양호'}</b></div>
      <div class="pp-row"><span>증상</span><span>${esc(p.symptom || '-')}</span></div>
      ${p.focus ? `<div class="pp-row"><span>권장 조치</span><span>${atBadge(p.actionType)} ${esc(p.action)}</span></div>` : ''}
      <div class="pp-row"><span>CEI</span><b>${p.cei}</b></div>
      ${p.kind === 'ONU' ? `<div class="pp-row"><span>C/D 고객</span><span>${fmt(p.cd_cnt)}</span></div>` : ''}
      <div class="pp-row"><span>조직</span><span>${esc(p.team)} › ${esc(p.post)}</span></div>
      <div class="pp-act">${p.requested ? '<span class="badge badge-good">점검 요청 발송됨</span>'
        : `<button class="btn btn-sm ${p.status === 'bad' ? 'btn-primary' : ''}" onclick="window.mapInspect(${jsArg(p.id)})">점검 요청하겠습니까?</button>`}</div>`;
  }
  window.mapInspect = async function (id) {
    const p = (S.mapData.points || []).find((x) => x.id === id); if (!p) return;
    const ok = await confirmModal('점검 요청하겠습니까?', `<b>${esc(p.tid)}</b> (${esc(p.kind)} · ${esc(p.post)} 파트)<ul><li>상태: ${p.status === 'bad' ? '불량 · ' + esc(p.symptom) : '양호'}</li><li>점검 요청 Ticket(작업지시서)이 FMS로 연계되어 담당 Post에 할당됩니다.</li><li>조치 완료 후 D+3 CEI 전후 비교로 효과를 검증합니다.</li></ul>`, '점검 요청 발송');
    if (!ok) return;
    const r = await api('/inspect-request', { method: 'POST', body: JSON.stringify({ target_id: id, kind: '지도 점검 요청 · ' + (p.symptom || '상태 확인') }) });
    if (r.ok) { p.requested = true; toast(`점검 요청 발송 · Ticket ${esc(r.ticket.ticket_no)}`, 'good'); S.map.closePopup(); window.mapRefresh(); }
  };

  // ── 부팅 ─────────────────────────────────────────────────────
  (async function boot() {
    S.boot = await api('/bootstrap');
    if (!S.boot || !S.boot.orgs) return;
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('demo.org') || 'null'); } catch (e) {}
    if (saved) { S.team = saved.team || ''; S.post = saved.post || ''; }
    else { S.team = S.boot.my_org.team || ''; S.post = S.boot.my_org.post || ''; }
    fillOrgSelects();
    icons();
    route();
  })();
})();
