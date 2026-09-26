(function () {
  const scriptUrl = document.currentScript.src;
  const appUrl = new URL('./', scriptUrl);
  const overviewUrl = new URL('../index.html', scriptUrl);
  const apiBase = window.__C_ONE_MOCK_BASE__ || appUrl.pathname.replace(/\/$/, '');
  window.__C_ONE_CONFIG__ = { basePath: apiBase, mapTiles: { mode: 'osm' } };
  const nativeFetch = window.fetch.bind(window);
  const fixturePromise = nativeFetch(new URL('fixture.json', scriptUrl)).then(response => {
    if (!response.ok) throw new Error('샘플 데이터를 불러오지 못했습니다.');
    return response.json();
  });
  const state = { batches: [], tickets: [], sequence: 1001 };
  const clone = value => structuredClone(value);
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  const scopeFor = (fixture, params) => {
    const team = params.get('team') || '';
    const post = params.get('post') || '';
    return fixture.scopes[`${team}|${post}`] || fixture.scopes[`${team}|`] || fixture.scopes['|'];
  };
  const actionRows = fixture => fixture.scopes['|'].actionTargets.items;
  const allDevices = fixture => Object.values(fixture.scopes['|'].symptoms).flatMap(group => group.devices);
  const ticketFor = id => state.tickets.find(item => item.target_id === id || item.equip_id === id || item.tid === id);
  const sampleReport = (fixture, params) => {
    const team = params.get('hns_team') || '';
    const post = params.get('hns_post') || '';
    const query = (params.get('search') || '').toLowerCase();
    const devices = allDevices(fixture).filter(item => (!team || item.team === team) && (!post || item.post === post));
    const history = devices.flatMap(device => (device.work_history || []).slice(0, 1).map((work, index) => ({ device, work, index }))).slice(0, 30);
    const filtered = history.filter(({ device, work }) => `${device.tid} ${work.oper_nm}`.toLowerCase().includes(query));
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.max(1, Number(params.get('page_size') || 20));
    const days = ['D-1', 'D-Day', 'D+1', 'D+2', 'D+3', 'D+4', 'D+5'];
    const provenance = { lcl_div: 'derived', mcl_div: 'derived', info_cntr_mkt_div_org_nm: 'derived', equip_set_sol_team_org_nm: 'derived', hns_team: 'derived', hns_post: 'derived' };
    const records = filtered.slice((page - 1) * pageSize, page * pageSize).map(({ device, work, index }) => {
      const before = device.cei;
      const after = work.cei_after ?? Math.min(95, before + 5);
      const timeline = Object.fromEntries(['-1', '0', '1', '2', '3', '4', '5'].map((key, offset) => [key, {
        date: `2026-09-${String(17 + offset).padStart(2, '0')}`,
        measurement_status: 'MEASURED', cei: offset < 2 ? before : after,
        bad_cnt: offset < 2 ? device.cd_cnt : Math.max(0, device.cd_cnt - 2),
        svc_cnt: device.cd_cnt + 20, score_sum: (offset < 2 ? before : after) * (device.cd_cnt + 20),
        measure_cnt: device.cd_cnt + 20,
      }]));
      return { work_item_key: `SAMPLE-${device.tid}-${index}`, work_id: null, work_equip_cnt: 1,
        equip_mgmt_num: device.tid, equip_level: device.segment, level_status: 'RESOLVED', tid: device.tid,
        work_dt: work.dt, info_cntr_mkt_div_org_nm: device.team, equip_set_sol_team_org_nm: device.team,
        hns_team: device.team, hns_post: device.post, team: device.team, post: device.post,
        lcl_div: '품질 개선', mcl_div: '장비 점검', oper_brief_ctt: work.oper_nm,
        oper_nm: work.oper_nm, worker: work.worker || '시연 담당자', cei_d0: before, cei_d5: after,
        cei_change_d1_d5: Math.round((after - before) * 10) / 10, bad_cnt_diff: -2,
        provenance, timeline };
    });
    const total = filtered.length;
    const timelineValues = (base, step = 0) => Object.fromEntries(days.map((day, index) => [day, base + index * step]));
    const category = { name: '총계', total_svc_cnt: timelineValues(total * 25), bad_svc_cnt: timelineValues(total * 4, -1),
      bad_svc_diff_d1: timelineValues(0, -1), work_equip_cnt: timelineValues(total), measured_equip_cnt: timelineValues(total),
      cei_score_sum: timelineValues(total * 25 * 75), cei_measure_cnt: timelineValues(total * 25), cei_avg: timelineValues(75, 1.1) };
    const teams = fixture.bootstrap.orgs.map(org => org.team);
    return { ok: true, data_status: 'demo', data_source: 'demo_fixture', request_base_dt: '20260918',
      quality_base_dt: '20260918', work_from: '2026-09-01', work_to: '2026-09-18', period: params.get('period') || 'month',
      provenance_summary: {}, filter_options: { info_cntr_mkt_div_org_nm: teams, equip_set_sol_team_org_nm: teams,
        hns_team: teams, hns_post: fixture.bootstrap.orgs.flatMap(org => org.posts), lcl_div: ['품질 개선'], mcl_div: ['장비 점검'] },
      summary: { work_target_equip_cnt: total, unique_equip_cnt: total, timeline: { days, categories: [category] },
        team_equip_matrix: { teams, rows: [{ lcl: '품질 개선', mcl: '장비 점검', counts: Object.fromEntries(teams.map(name => [name, history.filter(row => row.device.team === name).length])) }],
          total: Object.fromEntries(teams.map(name => [name, history.filter(row => row.device.team === name).length])) } },
      pagination: { page, page_size: pageSize, total_count: total, total_pages: Math.ceil(total / pageSize) }, detail_records: records };
  };

  async function handleDemo(fixture, path, params, options) {
    const scope = scopeFor(fixture, params);
    const body = options.body ? JSON.parse(options.body) : {};
    if (path === '/bootstrap') return fixture.bootstrap;
    if (path === '/overview') return { ...clone(scope.overview), works: { base_dt: fixture.bootstrap.base_dt, shown_dt: fixture.bootstrap.base_dt, items: [], note: '시연용 샘플 데이터' } };
    if (path === '/action-targets') {
      const data = clone(scope.actionTargets);
      for (const item of data.items) {
        const ticket = ticketFor(item.target_id) || ticketFor(item.id) || ticketFor(item.tid);
        if (ticket) {
          item.status = '발행 완료';
          item.status_code = 'ISSUED';
          item.ticket_info = { ticket_no: ticket.ticket_no, requested_at: ticket.created_at };
        }
      }
      return data;
    }
    if (path.startsWith('/symptom/')) {
      const rule = decodeURIComponent(path.slice('/symptom/'.length));
      if (rule === 'LOSS') {
        const devices = ['OLT_LOSS', 'ONU_LOSS'].flatMap(id => scope.symptoms[id]?.devices || []);
        return { rule: scope.symptoms.OLT_LOSS?.rule, org: { team: params.get('team') || '', post: params.get('post') || '' }, devices };
      }
      return clone(scope.symptoms[rule] || { rule: null, devices: [], org: {} });
    }
    if (path.startsWith('/device/')) {
      const id = decodeURIComponent(path.slice('/device/'.length));
      const device = allDevices(fixture).find(item => item.id === id || item.tid === id);
      return { device: device || null, rule: fixture.bootstrap.rules.find(item => item.id === device?.rule_id) || null };
    }
    if (path === '/map') {
      const data = clone(scope.map);
      const focus = params.get('focus');
      if (focus) data.focus = data.points.find(item => item.id === focus || item.tid === focus) || null;
      for (const point of data.points) {
        const ticket = ticketFor(point.id);
        if (ticket) {
          point.requested = true;
          point.ticket_no = ticket.ticket_no;
          point.requested_at = ticket.created_at;
        }
      }
      return data;
    }
    if (path === '/inspect-request') {
      if (!body.target_id) return { ok: false, error: '대상을 선택해 주세요.' };
      const existing = ticketFor(body.target_id);
      if (existing) return { ok: true, issued: 0, duplicated: 1, ticket: existing };
      const ticket = { target_id: body.target_id, kind: body.kind || '점검 요청', ticket_no: `SAMPLE-${state.sequence++}`, created_at: '시연 화면', status: '발행' };
      state.tickets.push(ticket);
      return { ok: true, issued: 1, duplicated: 0, ticket };
    }
    if (path === '/autoreset/candidates') return clone(scope.candidates);
    if (path === '/autoreset/batches') return { batches: clone(state.batches) };
    if (path === '/autoreset/latest') return { batch: clone(state.batches.at(-1) || null) };
    if (path === '/autoreset/transfer') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return { ok: false, error: '예약 대상을 선택해 주세요.' };
      const candidates = fixture.scopes['|'].candidates.items;
      const items = ids.map(id => {
        const source = candidates.find(item => item.id === id) || {};
        return { id, tid: source.tid || id, port: source.port || null, team: source.team || '', post: source.post || '', status: '실행 대기', symptom: source.symptom || '속도 MisMatch', action: '포트 원격 리셋', ticket_status: '해당 없음' };
      });
      const batch = { batch_id: `SAMPLE-${state.sequence++}`, scheduled: '시연 예약', created_at: '시연 화면', by: '시연 사용자', status: 'RESERVED', items, summary: { count: items.length, run: 0, hold: items.length, ok: 0, recur: 0 } };
      state.batches.push(batch);
      return { ok: true, batch: clone(batch) };
    }
    if (path === '/autoreset/cancel') {
      const batch = state.batches.find(item => item.batch_id === body.batch_id);
      if (!batch) return { ok: false, error: '예약을 찾을 수 없습니다.' };
      const ids = new Set(body.ids || []);
      for (const item of batch.items) if (body.cancel_all || ids.has(item.id)) item.status = '취소';
      if (batch.items.every(item => item.status === '취소')) batch.status = 'CANCELED';
      batch.summary.hold = batch.items.filter(item => item.status === '실행 대기').length;
      return { ok: true, canceled_batch_id: batch.batch_id, remaining: batch.summary.hold, remaining_items: batch.summary.hold };
    }
    if (path === '/autoreset/execute') {
      const batch = state.batches.find(item => item.batch_id === body.batch_id);
      if (!batch) return { ok: false, error: '예약을 찾을 수 없습니다.' };
      batch.status = 'COMPLETED';
      batch.execution_type = 'DEMO';
      batch.finished_at = '시연 화면';
      for (const item of batch.items) if (item.status !== '취소') item.status = '정상화';
      batch.summary.run = batch.items.filter(item => item.status === '정상화').length;
      batch.summary.ok = batch.summary.run;
      batch.summary.hold = 0;
      return { ok: true, batch: clone(batch) };
    }
    if (path === '/autoreset/results') {
      const tried = state.batches.reduce((n, batch) => n + batch.summary.run, 0);
      return { days: Number(params.get('days') || 30), kpi: { tried, ok: tried, recur: 0, rate: tried ? 100 : 0 }, items: clone(state.batches.flatMap(batch => batch.items)) };
    }
    return { ok: false, error: '이 화면의 서버 기능은 시연 데이터로 제공되지 않습니다.' };
  }

  async function handleApi(fixture, path, params, options) {
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
    const orgs = fixture.bootstrap.orgs;
    if (path === '/auth/org-options') {
      const teams = orgs.map(org => org.team);
      return { hqs: [], teams, skb_teams: teams, hns_teams: teams, regions: Object.fromEntries(teams.map(team => [team, []])), companies: ['SKB', 'HNS'], roles: ['매니저', '팀장', '임원'] };
    }
    if (path === '/auth/login') return { ok: Boolean(body.email && body.password), user: fixture.bootstrap.user, error: '아이디와 비밀번호를 입력해 주세요. 실제 인증은 수행하지 않습니다.' };
    if (path === '/auth/signup') return { ok: true, user: fixture.bootstrap.user, sample: true };
    if (path === '/auth/me') return { user: fixture.bootstrap.user };
    if (path === '/auth/logout') return { ok: true };
    if (path === '/auth/admin-users') return { ok: true, users: [{ name: '시연 사용자', emp_id: '0000', email: 'demo@example.invalid', phone: '', company: 'SKB', team: '', role: '매니저', created_at: '2026-09-18', last_login_at: '', login_count: 1, is_admin: true }] };
    if (path === '/auth/admin-activity') return { ok: true, activity: [] };
    if (path === '/auth/admin-user') return { ok: true, users: (params.get('name') || '').includes('시연') ? [{ name: '시연 사용자', email: 'demo@example.invalid', phone: '', hq: '', team: '', regions: [], created_at: '2026-09-18', last_login_at: '', is_admin: true }] : [] };
    if (path === '/auth/admin-view-as' || path === '/auth/admin-view-reset') return { ok: true, sample: true };
    if (path === '/auth/change-password') return { ok: false, error: '샘플 화면에서는 비밀번호가 변경되지 않습니다.' };
    if (path === '/eqp/filters') return { teams: orgs.map(org => org.team), team_posts: Object.fromEntries(orgs.map(org => [org.team, org.posts])) };
    if (path === '/eqp/ar-detail') return { items: [] };
    if (path === '/buildings-data') return fixture.scopes['|'].map.points.filter(item => item.kind === 'OLT').slice(0, 12).map((item, index) => ({ bld_cd: `SAMPLE-${index + 1}`, bld_nm: `${item.post} 시연 건물`, lat: item.lat, lng: item.lng, team: item.team, post: item.post, cei: item.cei }));
    if (path === '/eqp/workitems' && (options.method || 'GET').toUpperCase() === 'POST') {
      const targets = body.targets || [];
      let issued = 0;
      let duplicated = 0;
      for (const target of targets) {
        const id = target.equip_id || target.tid;
        if (ticketFor(id)) { duplicated++; continue; }
        state.tickets.push({ id: state.sequence, equip_id: id, tid: target.tid || id, target_id: id, ticket_no: `SAMPLE-${state.sequence++}`, created_at: '시연 화면', status: 'ISSUED', status_code: 'ISSUED' });
        issued++;
      }
      return { ok: true, issued, duplicated, items: clone(state.tickets) };
    }
    if (path === '/eqp/workitems') return { ok: true, items: clone(state.tickets) };
    if (path.startsWith('/workitems/')) return { ok: true, items: clone(state.tickets), events: [] };
    if (path === '/top30/list') {
      const devices = allDevices(fixture).slice(0, 30);
      const items = devices.map((item, index) => ({ bld_cd: `SAMPLE-${String(index + 1).padStart(3, '0')}`, bld_nm: `${item.post} 품질 점검 건물 ${index + 1}`, rank: index + 1, team_rank: index + 1, team: item.team, part: item.post, media: 'FTTH', equip_cnt: 1, svc_cnt_ref: item.cd_cnt + 20, cei: item.cei, matched: true, bad_rate: 12 }));
      const linkedDevices = devices.map((item, index) => ({ ...item, bld_cd: items[index].bld_cd, bld_nm: items[index].bld_nm }));
      return { items, devices: linkedDevices, teams: orgs.map(org => org.team), medias: ['FTTH'], ready: true, base_dt: fixture.bootstrap.base_dt, meta: { filename: '시연 목록' } };
    }
    if (path === '/top30/detail') {
      const listing = await handleApi(fixture, '/top30/list', params, {});
      return { building: listing.items.find(item => item.bld_cd === params.get('bld_cd')) || listing.items[0], equips: [], works: [], history: [], base_dt: fixture.bootstrap.base_dt };
    }
    if (path === '/work/report/hns-summary') return sampleReport(fixture, params);
    if (path === '/action-categories') return { categories: [] };
    return { ok: false, error: '이 서버 기능은 정적 목업에서 제공되지 않습니다.' };
  }

  window.fetch = async function (input, options = {}) {
    const target = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (target.origin !== location.origin || !target.pathname.startsWith(apiBase + '/')) return nativeFetch(input, options);
    const demoIndex = target.pathname.indexOf('/demo/api/', apiBase.length);
    const apiIndex = target.pathname.indexOf('/api/', apiBase.length);
    if (demoIndex < 0 && apiIndex < 0) return nativeFetch(input, options);
    try {
      const fixture = await fixturePromise;
      const path = demoIndex >= 0 ? target.pathname.slice(demoIndex + '/demo/api'.length) : target.pathname.slice(apiIndex + '/api'.length);
      const result = demoIndex >= 0
        ? await handleDemo(fixture, path, target.searchParams, options)
        : await handleApi(fixture, path, target.searchParams, options);
      return json(result, result?.ok === false && result?.error ? 400 : 200);
    } catch (error) {
      return json({ ok: false, error: error?.message || '샘플 데이터를 불러오지 못했습니다.' }, 500);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.id = 'skb-demo-bar';
    bar.innerHTML = '<span>샘플 화면 · 입력·발행·예약 결과는 실제 저장 또는 처리되지 않습니다.</span>';
    const back = document.createElement('a');
    back.href = overviewUrl.href;
    back.textContent = '프로젝트 설명으로 돌아가기';
    bar.append(back);
    document.body.prepend(bar);
  });
})();
