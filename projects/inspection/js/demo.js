/**
 * 비산배출시설 정기점검 관리시스템 고도화 - 인터랙티브 데모 & 케이스스터디 로직
 */
(function() {
    // 1. 상태 관리
    const state = {
        currentFeature: 'calc', // 'calc', 'docs', 'tech', 'history'
        techPanelVisible: true,
        userRole: 'HQ', // 'HQ', 'METRO', 'YEONGNAM'
        calc: {
            sector: '1', // 1, 2, 3, 4
            facilityCount: 25,
            wage: 298420,
            baseCost: 0.5
        },
        docs: {
            items: [
                { id: 1, title: '비산배출시설 시설관리기준 준수 보고서 (서식 제1호)', type: 'required', typeText: '필수', checked: true, note: '정기점검 대상 사업장 필수 공통 서류' },
                { id: 2, title: '시설별 운영기록부 및 자체점검일지 (최근 1개년)', type: 'required', typeText: '필수', checked: true, note: '관리대상물질 취급 일지 및 자체 점검 기록' },
                { id: 3, title: '냉각탑 및 열교환기 VOCs 모니터링 측정 성적서', type: 'conditional', typeText: '조건부', checked: false, note: '냉각탑 또는 열교환시설 보유 시 필수' },
                { id: 4, title: '비산배출 저감시설(RTO/흡착탑 등) 자가측정 기록부', type: 'conditional', typeText: '조건부', checked: true, note: '방지시설 운영 사업장 한정' },
                { id: 5, title: '비산누출검지(LDAR) 모니터링 이력 데이터 (.xlsx)', type: 'recommended', typeText: '권장', checked: false, note: '포인트별 누출 농도 측정 원본 데이터' },
                { id: 6, title: '시설 개선 및 자발적 저감 조치 계획서', type: 'optional', typeText: '선택', checked: false, note: '기술지원 가점 및 행정 처분 경감 자료' }
            ]
        },
        history: {
            year: 'ALL',
            status: 'ALL',
            keyword: '',
            data: [
                { id: '2026-081', workplace: '(주)에코케미칼 여수공장', region: '호남', hqCode: 'HONAM', year: 2026, date: '2026-08-14', facilities: 32, fee: 3850000, result: '적합', status: '점검완료' },
                { id: '2026-079', workplace: '대양석유화학(주) 인천공장', region: '수도권', hqCode: 'METRO', year: 2026, date: '2026-08-10', facilities: 48, fee: 5240000, result: '미준수(2건)', status: '점검완료' },
                { id: '2026-075', workplace: '(주)삼진도장 안산사업장', region: '수도권', hqCode: 'METRO', year: 2026, date: '2026-07-28', facilities: 12, fee: 1820000, result: '적합', status: '점검완료' },
                { id: '2026-068', workplace: '영남에너지 울산1공장', region: '영남', hqCode: 'YEONGNAM', year: 2026, date: '2026-07-15', facilities: 64, fee: 6890000, result: '적합', status: '수수료납부' },
                { id: '2026-052', workplace: '한국특수정밀 구미공장', region: '영남', hqCode: 'YEONGNAM', year: 2026, date: '2026-06-20', facilities: 28, fee: 3410000, result: '미준수(1건)', status: '점검완료' },
                { id: '2026-041', workplace: '(주)경인합섬 평택공장', region: '수도권', hqCode: 'METRO', year: 2026, date: '2026-05-18', facilities: 20, fee: 2650000, result: '적합', status: '점검완료' },
                { id: '2025-142', workplace: '(주)에코케미칼 여수공장', region: '호남', hqCode: 'HONAM', year: 2025, date: '2025-09-12', facilities: 30, fee: 3620000, result: '적합', status: '점검완료' },
                { id: '2025-118', workplace: '대양석유화학(주) 인천공장', region: '수도권', hqCode: 'METRO', year: 2025, date: '2025-07-22', facilities: 45, fee: 4980000, result: '적합', status: '점검완료' },
                { id: '2025-095', workplace: '동해화학 포항공장', region: '영남', hqCode: 'YEONGNAM', year: 2025, date: '2025-06-11', facilities: 52, fee: 5720000, result: '적합', status: '점검완료' },
                { id: '2024-110', workplace: '(주)삼진도장 안산사업장', region: '수도권', hqCode: 'METRO', year: 2024, date: '2024-08-05', facilities: 10, fee: 1650000, result: '적합', status: '점검완료' },
                { id: '2024-084', workplace: '영남에너지 울산1공장', region: '영남', hqCode: 'YEONGNAM', year: 2024, date: '2024-06-18', facilities: 60, fee: 6200000, result: '적합', status: '점검완료' }
            ]
        }
    };

    // 2. 포맷터
    function formatNumber(num) {
        return new Intl.NumberFormat('ko-KR').format(Math.round(num || 0));
    }

    function showToast(msg) {
        let toast = document.getElementById('pfToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pfToast';
            toast.className = 'pf-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // 3. 기능 전환 (Tab Switching)
    window.switchFeature = function(featureKey) {
        state.currentFeature = featureKey;
        
        // 상단 바 버튼 활성화
        document.querySelectorAll('.pf-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.feature === featureKey);
        });

        // KECO 시스템 내부 네비게이션 동기화
        document.querySelectorAll('.keco-nav-item').forEach(item => {
            item.classList.toggle('on', item.dataset.feature === featureKey);
        });

        // 본문 섹션 표시 전환
        document.querySelectorAll('.demo-feature-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === `feature-${featureKey}`);
        });

        // 서브 타이틀 변경
        const titleMap = {
            calc: '셀프 수수료 계산',
            docs: '정기점검 제출서류 안내',
            tech: '기술지원 등록 및 신청',
            history: '정기점검 수행실적 통합 이력 관리'
        };
        const titleEl = document.getElementById('dynamicSubTitle');
        if (titleEl) titleEl.innerText = titleMap[featureKey];

        // LNB 브레드크럼 업데이트
        const crumbEl = document.getElementById('dynamicBreadcrumb');
        if (crumbEl) crumbEl.innerText = titleMap[featureKey];

        // 기술 설명 패널 내용 업데이트
        updateTechDrawer();

        // 윈도우 스크롤 부드럽게 조정
        window.scrollTo({ top: 120, behavior: 'smooth' });
    };

    // 4. 기술 설명 패널 내용 업데이트
    function updateTechDrawer() {
        const descriptions = {
            calc: {
                title: '수수료 산정 엔진 분리 및 정밀 계산 (SFR-001-01)',
                desc: '정기점검 수수료는 엔지니어링 표준노임단가 변동과 업종별·시설규모별 공량 공식이 복합 적용됩니다. 하드코딩을 배제하고 비즈니스 룰을 서비스 레이어에 모듈화했습니다.',
                points: [
                    'Strategy Pattern 기반 업종별 공량 산정 알고리즘 분리 (신규 업종 추가 시 기존 코드 무수정 OCP 준수)',
                    '부동소수점 오차 방지를 위해 BigDecimal 정밀 연산 및 천원 단위 절사 규칙 적용',
                    '3개년 과거 산정 이력과 차기 시뮬레이션 데이터 간의 실시간 증감율 Delta 엔진 구현'
                ],
                tags: ['Strategy Pattern', 'BigDecimal Math', 'Business Logic Decoupling', 'Dynamic Formula'],
                code: `@Service\npublic class InspectionFeeServiceImpl implements InspectionFeeService {\n    // 업종별 공량 계산 전략 주입\n    public FeeResult calculateFee(FeeCalcRequest req) {\n        BigDecimal baseCost = req.getSector().getBaseWorkday();\n        BigDecimal varCost  = req.getSector().calcVariable(req.getFacilityCount());\n        BigDecimal totalDay = baseCost.add(varCost);\n        \n        // 노임단가 및 제경비/기술료 연산 (법정 보정계수 0.65)\n        BigDecimal labor = totalDay.multiply(req.getUnitWage());\n        BigDecimal expenses = labor.multiply(new BigDecimal("0.2"));\n        BigDecimal otherCost = labor.multiply(new BigDecimal("1.1"));\n        BigDecimal techFee = labor.add(otherCost).multiply(new BigDecimal("0.2"));\n        \n        BigDecimal sum = labor.add(expenses).add(otherCost).add(techFee)\n                              .multiply(new BigDecimal("0.65"));\n        return new FeeResult(totalDay, floorToThousand(sum));\n    }\n}`
            },
            docs: {
                title: '시설 특성 기반 맞춤형 제출서류 매핑 및 무결성 (SFR-001-02)',
                desc: '수수료 산정 시 확정된 시설 규모와 사업장 업종 코드에 맞춰 「비산배출 시설관리기준」 필수/조건부 서류를 자동 매핑하고 점검 준비 누락을 사전 방지합니다.',
                points: [
                    '시설 유형 코드와 법정 제출서류 간 다대다(N:M) 매핑 메타데이터 모델링',
                    '사용자 작성 중 이탈 방지를 위한 브라우저 로컬 캐시 및 상태 동기화 처리',
                    '서류 누락률 감소를 통한 정기점검 접수 반려율 대폭 개선'
                ],
                tags: ['Data Modeling', 'Criteria Query', 'Compliance Automation', 'Client Storage'],
                code: `<!-- MyBatis Dynamic Document Mapping -->\n<select id="selectRequiredDocuments" resultMap="DocumentGuideMap">\n    SELECT D.DOC_ID, D.DOC_NAME, D.REQ_TYPE, D.LEGAL_BASIS\n    FROM TB_FACILITY_DOC_MAP M\n    JOIN TB_DOCUMENT_MASTER D ON M.DOC_ID = D.DOC_ID\n    WHERE M.SECTOR_CODE = #{sectorCode}\n      AND (M.MIN_FACILITY_CNT <= #{facilityCount} OR M.MIN_FACILITY_CNT IS NULL)\n    ORDER BY D.SORT_ORDER ASC\n</select>`
            },
            tech: {
                title: '점검 미준수 항목 기반 원클릭 기술지원 연계 (SFR-001-03)',
                desc: '정기점검 결과 불합격/미준수 판정을 받은 사업장에게 적합한 기술지원 프로그램을 자동 추천하고, 공단 내부 담당자에게 원클릭으로 접수되는 파이프라인을 구축했습니다.',
                points: [
                    '점검 결과 위반 코드(Fault Code)와 기술지원 솔루션 간 추천 매핑 로직',
                    '원클릭 신청 트랜잭션(@Transactional) 처리 및 중복 신청 방지 멱등성 보장',
                    '관할 환경본부 기술지원 담당자 자동 할당 및 알림 연동 인터페이스'
                ],
                tags: ['Recommendation Rule', 'Idempotency', 'Spring @Transactional', 'Workflow Integration'],
                code: `@Transactional\npublic String applyTechSupport(TechSupportForm form) {\n    // 1. 중복 신청 방지 검증 (동일 연도/점검건)\n    if (supportDao.existsActiveApplication(form.getRcptNo())) {\n        throw new DuplicateApplicationException("이미 접수된 기술지원 건이 존재합니다.");\n    }\n    // 2. 접수번호 시퀀스 채번 (TECH-YYYYMM-SEQ)\n    String newSeq = sequenceDao.getNextTechSupportId();\n    form.setSupportId(newSeq);\n    \n    // 3. 신청 등록 및 관할 본부 담당자 배정 이벤트 발행\n    supportDao.insertApplication(form);\n    eventPublisher.publishEvent(new TechSupportRegisteredEvent(newSeq));\n    return newSeq;\n}`
            },
            history: {
                title: '조직별 데이터 스코프 격리 & 대용량 엑셀 스트리밍 (SFR-002-01~03)',
                desc: '본사 총괄 관리자는 전국 사업장을, 지역 환경본부는 관할 구역 사업장만 조회할 수 있도록 권한을 격리하고, 수만 건의 이력 엑셀 다운로드 시 OOM을 방지했습니다.',
                points: [
                    'AOP & Interceptor 기반 본사(HQ) vs 환경본부(Regional) Data Scope 강제 주입',
                    '복합 검색 조건(연도, 상태, 사업장) MyBatis Dynamic SQL 및 복합 인덱스 설계',
                    'Apache POI SXSSF 기반 디스크 임시 플러시로 대용량 엑셀 힙 메모리 스파이크 차단'
                ],
                tags: ['RBAC Data Scope', 'MyBatis Dynamic SQL', 'SXSSF Streaming', 'OOM Prevention'],
                code: `// AOP 기반 데이터 스코프 주입\n@Around("@annotation(EnforceDataScope)")\npublic Object applyScope(ProceedingJoinPoint pjp) throws Throwable {\n    UserSession user = SessionContext.getUser();\n    BaseSearchVO vo = (BaseSearchVO) pjp.getArgs()[0];\n    \n    if (!user.isHeadquarters()) {\n        // 본사가 아니면 소속 환경본부 코드로 검색 조건 강제 오버라이드\n        vo.setScopedHqCode(user.getDepartmentCode());\n    }\n    return pjp.proceed();\n}`
            }
        };

        const cur = descriptions[state.currentFeature];
        const panel = document.getElementById('pfTechPanel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="pf-tech-container">
                <div class="pf-tech-grid">
                    <div class="pf-tech-card">
                        <h4>💡 ${cur.title}</h4>
                        <p>${cur.desc}</p>
                        <ul class="pf-tech-points">
                            ${cur.points.map(p => `<li>${p}</li>`).join('')}
                        </ul>
                        <div class="pf-tech-tag-group">
                            ${cur.tags.map(t => `<span class="pf-tech-tag">${t}</span>`).join('')}
                        </div>
                    </div>
                    <div class="pf-tech-card">
                        <h4>⚙️ 핵심 구현 아키텍처 스니펫</h4>
                        <pre class="pf-code-block"><code>${escapeHtml(cur.code)}</code></pre>
                    </div>
                </div>
            </div>
        `;
    }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // 5. 기능 1: 수수료 계산 로직
    window.updateCalc = function() {
        const sector = state.calc.sector;
        const count = Math.max(1, parseInt(document.getElementById('calcFacilityInput')?.value || 25, 10));
        state.calc.facilityCount = count;

        // 업종별 공량 공식
        let unitRatio = 0.08;
        let sectorTitle = 'Ⅰ업종 (석유정제 등)';
        if (sector === '2') { unitRatio = 0.06; sectorTitle = 'Ⅱ업종 (기초화학 등)'; }
        if (sector === '3') { unitRatio = 0.05; sectorTitle = 'Ⅲ업종 (철강/제조 등)'; }
        if (sector === '4') { unitRatio = 0.04; sectorTitle = 'Ⅳ업종 (도장시설 등)'; }

        const baseWorkday = 0.5;
        const facilityWorkday = +(count * unitRatio).toFixed(2);
        const totalWorkday = +(baseWorkday + facilityWorkday).toFixed(2);

        const unitWage = state.calc.wage; // 298,420
        const laborCosts = Math.round(totalWorkday * unitWage);
        const expenses = Math.round(laborCosts * 0.2);
        const otherCost = Math.round(laborCosts * 1.1);
        const techFee = Math.round((laborCosts + otherCost) * 0.2);
        const subTotal = laborCosts + expenses + otherCost + techFee;
        // 보정계수 0.65 및 천원단위 절사
        const costTotal = Math.floor((subTotal * 0.65) / 1000) * 1000;
        const vat = Math.round(costTotal * 0.1);
        const grandTotal = costTotal + vat;

        // 과거 3년 전 비교값 시뮬레이션
        const pastGrandTotal = 3120000;
        const diff = grandTotal - pastGrandTotal;
        const diffPercent = ((diff / pastGrandTotal) * 100).toFixed(1);

        // UI 업데이트
        setHtml('calcSectorName', sectorTitle);
        setHtml('calcWorkdayDisplay', `${totalWorkday} 일`);
        setHtml('calcBaseDay', `${baseWorkday} 일`);
        setHtml('calcVarDay', `${facilityWorkday} 일 (${count}개 × ${unitRatio})`);
        setHtml('calcUnitWageDisplay', `${formatNumber(unitWage)} 원`);
        setHtml('calcLaborCosts', `${formatNumber(laborCosts)} 원`);
        setHtml('calcExpenses', `${formatNumber(expenses)} 원`);
        setHtml('calcOtherCost', `${formatNumber(otherCost)} 원`);
        setHtml('calcTechFee', `${formatNumber(techFee)} 원`);
        setHtml('calcCostTotal', `${formatNumber(costTotal)} 원`);
        setHtml('calcVat', `${formatNumber(vat)} 원`);
        setHtml('calcGrandTotal', `${formatNumber(grandTotal)} 원`);

        // 비교 테이블
        setHtml('calcComparePast', `${formatNumber(pastGrandTotal)} 원`);
        setHtml('calcCompareNext', `${formatNumber(grandTotal)} 원`);
        const diffEl = document.getElementById('calcCompareDiff');
        if (diffEl) {
            const isPlus = diff >= 0;
            diffEl.innerHTML = `<span style="color: ${isPlus ? '#e11d48' : '#2563eb'}; font-weight: bold;">
                ${isPlus ? '▲ +' : '▼ '}${formatNumber(diff)} 원 (${isPlus ? '+' : ''}${diffPercent}%)
            </span>`;
        }
    };

    window.changeCalcSector = function(sectorVal) {
        state.calc.sector = String(sectorVal);
        document.querySelectorAll('.calc-sector-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sector === String(sectorVal));
        });
        window.updateCalc();
    };

    window.resetCalc = function() {
        if (document.getElementById('calcFacilityInput')) {
            document.getElementById('calcFacilityInput').value = 25;
        }
        state.calc.sector = '1';
        window.changeCalcSector('1');
        showToast('계산 조건이 기본값(시설수 25개)으로 초기화되었습니다.');
    };

    // 6. 기능 2: 사전준비서류 로직
    window.toggleDocItem = function(index) {
        state.docs.items[index].checked = !state.docs.items[index].checked;
        renderDocs();
        showToast('서류 준비 현황이 브라우저 로컬 저장소에 임시저장되었습니다.');
    };

    function renderDocs() {
        const listEl = document.getElementById('docGuideList');
        if (!listEl) return;

        let checkedCount = 0;
        let html = '';

        state.docs.items.forEach((item, idx) => {
            if (item.checked) checkedCount++;
            html += `
                <li class="guide_check_item">
                    <div class="guide_check_content" onclick="toggleDocItem(${idx})">
                        <span class="guide_check_type ${item.type}">${item.typeText}</span>
                        <div>
                            <strong>${item.title}</strong>
                            <p style="margin: 4px 0 0; font-size: 13px; color: #666;">${item.note}</p>
                        </div>
                    </div>
                    <div class="guide_check_control checkbox">
                        <input type="checkbox" id="doc_check_${idx}" ${item.checked ? 'checked' : ''} onchange="toggleDocItem(${idx})">
                        <label for="doc_check_${idx}"></label>
                    </div>
                </li>
            `;
        });

        listEl.innerHTML = html;
        const total = state.docs.items.length;
        setHtml('docProgressText', `준비 완료: ${checkedCount}건 / 전체 ${total}건`);
        const percent = Math.round((checkedCount / total) * 100);
        const bar = document.getElementById('docProgressBar');
        if (bar) bar.style.width = `${percent}%`;
    }

    window.downloadAllDocs = function() {
        showToast('📁 필수 서식 압축파일 (비산배출_사전준비서식.zip) 다운로드를 시뮬레이션했습니다.');
    };

    // 7. 기능 3: 기술지원 신청 로직
    window.submitTechSupport = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        const workplace = document.getElementById('techWorkplace')?.value || '(주)에코케미칼';
        const applicant = document.getElementById('techApplicant')?.value || '홍길동';
        const contact = document.getElementById('techContact')?.value || '010-1234-5678';
        const category = document.getElementById('techCategory')?.value || '배출원 밀폐개선 기술지원';

        const randomSeq = Math.floor(1000 + Math.random() * 9000);
        const receiptNo = `TECH-2026-${randomSeq}`;

        const modal = document.getElementById('techCompleteModal');
        if (modal) {
            setHtml('modalReceiptNo', receiptNo);
            setHtml('modalWorkplace', workplace);
            setHtml('modalApplicant', `${applicant} (${contact})`);
            setHtml('modalCategory', category);
            modal.style.display = 'flex';
        }
    };

    window.closeTechModal = function() {
        const modal = document.getElementById('techCompleteModal');
        if (modal) modal.style.display = 'none';
        showToast('기술지원 신청이 정상적으로 완료되었습니다.');
    };

    // 8. 기능 4: 통합 이력 관리 로직 & 엑셀 다운로드
    window.setHistoryRole = function(role) {
        state.userRole = role;
        document.querySelectorAll('.scope-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.role === role);
        });

        const roleTextMap = {
            HQ: '본사 총괄 관리자 (전국 전수 데이터 접근 가능)',
            METRO: '수도권환경본부 담당자 (관할 구역 데이터로 자동 격리)',
            YEONGNAM: '영남환경본부 담당자 (관할 구역 데이터로 자동 격리)'
        };
        setHtml('currentRoleDescription', roleTextMap[role]);
        filterHistory();
        showToast(`🔒 [Data Scope 적용] ${roleTextMap[role]} 모드로 전환되었습니다.`);
    };

    window.filterHistory = function() {
        const year = document.getElementById('historyYearFilter')?.value || 'ALL';
        const status = document.getElementById('historyStatusFilter')?.value || 'ALL';
        const keyword = (document.getElementById('historyKeyword')?.value || '').trim().toLowerCase();

        state.history.year = year;
        state.history.status = status;
        state.history.keyword = keyword;

        let filtered = state.history.data.filter(item => {
            // 권한 격리 (Data Scope)
            if (state.userRole === 'METRO' && item.hqCode !== 'METRO') return false;
            if (state.userRole === 'YEONGNAM' && item.hqCode !== 'YEONGNAM') return false;

            // 연도 필터
            if (year !== 'ALL' && item.year !== parseInt(year, 10)) return false;

            // 상태 필터
            if (status !== 'ALL' && item.status !== status) return false;

            // 키워드 필터
            if (keyword && !item.workplace.toLowerCase().includes(keyword) && !item.id.toLowerCase().includes(keyword)) return false;

            return true;
        });

        renderHistory(filtered);
    };

    function renderHistory(list) {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="history_empty">조회 조건에 해당하는 정기점검 이력이 없습니다.</td></tr>`;
            setHtml('historyCountText', '0');
            setHtml('historyTotalFee', '0 원');
            return;
        }

        let totalFee = 0;
        let rows = '';

        list.forEach((item, idx) => {
            totalFee += item.fee;
            const isNonCompliant = item.result.includes('미준수');
            rows += `
                <tr>
                    <td>${item.id}</td>
                    <td style="text-align: left; font-weight: 600;">${item.workplace}</td>
                    <td><span class="meta-pill" style="font-size:12px;">${item.region}본부</span></td>
                    <td>${item.date}</td>
                    <td>${item.facilities} 개소</td>
                    <td style="text-align: right; font-weight: 500;">${formatNumber(item.fee)} 원</td>
                    <td><span style="color: ${isNonCompliant ? '#dc2626' : '#016241'}; font-weight: 700;">${item.result}</span></td>
                    <td><span class="btn_bg sm line" style="padding: 3px 8px; border-radius: 4px;">${item.status}</span></td>
                </tr>
            `;
        });

        tbody.innerHTML = rows;
        setHtml('historyCountText', list.length);
        setHtml('historyTotalFee', `${formatNumber(totalFee)} 원`);

        // 차트 바 업데이트
        updateHistoryChart(list);
    }

    function updateHistoryChart(list) {
        const yearCounts = { 2026: 0, 2025: 0, 2024: 0 };
        const yearFees = { 2026: 0, 2025: 0, 2024: 0 };

        list.forEach(i => {
            if (yearCounts[i.year] !== undefined) {
                yearCounts[i.year]++;
                yearFees[i.year] += i.fee;
            }
        });

        const maxCount = Math.max(1, ...Object.values(yearCounts));
        const maxFee = Math.max(1, ...Object.values(yearFees));

        [2026, 2025, 2024].forEach(y => {
            const countBar = document.getElementById(`chartCountBar_${y}`);
            const countVal = document.getElementById(`chartCountVal_${y}`);
            if (countBar) countBar.style.width = `${Math.round((yearCounts[y] / maxCount) * 100)}%`;
            if (countVal) countVal.innerText = `${yearCounts[y]} 건`;

            const feeBar = document.getElementById(`chartFeeBar_${y}`);
            const feeVal = document.getElementById(`chartFeeVal_${y}`);
            if (feeBar) feeBar.style.width = `${Math.round((yearFees[y] / maxFee) * 100)}%`;
            if (feeVal) feeVal.innerText = `${formatNumber(yearFees[y])} 원`;
        });
    }

    window.downloadHistoryExcel = function() {
        if (typeof XLSX === 'undefined') {
            showToast('⚠️ SheetJS 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        const year = state.history.year;
        const role = state.userRole;

        const filtered = state.history.data.filter(item => {
            if (role === 'METRO' && item.hqCode !== 'METRO') return false;
            if (role === 'YEONGNAM' && item.hqCode !== 'YEONGNAM') return false;
            if (year !== 'ALL' && item.year !== parseInt(year, 10)) return false;
            return true;
        });

        const excelRows = filtered.map((item, idx) => ({
            '연번': idx + 1,
            '관리번호': item.id,
            '사업장명': item.workplace,
            '관할본부': `${item.region}환경본부`,
            '점검연도': item.year,
            '점검일자': item.date,
            '점검시설수': item.facilities,
            '산정수수료(원)': item.fee,
            '점검결과': item.result,
            '진행상태': item.status
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '점검수행실적이력');

        const fileName = `정기점검_통합수행실적_${role}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        showToast(`📊 엑셀 파일 [${fileName}] 다운로드가 완료되었습니다.`);
    };

    // 9. 기술 패널 토글
    window.toggleTechPanel = function() {
        state.techPanelVisible = !state.techPanelVisible;
        const panel = document.getElementById('pfTechPanel');
        const btn = document.getElementById('techToggleBtn');
        if (panel) panel.classList.toggle('show', state.techPanelVisible);
        if (btn) {
            btn.classList.toggle('active', state.techPanelVisible);
            btn.innerHTML = state.techPanelVisible ? '💡 기술 분석 숨기기' : '💡 기술 분석 보기';
        }
    };

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    // 10. 초기화
    document.addEventListener('DOMContentLoaded', () => {
        window.updateCalc();
        renderDocs();
        window.filterHistory();
        updateTechDrawer();
        const panel = document.getElementById('pfTechPanel');
        if (panel && state.techPanelVisible) panel.classList.add('show');
    });

})();
