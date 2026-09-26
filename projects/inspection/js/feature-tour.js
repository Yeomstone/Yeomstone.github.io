/* 정적 목업의 기능개선 위치를 화면 위에 안내한다. */
(function () {
    "use strict";
    if (window.inspectionFeatureTourLoaded) return;
    window.inspectionFeatureTourLoaded = true;

    var page = location.pathname.split("/").pop() || "index.html";
    var tours = {
        "feesCalBoard.html": [
            ["#boardWrap .tBoard", "과업 1 · 수수료 목록", "접수 건에서 수수료 상세로 이동해 해당 사업장의 제출서류 안내를 볼 수 있습니다."],
            ["#boardWrap .schBox", "과업 1 · 조회 조건", "환경청, 결제 여부와 사업장명으로 수수료 건을 찾습니다."],
            ["#boardWrap .tBoard tbody a", "과업 1 · 상세 진입", "사업장명을 눌러 업종별 산정내역과 제출서류 안내로 이동합니다."]
        ],
        "feesCalHistBoard.html": [
            ["#boardWrap .tBoard", "과업 1 · 납부 이력", "과거 수수료 납부 건의 상세를 열어 제출서류 안내 흐름으로 이어집니다."],
            ["#boardWrap .countText", "과업 1 · 납부 건수", "납부 이력의 조회 건수를 표시합니다."],
            ["#boardWrap .tBoard tbody a", "과업 1 · 과거 납부 상세", "사업장명을 눌러 해당 납부 건의 상세를 확인합니다."]
        ],
        "applyCharge.html": [
            ["#applayCharge .ckbox_wrap", "과업 1 · 적용 업종", "사업장에 해당하는 업종을 선택하면 업종별 산정내역 탭을 확인할 수 있습니다."],
            ["#submitDocGuideOpen", "과업 1 · 제출서류 사전안내", "수수료 상세에서 시설별 제출서류 안내 화면으로 이동하는 연결 기능입니다."],
            ["#applayCharge .tabmenu", "과업 1 · 업종별 산정내역", "선택한 업종의 산정 기준과 샘플 수수료를 탭에서 확인합니다."],
            ["#totalCharge", "과업 1 · 전체 산정 금액", "선택 업종의 공량과 노임단가를 반영한 전체 산정 영역입니다."]
        ],
        "documentGuide.html": [
            ["#documentGuide .guide_doc_group", "과업 1 · 시설별 제출서류", "시설 유형에 따라 필요한 점검 서류를 체크리스트로 안내합니다."],
            ["#saveDocumentGuideDraft", "과업 1 · 확인 상태 저장", "체크한 서류 준비 상태를 이 브라우저에 임시 저장합니다."],
            ["#documentGuide .guide_workplace", "과업 1 · 대상 사업장", "최근 수수료 납부 건의 사업장에 맞춰 서류를 안내합니다."],
            ["label[for='guideCheck_tank_1']", "과업 1 · 서류 준비 확인", "저장시설처럼 해당 시설에 필요한 서류를 항목별로 확인합니다."]
        ],
        "DocoumentGuideList.html": [
            ["#documentGuideList .schBox", "과업 1 · 안내 대상 검색", "관리자 화면에서 제출서류 사전안내 대상 사업장을 찾습니다."],
            ["#documentGuideList .tBoard", "과업 1 · 사업장별 안내 현황", "대상 사업장과 서류 안내 이력을 샘플 목록으로 확인합니다."],
            ["#documentGuideList .pagination", "과업 1 · 안내 목록 이동", "제출서류 안내 대상 목록의 페이지 이동 영역입니다."]
        ],
        "applyForm.html": [
            ["#applayForm .formbox", "과업 1 · 정기점검 신청", "사업장 정보를 입력하는 신청 화면입니다. 제출서류 사전안내 화면과 연결됩니다."],
            ["#applyFormSubmit .btn_wrap", "목업 신청 처리", "신청서 제출은 필수 첨부 검증 없이 브라우저의 샘플 완료 상태로 처리합니다."],
            ["#applyFormSubmit .formbox:first-of-type", "과업 1 · 신청인 정보", "정기점검 신청인의 기본정보를 입력합니다."],
            ["#applyFormSubmit .file_wrap", "목업 · 첨부서류", "첨부 항목은 원본대로 보이지만 목업 신청 완료에 필수는 아닙니다."]
        ],
        "applyFormResultList.html": [
            ["#boardWrap .tBoard", "과업 2 · 점검 결과 목록", "점검 결과 상세로 이동해 미준수 내용과 기술지원 신청 흐름을 볼 수 있습니다."],
            ["#boardWrap .schBox", "과업 2 · 결과 검색", "사업장과 수수료 입금 기간으로 점검 결과를 찾습니다."],
            ["#boardWrap .pagination", "과업 2 · 결과 목록 이동", "조회 결과의 페이지 이동 영역입니다."]
        ],
        "applyFormResultDetail.html": [
            [".tech_result_section", "과업 2 · 미준수 결과", "점검 결과의 보완사항을 기술지원 추천 분야와 연결합니다."],
            [".tech_onestop_agree_prompt", "과업 2 · 원클릭 기술지원", "미준수 결과에서 기술지원에 동의하면 신청 정보 입력 영역이 이어서 열립니다."],
            ["#applayForm .formbox:first-of-type", "과업 2 · 대상 사업장", "점검 결과와 기술지원 신청이 연결되는 사업장 정보를 보여줍니다."]
        ],
        "applyFormResultDetailAdmin.html": [
            ["#NCCTable", "과업 2 · 관리자 결과 입력", "관리자가 측정 결과와 보완사항을 입력하는 원본 JSP 영역입니다."],
            ["#applayForm .btn_wrap", "과업 2 · 결과서 제출", "입력한 결과를 샘플 제출 상태로 확인할 수 있습니다."],
            ["#applayForm .formbox:first-of-type", "과업 2 · 결과 대상", "관리자가 결과를 입력하는 사업장과 점검 정보를 확인합니다."]
        ],
        "applyFormTechList.html": [
            ["#boardWrap .tBoard", "과업 2 · 기술지원 신청 목록", "점검 결과에서 이어진 기술지원 신청 건을 목록으로 확인합니다."],
            ["#boardWrap .schBox", "과업 2 · 지원 신청 검색", "기술지원 신청 건을 상태·조건·사업장명으로 찾습니다."],
            ["#boardWrap .pagination", "과업 2 · 신청 목록 이동", "기술지원 신청 목록의 페이지 이동 영역입니다."]
        ],
        "selfApplyCharge.html": [
            ["#forecastTab .tb_basic", "과업 3 · 과거와 차기 비교", "과거 산정 수수료와 현재 입력 기준의 예상 수수료·증감을 비교합니다."],
            ["#mainForecastTabs li:nth-child(2)", "과업 3 · 셀프 수수료 계산", "이 탭에서 업종, 시설 수, 노임단가를 바꾸면 예측 금액에 반영됩니다."],
            ["#forecastTab .forecast_condition", "과업 3 · 예측 조건", "차기 점검의 비교 기준을 입력해 예상 수수료를 살펴봅니다."],
            ["#forecastTab .forecast_reason", "과업 3 · 변동 사유", "과거와 차기 수수료가 달라지는 이유를 입력값과 함께 설명합니다."]
        ],
        "periodicPerformanceHistory.html": [
            ["#historyManage .summary_table", "과업 4 · 수행실적 요약", "조회 사업장과 차년도 대상, 수수료 현황을 한눈에 보여줍니다."],
            ["#historyManage .tBoard", "과업 4 · 사업장 통합 이력", "사업장별 점검일·기한·상태에서 상세 이력으로 이동합니다."],
            ["#historyManage .schBox", "과업 4 · 통합 검색", "연도, 사업장 상태와 키워드로 수행실적 대상을 좁힙니다."],
            ["#historyManage #feeDepYmdSort", "과업 4 · 점검일 정렬", "마지막 정기점검일을 기준으로 사업장 목록을 정렬합니다."]
        ],
        "periodicPerformanceHistoryDetail.html": [
            ["#historyDetail .formbox", "과업 4 · 사업장 상세", "사업장 기본정보와 점검 상태를 샘플값으로 확인합니다."],
            ["#historyDetail .tBoard.history_table", "과업 4 · 정기점검 이력", "해당 사업장의 접수번호와 점검·납부·결과 이력을 연결했습니다."],
            ["#siteHistoryBody", "과업 4 · 상태 변경 이력", "전체 제외 시설과 장기 가동중지 기간을 기록하는 영역입니다."],
            ["#historyDetail .site_history_heading", "과업 4 · 제외·가동중지 기록", "전체 제외 시설과 장기 가동중지 이력을 추가하는 영역입니다."]
        ],
        "periodicPerformanceChangeHistory.html": [
            ["#boardWrap .tBoard", "과업 4 · 사용자 변경 이력", "사업장 상태와 점검 정보의 변경 기록을 시간순으로 확인합니다."],
            ["#boardWrap .history_head", "과업 4 · 이력 대상", "접수번호와 사업장명을 기준으로 변경 이력 대상을 확인합니다."],
            ["#boardWrap .btn_wrap", "과업 4 · 이력 연계", "목록과 사업장 상세를 오가며 변경 기록을 확인합니다."]
        ],
        "IntegratedInspectionHistoryManage.html": [
            ["#table", "과업 4 · CMS 통합 목록", "관리자가 사업장별 정기점검 실적과 상태를 검색·조회합니다."],
            [".history-bottom", "과업 4 · 연도별 현황", "변경 이력 연계와 연도별 사업장·수수료 현황을 함께 표시합니다."],
            ["#searchStatus", "과업 4 · 사업장 상태 검색", "CMS에서 사업장 상태를 기준으로 통합 목록을 조회합니다."],
            [".history-bottom .card", "과업 4 · 변경 정보 연계", "사업장 상태와 점검정보의 변경 이력 연계 현황을 보여줍니다."]
        ],
        "IntegratedInspectionHistoryDetail.html": [
            ["#siteSttsCd", "과업 4 · 사업장 상태 관리", "관리자가 사업장 상태를 변경하고 샘플 이력으로 저장합니다."],
            [".inspection-history-table", "과업 4 · 통합 점검 이력", "접수번호별 정기점검 결과와 상태 기간을 상세에서 확인합니다."],
            ["#siteHistoryBody", "과업 4 · 제외·가동중지 기간", "전체 제외 시설과 6개월 이상 가동중지 기간을 사업장 이력으로 관리합니다."]
        ],
        "IntegratedInspectionChangeHistory.html": [
            [".history-change-table", "과업 4 · CMS 변경 기록", "사업장·점검 정보의 변경 전후 값을 관리자가 추적하는 화면입니다."],
            [".history-readonly-card .row", "과업 4 · 변경 대상 기본정보", "접수번호·관리번호·사업장 상태를 함께 표시합니다."],
            [".history-readonly-card .card-tools", "과업 4 · 상세 연계", "통합 목록과 사업장 상세를 오가며 변경 기록을 추적합니다."]
        ]
    };

    var source = tours[page];
    if (!source) return;
    var scriptUrl = document.currentScript && document.currentScript.src;
    var style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = scriptUrl ? new URL("../css/feature-tour.css", scriptUrl).href : "./css/feature-tour.css";
    document.head.appendChild(style);

    var launcher, frame, bubble, title, body, counter, nextButton, prevButton;
    var steps = [], current = 0, timer = null, placementTimer = null, active = false;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seenKey = "inspection-feature-tour:v2:" + page;

    function findTarget(selector) {
        var target = document.querySelector(selector);
        if (!target) return null;
        var rect = target.getBoundingClientRect();
        var css = window.getComputedStyle(target);
        return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden" ? target : null;
    }
    function stopTimer() {
        clearTimeout(timer);
        clearTimeout(placementTimer);
    }
    function scheduleNext() {
        clearTimeout(timer);
        if (!active || reducedMotion) return;
        timer = setTimeout(function () {
            if (current + 1 < steps.length) showStep(current + 1);
            else closeTour();
        }, 7000);
    }
    function place() {
        if (!active || !steps[current]) return;
        var target = findTarget(steps[current][0]);
        if (!target) return;
        var rect = target.getBoundingClientRect();
        var pad = 6;
        var left = Math.max(8, rect.left - pad);
        var top = Math.max(8, rect.top - pad);
        frame.style.left = left + "px";
        frame.style.top = top + "px";
        frame.style.width = Math.max(20, Math.min(window.innerWidth - left - 8, rect.width + pad * 2)) + "px";
        frame.style.height = Math.max(20, Math.min(window.innerHeight - top - 8, rect.height + pad * 2)) + "px";
        var bubbleWidth = bubble.offsetWidth;
        var bubbleHeight = bubble.offsetHeight;
        var bubbleLeft = Math.max(12, Math.min(window.innerWidth - bubbleWidth - 12, rect.left));
        var below = rect.bottom + 18;
        var above = rect.top - bubbleHeight - 18;
        var isAbove = below + bubbleHeight > window.innerHeight - 12 && above >= 12;
        bubble.style.left = bubbleLeft + "px";
        bubble.style.top = Math.max(12, Math.min(window.innerHeight - bubbleHeight - 12, isAbove ? above : below)) + "px";
        bubble.classList.toggle("is-above", isAbove);
    }
    function showStep(index) {
        stopTimer();
        current = index;
        var step = steps[current];
        var target = findTarget(step[0]);
        if (!target) {
            if (index + 1 < steps.length) showStep(index + 1);
            else closeTour();
            return;
        }
        title.textContent = step[1];
        body.textContent = step[2];
        counter.textContent = (current + 1) + " / " + steps.length;
        prevButton.disabled = current === 0;
        nextButton.textContent = current === steps.length - 1 ? "완료" : "다음";
        bubble.classList.remove("step-enter");
        void bubble.offsetWidth;
        bubble.classList.add("step-enter");
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
        place();
        placementTimer = setTimeout(place, reducedMotion ? 0 : 360);
        scheduleNext();
    }
    function closeTour() {
        stopTimer();
        active = false;
        frame.hidden = true;
        bubble.hidden = true;
        launcher.setAttribute("aria-expanded", "false");
    }
    function openTour() {
        steps = source.filter(function (step) { return !!findTarget(step[0]); });
        if (!steps.length) return;
        active = true;
        frame.hidden = false;
        bubble.hidden = false;
        launcher.setAttribute("aria-expanded", "true");
        try { sessionStorage.setItem(seenKey, "1"); } catch (e) { /* 저장이 막혀도 안내는 표시한다. */ }
        showStep(0);
    }
    function init() {
        launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "inspection-tour-launcher";
        launcher.textContent = "기능개선 안내";
        launcher.setAttribute("aria-label", "이 화면의 기능개선 안내 보기");
        launcher.setAttribute("aria-expanded", "false");
        frame = document.createElement("div");
        frame.className = "inspection-tour-frame";
        frame.setAttribute("aria-hidden", "true");
        frame.hidden = true;
        bubble = document.createElement("section");
        bubble.className = "inspection-tour-bubble";
        bubble.setAttribute("role", "status");
        bubble.setAttribute("aria-live", "polite");
        bubble.hidden = true;
        bubble.innerHTML = '<div class="inspection-tour-top"><span class="inspection-tour-kicker">기능개선 안내</span><button class="inspection-tour-close" type="button" aria-label="설명 닫기">×</button></div><h2 class="inspection-tour-title"></h2><p class="inspection-tour-text"></p><div class="inspection-tour-actions"><span class="inspection-tour-counter"></span><div><button class="inspection-tour-prev" type="button">이전</button><button class="inspection-tour-next" type="button">다음</button></div></div>';
        document.body.appendChild(frame);
        document.body.appendChild(bubble);
        var toolsDock = document.createElement("nav");
        toolsDock.className = "inspection-tour-tools";
        toolsDock.setAttribute("aria-label", "목업 화면 안내");
        if (page !== "index.html") {
            var overviewLink = document.createElement("a");
            overviewLink.className = "inspection-tour-overview";
            overviewLink.href = scriptUrl ? new URL("../index.html", scriptUrl).href : "./index.html";
            overviewLink.textContent = "← 설명 페이지로";
            toolsDock.appendChild(overviewLink);
        }
        toolsDock.appendChild(launcher);
        document.body.appendChild(toolsDock);
        title = bubble.querySelector(".inspection-tour-title");
        body = bubble.querySelector(".inspection-tour-text");
        counter = bubble.querySelector(".inspection-tour-counter");
        prevButton = bubble.querySelector(".inspection-tour-prev");
        nextButton = bubble.querySelector(".inspection-tour-next");
        launcher.addEventListener("click", function () { if (active) closeTour(); else openTour(); });
        bubble.querySelector(".inspection-tour-close").addEventListener("click", closeTour);
        prevButton.addEventListener("click", function () { if (current > 0) showStep(current - 1); });
        nextButton.addEventListener("click", function () { if (current + 1 < steps.length) showStep(current + 1); else closeTour(); });
        bubble.addEventListener("mouseenter", stopTimer);
        bubble.addEventListener("mouseleave", scheduleNext);
        bubble.addEventListener("focusin", stopTimer);
        bubble.addEventListener("focusout", scheduleNext);
        window.addEventListener("scroll", place, { passive: true });
        window.addEventListener("resize", place);
        document.addEventListener("keydown", function (event) { if (active && event.key === "Escape") closeTour(); });
        var seen = false;
        try { seen = sessionStorage.getItem(seenKey) === "1"; } catch (e) { /* 저장공간 없이도 다시보기 버튼은 유지한다. */ }
        var notice = document.getElementById("documentGuideNotice");
        var blocked = notice && window.getComputedStyle(notice).display !== "none";
        if (!seen && !blocked) setTimeout(openTour, 1000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
