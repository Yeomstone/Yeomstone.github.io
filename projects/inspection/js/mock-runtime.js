/* 정적 목업용 연결부: 원본 JSP의 서버 요청을 브라우저 샘플 상태에 연결한다. */
(function () {
    "use strict";
    var routes = {
        "feesCalBoard.do": "feesCalBoard.html",
        "feesCalHistBoard.do": "feesCalHistBoard.html",
        "applyChargeHist.do": "applyCharge.html",
        "applyStatus.do": "applyForm.html",
        "applyFormTechList.do": "applyFormTechList.html",
        "applyFormTechSupUdt.do": "applyFormResultDetail.html",
        "applyResultFormTechSupUdt.do": "applyFormResultDetail.html",
        "applyFormResultReport.do": "applyFormResultList.html",
        "main.do": "index.html",
        "applyCharge.do": "applyCharge.html",
        "applyForm.do": "applyForm.html",
        "applyFormResultDetail.do": "applyFormResultDetail.html",
        "documentGuide.do": "documentGuide.html",
        "documentGuideList.do": "DocoumentGuideList.html",
        "selfApplyCharge.do": "selfApplyCharge.html",
        "periodicPerformanceHistory.do": "periodicPerformanceHistory.html",
        "periodicPerformanceHistoryDetail.do": "periodicPerformanceHistoryDetail.html",
        "periodicPerformanceChangeHistory.do": "periodicPerformanceChangeHistory.html",
        "integratedInspectionHistoryManage.do": "IntegratedInspectionHistoryManage.html",
        "integratedInspectionHistoryDetail.do": "IntegratedInspectionHistoryDetail.html",
        "integratedInspectionChangeHistory.do": "IntegratedInspectionChangeHistory.html",
        "siteResultReportDetail.do": "applyFormResultDetail.html"
    };
    var current = location.pathname.split("/").pop();
    var nativeSubmit = HTMLFormElement.prototype.submit;
    var storagePrefix = "inspection-mock:";

    if (window.jQuery) {
        var nativeAjax = jQuery.ajax;
        jQuery.ajax = function (options) {
            var request = typeof options === "string" ? { url: options } : options || {};
            var url = request.url || "";
            var mock = null;
            if (url.indexOf("selectFacilityCode.do") >= 0) {
                mock = { result: [{ code: "F001", codeidnm: "배수장치", codeNm: "배수장치" }] };
            } else if (url.indexOf("selectDetailReason.do") >= 0) {
                mock = { result: [{ code: "D001", codeNm: "시설관리기준 미준수", codenm: "시설관리기준 미준수", techSupNm: "비산배출시설 최적설치·운영방안 제시", techsupnm: "비산배출시설 최적설치·운영방안 제시" }] };
            } else if (url.indexOf("selectReason.do") >= 0) {
                mock = { result: [{ code: "R001", codeNm: "시설관리기준 미준수", codenm: "시설관리기준 미준수" }] };
            } else if (url.indexOf("selectUpjongCode.do") >= 0) {
                mock = { result: [{ code: "2-가", codeNm: "Ⅱ. 기타 화학제품 제조업" }] };
            } else if (url.indexOf("applyFormResultTechSupUpdate.do") >= 0) {
                mock = { success: true, message: "샘플 설정이 저장되었습니다." };
            }
            if (mock) {
                if (typeof request.success === "function") request.success(mock);
                if (typeof request.complete === "function") request.complete();
                return jQuery.Deferred().resolve(mock).promise();
            }
            return nativeAjax.apply(this, arguments);
        };
    }
    if (typeof window.fn_startTechOneStopNiceAuthentication === "function") {
        window.fn_startTechOneStopNiceAuthentication = function () {
            var consent = document.getElementById("techOneStopAgreement");
            if (!consent || !consent.checked) {
                alert("통합관리시스템 정보 활용 동의에 체크해 주세요.");
                if (consent) consent.focus();
                return;
            }
            window.fn_authenticationCallback("MOCK", "MOCK-CI", "샘플 사용자", "", "", "");
        };
    }

    if (typeof window.fnSearchId === "function" && current === "applyForm.html") {
        window.fnSearchId = function () {
            window.fn_applyFormAuthenticationCallback("", "MOCK-CI", "샘플 사용자", "", "");
            alert("샘플 본인인증이 완료되었습니다.");
        };
    }
    if (typeof window.fn_validatingDate === "function" && current === "applyForm.html") {
        window.fn_validatingDate = function () {
            var start = prompt("점검 희망 시작일을 입력해 주세요. (YYYY-MM-DD)", "2026-10-15");
            if (!start) return;
            var end = prompt("점검 희망 종료일을 입력해 주세요. (YYYY-MM-DD)", start);
            if (!end) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
                alert("시작일과 종료일을 확인해 주세요.");
                return;
            }
            window.fn_setPrdinInspYmd(start, end);
        };
    }
    if (typeof window.fn_pay === "function" && current === "applyCharge.html") {
        window.fn_pay = function () {
            alert("카드결제는 샘플 목업에서 실행되지 않습니다.");
        };
    }
    if (typeof window.fn_siteStatusFileDown === "function") {
        window.fn_siteStatusFileDown = function () {
            alert("첨부파일은 샘플 표시입니다.");
            return false;
        };
    }
    function actionName(action) {
        try {
            return new URL(action, location.href).pathname.split("/").pop();
        } catch (e) {
            return String(action || "").split("/").pop().split("?")[0];
        }
    }
    function formValues(form) {
        var values = new URLSearchParams();
        new FormData(form).forEach(function (value, key) {
            if (typeof value === "string") values.append(key, value);
        });
        return values;
    }
    function saveForm(form) {
        try {
            var values = {};
            formValues(form).forEach(function (value, key) {
                if (!values[key]) values[key] = [];
                values[key].push(value);
            });
            localStorage.setItem(storagePrefix + current + ":" + (form.id || form.name), JSON.stringify({
                values: values,
                siteHistoryMarkup: form.querySelector("#siteHistoryBody") ? form.querySelector("#siteHistoryBody").innerHTML : null,
                savedAt: new Date().toISOString()
            }));
            return true;
        } catch (e) {
            alert("브라우저 저장공간에 저장하지 못했습니다.");
            return false;
        }
    }
    function completeApplication(form, button, message) {
        if (!form) return;
        if (form.id === "applyFormTechOneStopForm") {
            var selectedFields = Array.prototype.map.call(document.querySelectorAll('input[name="oneStopTechFld"]:checked'), function (input) {
                return input.value;
            });
            form.querySelector('[name="techFld"]').value = selectedFields.join(",");
            form.querySelector('[name="techSupYmd"]').value = (document.getElementById("oneStopTechSupYmdInput") || {}).value || "";
            form.querySelector('[name="rsnsAplct"]').value = (document.getElementById("oneStopRsnsAplctInput") || {}).value || "";
            form.querySelector('[name="niceAuthCi"]').value = "MOCK-CI";
        }
        if (!saveForm(form)) return;
        if (button) {
            button.textContent = message;
            button.setAttribute("aria-label", message);
        }
        alert(message + " (샘플 데이터가 이 브라우저에 저장되었습니다.)");
    }
    function routeForm(form) {
        var name = actionName(form.action);
        if (name === "applyFormSubmit.do") {
            var isDraft = form.querySelector('[name="status"]') && form.querySelector('[name="status"]').value === "1";
            completeApplication(form, null, isDraft ? "임시저장 완료" : "신청 완료");
            return;
        }
        if (name === "applyFormTechOneStopInsert.do") {
            completeApplication(form, document.getElementById("oneStopApplySubmitBtn"), "신청 완료");
            return;
        }
        if (name === "integratedInspectionHistoryExcel.do" ||
            name === "periodicPerformanceHistoryExcel.do" ||
            name === "documentGuideListExcel.do" ||
            name === "feesCalBoardExcel.do" ||
            name === "applyFormResultReportExcel.do") {
            exportTable();
            return;
        }
        if (name === "applyFormResultDetailReport.do" || name === "applyFormResultDetailReportAdmin.do" ||
            name === "applyFormSampleConfirmation.do") {
            if (saveForm(form)) alert("샘플 제출 내용이 이 브라우저에 저장되었습니다.");
            return;
        }
        if (name === "calPay.do") {
            alert("카드결제는 샘플 목업에서 실행되지 않습니다.");
            return;
        }
        if (/Save\.do$|Insert\.do$|Update\.do$|Submit\.do$/.test(name)) {
            if (saveForm(form)) {
                alert("샘플 데이터가 이 브라우저에 저장되었습니다.");
                if (name === "applyFormTechOneStopInsert.do") {
                    var button = document.getElementById("oneStopApplySubmitBtn");
                    if (button) button.textContent = "기술지원 신청 완료";
                }
            }
            return;
        }
        if (name === "FileDown.do") {
            alert("이 화면의 첨부파일은 샘플 표시입니다.");
            return;
        }
        var destination = routes[name] || (name.endsWith(".html") ? name : null);
        if (!destination) {
            alert("이 요청은 서버 연동이 필요한 기능입니다. 목업에서는 처리 결과가 생성되지 않습니다.");
            return;
        }
        var values = formValues(form);
        if (destination === current) {
            var next = new URL(location.href);
            next.search = values.toString();
            location.href = next.href;
            return;
        }
        location.href = "./" + destination + (values.toString() ? "?" + values.toString() : "");
    }
    HTMLFormElement.prototype.submit = function () {
        if (this.dataset.mockNative === "true") return nativeSubmit.call(this);
        routeForm(this);
    };
    document.addEventListener("submit", function (event) {
        if (event.target instanceof HTMLFormElement && event.target.dataset.mockNative !== "true") {
            event.preventDefault();
            routeForm(event.target);
        }
    }, true);
    document.addEventListener("click", function (event) {
        var button = event.target.closest("a, button");
        if (button) {
            var onclick = button.getAttribute("onclick") || "";
            var applicationForm = null;
            var message = "신청 완료";
            if (current === "applyForm.html" && onclick.indexOf("fn_formSubmit(2)") >= 0) {
                applicationForm = document.getElementById("applyFormSubmit");
                var status = document.getElementById("status");
                if (status) status.value = "2";
            } else if (current.indexOf("applyFormResultDetail") === 0 && button.id === "oneStopApplySubmitBtn") {
                applicationForm = document.getElementById("applyFormTechOneStopForm");
            } else if (current === "applyFormResultDetailAdmin.html" && onclick.indexOf("fn_applyFinalyUpdate(") >= 0) {
                applicationForm = document.getElementById("inspectionVO");
                message = "결과서 제출 완료";
            } else if (current === "applyCharge.html" && button.textContent.trim() === "제출" && button.closest("#agree")) {
                applicationForm = document.getElementById("listForm");
                message = "수수료 제출 완료";
            }
            if (applicationForm) {
                event.preventDefault();
                event.stopImmediatePropagation();
                completeApplication(applicationForm, button, message);
                return;
            }
        }
        var link = event.target.closest("a[href]");
        if (!link) return;
        var name = actionName(link.getAttribute("href"));
        if (routes[name]) {
            event.preventDefault();
            location.href = "./" + routes[name];
        }
    }, true);

    function exportTable() {
        var table = document.querySelector(".history-table, #historyManage .tBoard, #documentGuideList .tBoard, .tBoard");
        if (!table) {
            alert("내보낼 목록이 없습니다.");
            return;
        }
        var rows = Array.prototype.filter.call(table.querySelectorAll("tr"), function (row) {
            return row.style.display !== "none";
        });
        var data = rows.map(function (row) {
            return Array.prototype.map.call(row.querySelectorAll("th, td"), function (cell) {
                return cell.textContent.replace(/\s+/g, " ").trim();
            });
        });
        if (window.XLSX) {
            var book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), "정기점검 이력");
            XLSX.writeFile(book, "정기점검_샘플이력.xlsx");
            return;
        }
        var script = document.createElement("script");
        script.src = "./js/xlsx.full.min.js";
        script.onload = exportTable;
        script.onerror = function () { alert("엑셀 파일을 만들 수 없습니다."); };
        document.head.appendChild(script);
    }

    function restoreSearch() {
        var query = new URLSearchParams(location.search);
        ["year", "authCode", "picEnvAgcyCd", "searchStatus", "searchKeyword", "pageUnit", "pageIndex", "odrCol", "odrSrt"].forEach(function (name) {
            var control = document.querySelector('[name="' + name + '"]');
            if (control && query.has(name)) control.value = query.get(name);
        });
        if (!query.has("searchKeyword") && !query.has("searchStatus")) return;
        var keyword = (query.get("searchKeyword") || "").trim().toLowerCase();
        var status = query.get("searchStatus") || "";
        var year = query.get("year") || "";
        var table = document.querySelector(".history-table, #historyManage .tBoard:not(.summary_table), #documentGuideList .tBoard");
        if (!table) return;
        var visible = 0;
        Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (row) {
            if (row.querySelector(".history_empty, .empty_data")) return;
            var content = row.textContent.toLowerCase();
            var matches = (!keyword || content.indexOf(keyword) >= 0) &&
                (!status || content.indexOf(status.toLowerCase()) >= 0) &&
                (!year || content.indexOf(year) >= 0);
            row.style.display = matches ? "" : "none";
            if (matches) visible++;
        });
        var count = document.querySelector(".countText .count, .history-count strong, #totalCnt");
        if (count) count.textContent = visible;
    }

    function restoreSavedDetail() {
        var form = document.getElementById("detailForm");
        if (!form) return;
        try {
            var saved = JSON.parse(localStorage.getItem(storagePrefix + current + ":detailForm") || "null");
            if (!saved || !saved.values) return;
            if (saved.siteHistoryMarkup && form.querySelector("#siteHistoryBody")) {
                form.querySelector("#siteHistoryBody").innerHTML = saved.siteHistoryMarkup;
            }
            Object.keys(saved.values).forEach(function (name) {
                var values = saved.values[name];
                var controls = form.querySelectorAll('[name="' + CSS.escape(name) + '"]');
                Array.prototype.forEach.call(controls, function (control, index) {
                    if (control.type === "file" || control.type === "hidden") return;
                    if (control.type === "checkbox" || control.type === "radio") {
                        control.checked = values.indexOf(control.value) >= 0;
                    } else {
                        control.value = values[Math.min(index, values.length - 1)];
                    }
                });
            });
        } catch (e) {
            /* 저장 내용이 손상되면 원본 샘플 값을 표시한다. */
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        restoreSearch();
        restoreSavedDetail();
    });

    var tourScript = document.createElement("script");
    tourScript.src = new URL("feature-tour.js", document.currentScript.src).href;
    document.head.appendChild(tourScript);
})();
