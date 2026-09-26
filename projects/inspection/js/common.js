window.onload = function () {
  var windowWidth = $(window).width();
  $(".all_menu").click(function () {
    $("#header").toggleClass("active");
  });

  $("#print").click(function () {
    var newHtml = $("html").clone();
    var text = $("textarea[name=cnfrmMnCnList]").val();
    var div = "<pre>" + text + "</pre>";

    $(newHtml).find("textarea[name=cnfrmMnCnList]").remove();
    $(newHtml).find(".skip").remove();
    $(newHtml).find("#header").remove();
    $(newHtml).find("#lnb").remove();
    $(newHtml).find("footer").remove();

    $(newHtml).find("#boxBody").find("td:eq(0)").append(div);

    var mywindow = window.open("", "my div", "height=400,width=600");
    mywindow.document.write($(newHtml).get(0).outerHTML);
    mywindow.document.close(); // IE >= 10에 필요
    mywindow.focus(); // necessary for IE >= 10
    /** 1초 지연 */
    setTimeout(function () {
      mywindow.print();
      mywindow.close();
    }, 1000);
    return true;
  });

  // Mobile *************** 메뉴
  $("#nav li > a.more").click(function () {
    var li = $(this).parent();
    var ul = li.parent();
    ul.find("li").removeClass("active");
    ul.find("ul").not(li.find("ul")).hide();
    li.children("ul").slideToggle();
    if (li.children("ul").is(":visible") || li.has("ul")) {
      li.addClass("active");
    }
  });

  $(".numberCheck")
    .on("keyup", function () {
      this.value = this.value.replace(/[^0-9]/, "");
    })
    .on("keydown", function () {
      this.value = this.value.replace(/[^0-9]/, "");
    });

  $(".telNumCheck")
    .on("keyup", function () {
      this.value = this.value
        .replace(/[^0-9]/g, "")
        .replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    })
    .on("keydown", function () {
      this.value = this.value
        .replace(/[^0-9]/g, "")
        .replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    })
    .attr("maxLength", 13);

  $(".crNoCheck")
    .on("keyup", function () {
      this.value = this.value
        .replace(/[^0-9]/g, "")
        .replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");
    })
    .on("crNoCheck", function () {
      this.value = this.value
        .replace(/[^0-9]/g, "")
        .replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");
    })
    .attr("maxLength", 12);

  //로그인 후 - 진행현황 팝업
  $("#mainPopOpen").click(function () {
    $("#popup").css("display", "flex").hide().fadeIn();
    $.ajax({
      url: gbn_getContextPath() + "/getPrinid.do",
      data: { data: "main" },
      type: "POST",
      dataType: "json",
      success: function (result) {
        var data = result.list[0];
        $("#popup h4").html(data.bsnsNm);
        var html = "";
        if (data != null) {
          $("#popup .tb_basic caption").text(data.bsnsNm + " 사업장 진행현황 상세정보");
          html +=
            '<tr><th scope="row" class="tbg">신고수리일</th><td class="tleft">' +
            gfn_formatDate(data.rprtRpYmd) +
            '</td><th scope="row" class="tbg">정기점검 신청</th><td class="tleft">' +
            (data.status == null || data.status == "" ? "없음" : data.status) +
            "</td></tr>";
          html +=
            '<tr><th scope="row" class="tbg">직전 정기점검일</th><td class="tleft">' +
            gfn_formatDate(data.lastInspYmd) +
            '</td><th scope="row" class="tbg">기술지원 신청</th><td class="tleft">' +
            (data.codeNm == null || data.codeNm == "" ? "없음" : data.codeNm) +
            "</td></tr>";
          html +=
            '<tr><th scope="row" class="tbg">정기점검 기한<br><span style="font-size:12px;">(제외시설/가동중지 기간 미포함)</span></th><td class="tleft">' +
            gfn_formatDate(data.ddlnInspYmd) +
            '</td><th scope="row" class="tbg">1:1문의</th><td class="tleft">';
          if (data.cnt > 0) {
            html +=
              '<a href="' +
              gbn_getContextPath() +
              '/userSelectQnaList.do" class="inquiry_link">바로가기</a>';
          } else {
            html += "없음";
          }
          html += "</td></tr>";
        } else {
        }
        $("#popup .tb_basic tbody").html(html);
      },
    });
  });
  $("#mainPopClose").click(function () {
    modalClose();
  });

  //로그인 후 - 진행현황 팝업
  $("#popOpen").click(function () {
    $("#popup").css("display", "flex").hide().fadeIn();
    $.ajax({
      url: gbn_getContextPath() + "/getPrinid.do",
      data: { data: "sub" },
      type: "POST",
      dataType: "json",
      success: function (result) {
        var html = "";
        $(result.list).each(function () {
          html += "<tr>";
          html +=
            "<td>" +
            (this.bsnsNm == null || this.bsnsNm == "" ? "없음" : this.bsnsNm) +
            "</td>";
          html +=
            "<td>" +
            (this.bsnsCat == null || this.bsnsCat == ""
              ? "없음"
              : this.bsnsCat) +
            "</td>";
          html +=
            "<td>" +
            (this.bsnsCatCd == null || this.bsnsCatCd == ""
              ? "없음"
              : this.bsnsCatCd) +
            "</td>";
          html +=
            "<td>" +
            (this.degInspYmd == null || this.degInspYmd == ""
              ? "없음"
              : this.degInspYmd) +
            "</td>";
          html +=
            "<td>" +
            (this.prdinInspYmd == null || this.prdinInspYmd == ""
              ? "없음"
              : gfn_formatDate(this.prdinInspYmd)) +
            "</td>";
          html +=
            "<td>" +
            (this.prdinDdlnYmd == null || this.prdinDdlnYmd == ""
              ? "없음"
              : gfn_formatDate(this.prdinDdlnYmd)) +
            "</td>";
          html +=
            "<td>" +
            (this.status == null || this.status == "" ? "없음" : this.status) +
            "</td>";
          html += "</tr>";
        });
        $("#popup tbody").html(html);
        $(".pop_cont").css("height", "325px").css("overflow-y", "scroll");
      },
    });
  });
  $("#popClose").click(function () {
    modalClose();
  });
  function modalClose() {
    $("#popup").fadeOut();
  }
  // 서브 : lnb
  $(".mpbox > a").click(function () {
    var li = $(this).parent();
    var ul = li.parent();
    ul.find("li").removeClass("active");
    ul.find("ul").not(li.find("ul")).hide();
    li.children("ul").slideToggle();
    if (li.children("ul").is(":visible") || li.has("ul")) {
      li.addClass("active");
    }
  });
  // 서브 : lnb
  $("#lnb > ul > li > a").click(function () {
    var li = $(this).parent();
    var ul = li.parent();
    ul.find("li").removeClass("active");
    ul.find("ul").not(li.find("ul")).hide();
    li.children("ul").slideToggle();
    if (li.children("ul").is(":visible") || li.has("ul")) {
      li.addClass("active");
    }
  });

  // // 서브 : 수수료 산정 탭
  // $("#applayCharge .tabmenu li a").on("click", function(){
  // 	const num = $("#applayCharge .tabmenu li a").index($(this));
  // 	$("#applayCharge .tabmenu li").removeClass("on");
  // 	$("#applayCharge .tabBox").removeClass("on");
  // 	$('#applayCharge .tabmenu li:eq(' + num + ')').addClass("on");
  // 	$('#applayCharge .tabBox:eq(' + num + ')').addClass("on");
  // });

  $("#totalCharge .btn_ttcharge").click(function () {
    $("#totalCharge").toggleClass("active");
    $("#totalCharge .tb_wrap").slideToggle("");
  });
  // 메뉴
  $("#nav > li > a").click(function () {
    var li = $(this).parent();
    var ul = li.parent();
    ul.find("li").removeClass("active");
    ul.find("ul").not(li.find("ul")).hide();
    li.children("ul").slideToggle();
    if (li.children("ul").is(":visible") || li.has("ul")) {
      li.addClass("active");
    }
  });
  // 검색박스
  $("#searchBtn").click(function () {
    $("#hdSchbox").fadeIn(500);
  });
  $("#hdSchbox .btn_close").click(function () {
    $("#hdSchbox").fadeOut(500);
  });
  //하단 관련사이트
  $(".family_site_btn").click(function () {
    $(this).toggleClass("active");
    $(".family_site_list").slideToggle();
  });

  // 참여마당 > FAQ
  $(".faq_wrap .faq_tit ").click(function () {
    $(this)
      .toggleClass("on")
      .next(".faq_view")
      .slideToggle("fast")
      .parent()
      .siblings()
      .children(".faq_active")
      .hide();
    return false;
  });

  if ($.fn.bxSlider) {
    // 메인-슬라이드(비주얼)
    var slide = $("#visualSlide ul").bxSlider({
      mode: "horizontal",
      pager: false,
      auto: true,
      autoControls: true,
      startText: '<span class="sr-only">start</span>',
      stopText: '<span class="sr-only">stop</span>',
      speed: 2000,
      pause: 10000,
      randomStart: false,
      moveSlides: 1,
      minSlides: 1,
      maxSlides: 1,
      nextText: '<span class="hide">다음</span>',
      prevText: '<span class="hide">이전</span>',
    });

    // 메인-슬라이드(소개홍보영상)
    var intslide1 = $("#introSlide ul").bxSlider({
      touchEnabled: navigator.maxTouchPoints > 0,
      mode: "horizontal",
      pager: false,
      auto: true,
      speed: 1000,
      randomStart: false,
      moveSlides: 1,
      minSlides: 1,
      maxSlides: 3,
      slideWidth: 350,
      slideMargin: 70,
      nextText: '<span class="hide">다음</span>',
      prevText: '<span class="hide">이전</span>',
      startText: '<span class="sr-only">start</span>',
      stopText: '<span class="sr-only">stop</span>',
      autoControls: true,
      onSliderLoad: function ($slideElement) {
        $(".bx-clone").find("a").prop("tabIndex", "-1");
      },
      onSlideBefore: function ($slideElement, oldIndex, newIndex) {
        let ul = $($slideElement).parents();
        ul.children("li").each(function () {
          $(this).find("a").prop("tabIndex", "-1");
        });

        $($slideElement).find("a").prop("tabIndex", "0");
        $($slideElement).next().find("a").prop("tabIndex", "0");
        $($slideElement).next().next().find("a").prop("tabIndex", "0");
      },
    });

    // 메인-배너 슬라이드
    var intslide2 = $("#bannerSlide ul").bxSlider({
      touchEnabled: navigator.maxTouchPoints > 0,
      mode: "horizontal",
      pager: false,
      auto: true,
      speed: 1000,
      startSlide: 1,
      randomStart: false,
      moveSlides: 1,
      minSlides: 2,
      maxSlides: 5,
      slideMargin: 20,
      slideWidth: 400,
      nextText: '<span class="hide">다음</span>',
      prevText: '<span class="hide">이전</span>',
      startText: '<span class="sr-only">start</span>',
      stopText: '<span class="sr-only">stop</span>',
      autoControls: true,
      onSliderLoad: function ($slideElement) {
        $(".bx-clone").find("a").prop("tabIndex", "-1");
      },
      onSlideBefore: function ($slideElement, oldIndex, newIndex) {
        let ul = $($slideElement).parents();
        ul.children("li").each(function () {
          $(this).find("a").prop("tabIndex", "-1");
        });

        $($slideElement).find("a").prop("tabIndex", "0");
        $($slideElement).next().find("a").prop("tabIndex", "0");
        $($slideElement).next().next().find("a").prop("tabIndex", "0");
      },
    });
  }

  // 메인 : 나의사건조회 탭
  $("#csTab .tab_title li a[role='tab']").on("click keydown", function (e) {
    // 키보드 접근 지원 (Enter 또는 Space)
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();

    const $this = $(this);
    const $li = $this.closest("li");
    const idx = $li.index();
    const $tabs = $("#csTab .tab_title li a[role='tab']");
    const $panels = $("#csTab .tab_cont > div[role='tabpanel']");

    // li 클래스 토글
    $("#csTab .tab_title li").removeClass("on");
    $li.addClass("on");

    // aria-selected 및 tabindex 갱신
    $tabs.attr({
      "aria-selected": "false",
    });
    $this.attr({
      "aria-selected": "true",
    });

    // 콘텐츠 show/hide
    $panels.attr("hidden", true).removeClass("on");
    $panels.eq(idx).removeAttr("hidden").addClass("on");

    // 포커스 이동 (접근성 향상)
    $panels.eq(idx).find("a, button, input, [tabindex]").first().focus();
  });

  // 비밀번호찾기 결과 팝업창
  $("#popupOpen").click(function () {
    $("#popupWrap").css("display", "block");
    $("#mask").css("display", "block");
  });
  $("#popupClose").click(function () {
    $("#popupWrap").css("display", "none");
    $("#mask").css("display", "none");
  });

  //정기점검 결과보고서 북마크 열기/닫기
  $("#bkMark > p").click(function () {
    if ($(this).next().css("display") == "none") {
      $(this).next().show();
      $(this).children("span").text("닫기");
    } else {
      $(this).next().hide();
      $(this).children("span").text("열기");
    }
  });
};

// 첨부파일
$(document).ready(function () {
  if (location.protocol === "file:" || !gbn_getContextPath()) {
    $("#beforeLoginDt").text("직전로그인 일시 : 2026-09-23 14:20");
    return;
  }
  $.ajax({
    url: gbn_getContextPath() + "/beforeLoginDt.do",
    type: "post",
    async: false,
    data: "",
    success: function (res) {
      if (res.res) {
        $("#beforeLoginDt").text("직전로그인 일시 : " + res.res[0].dt);
      } else {
        $("#beforeLoginDt").parent().remove();
      }
    },
  });

  var fileTarget = $(".filebox .upload-hidden");
  fileTarget.on("change", function () {
    // 값이 변경되면
    if (window.FileReader) {
      // modern browser
      //2024-07-19_김현광_첨부파일 선택 안 할 시 file name이 input에 담기지 않도록 수정(예외추가)
      var filename = $(this)[0].files[0] ? $(this)[0].files[0].name : "";
    } else {
      // old IE
      var filename = $(this).val().split("/").pop().split("\\").pop(); // 파일명만 추출
    }
    // 추출한 파일명 삽입 YJ 수정
    if ($(this).siblings(".upload-name").length > 0) {
      $(this).siblings(".upload-name").val(filename);
    } else {
      $(this).parent().find(".upload-name").val(filename);
      $(this).attr("data-file", $(this)[0].files[0]);
    }
  });

  if ($(".drop_zone").length > 0) {
    //$(".drop_zone").forEach(function(el){
    $.each($(".drop_zone"), function (index, el) {
      el.addEventListener("dragenter", dragenterHandler);
      el.addEventListener("dragover", dragOverHandler);
      el.addEventListener("dragleave", dragleaveHandler);
      el.addEventListener("drop", dropHandler);
    });
  }

  if ($(".upload-hidden").length > 0) {
    //$(".upload-hidden").forEach(function(el){
    $.each($(".upload-hidden"), function (index, el) {
      el.addEventListener("change", function (e) {
        let files = e.target.files;
        if (files.length === 1) {
          let input = e.target.previousElementSibling.previousElementSibling;
          input.value = files[0].name;
        }
      });
    });
  }

  function dragenterHandler(e) {
    e.stopPropagation();
    e.target.classList.add("dropable");
    const dropSpan = e.target.querySelector(".drop_span");
    if (dropSpan) {
      dropSpan.style.pointerEvents = "none";
    }
  }

  function dragleaveHandler(e) {
    e.stopPropagation();
    e.target.classList.remove("dropable");
    const dropSpan = e.target.querySelector(".drop_span");
    if (dropSpan) {
      dropSpan.style.pointerEvents = "auto";
    }
  }
  function dragOverHandler(e) {
    e.preventDefault();
    if (e.dataTransfer.items.length !== 1) {
      return false;
    }
  }

  function dropHandler(ev) {
    ev.preventDefault();
    if ($(ev.target).attr("class") === "drop_zone dropable") {
      if (ev.dataTransfer.items) {
        if (ev.dataTransfer.items.length > 0) {
          if (ev.dataTransfer.items[0].kind === "file") {
            let file = ev.dataTransfer.items[0].getAsFile();
            let input = (ev.target.querySelector("input").value = file.name);
            $(ev.target.querySelector("input[type='file']")).attr(
              "data-file",
              ev.dataTransfer.files,
            );
            ev.target.querySelector("input[type='file']").files =
              ev.dataTransfer.files;
          }
        }
      }
    }
    ev.target.classList.remove("dropable");
  }
});

//오늘 날자 구하기
function gfn_getToday() {
  var date = new Date();
  var year = date.getFullYear();
  var month = ("0" + (1 + date.getMonth())).slice(-2); 
  var day = ("0" + date.getDate()).slice(-2);
  return year + "-" + month + "-" + day;
}
//날짜 형식 바꾸기
function gfn_formatDate(date) {
  if (date) {
    var d = new Date(date),
      month = "" + (d.getMonth() + 1),
      day = "" + d.getDate(),
      year = d.getFullYear();

    if ("Invalid Date" == d) {
      //if(date.length == 8){
      return (
        date.substring(0, 4) +
        "-" +
        date.substring(4, 6) +
        "-" +
        date.substring(6, 8)
      );
      //}
    } else {
      if (month.length < 2) month = "0" + month;
      if (day.length < 2) day = "0" + day;

      return [year, month, day].join("-");
    }
  } else {
    return "없음";
  }
}

//js 에서 컨텍스트 패스 사용하기.
function gbn_getContextPath() {
  return window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/"));
}

//달력 팝업(fullCalender) 사용하기
function gfn_popupCal() {
  var popup = window.open(
    gbn_getContextPath() + "/portalCalenderPopup.do",
    "calPopup",
    "width=700px,height=600px,scrollbars=no",
  );
}

//주소 검색 팝업 사용하기
function gfn_jusoPopup(gubun) {
  // 주소검색을 수행할 팝업 페이지를 호출합니다.
  // 호출된 페이지(jusopopup.jsp)에서 실제 주소검색URL(https://www.juso.go.kr/addrlink/addrLinkUrl.do)를 호출하게 됩니다.
  //2025-04-24_김현광_취약점 점검 크로스사이트 스크립팅 방지
  //var pop = window.open(gbn_getContextPath()+"/jusoPopup.do?gubun="+gubun,"pop","width=570,height=420, scrollbars=yes, resizable=yes");

  var pop = window.open(
    "",
    "pop",
    "width=570,height=420, scrollbars=yes, resizable=yes",
  );
  var frmData = document.createElement("form");

  frmData.setAttribute("charset", "UTF-8");
  frmData.setAttribute("method", "Post");
  frmData.setAttribute("action", gbn_getContextPath() + "/jusoPopup.do");
  frmData.setAttribute("target", "pop");

  var hiddenField1 = document.createElement("input");
  hiddenField1.setAttribute("type", "hidden");
  hiddenField1.setAttribute("name", "gubun");
  hiddenField1.setAttribute("value", gubun);
  frmData.appendChild(hiddenField1);

  document.body.appendChild(frmData);

  frmData.submit();
}

function gfn_jusoCallBack(roadAddrPart1, addrDetail, gubun) {
  $('input[juso="' + gubun + '"]')
    .eq(0)
    .val(roadAddrPart1);
  $('input[juso="' + gubun + '"]')
    .eq(1)
    .val(addrDetail);
}

//yj 추가.
function gfn_GetCookie(name) {
  var prefix = name + "=";

  var cookieStartIndex = document.cookie.indexOf(prefix);
  if (cookieStartIndex == -1) return null;
  var cookieEndIndex = document.cookie.indexOf(
    ";",
    cookieStartIndex + prefix.length,
  );
  if (cookieEndIndex == -1) cookieEndIndex = document.cookie.length;

  return unescape(
    document.cookie.substring(cookieStartIndex + prefix.length, cookieEndIndex),
  );
}
//yj 추가.
function gfn_checkNumber(obj) {
  obj.value = obj.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function gfn_downFile(atchFileId, fileSn) {
  if (null != atchFileId && "" != atchFileId) {
    var ifm = document.createElement("iframe");
    var tempInfoForm = document.createElement("form");
    tempInfoForm.name = "tempInfoView";
    tempInfoForm.action = gbn_getContextPath() + "/FileDown.do";
    tempInfoForm.method = "POST";
    tempInfoForm.target = "ifm";

    var input = document.createElement("input");
    input.type = "hidden";
    input.name = "atchFileId";
    input.value = atchFileId;
    tempInfoForm.appendChild(input);

    var input = document.createElement("input");
    input.type = "hidden";
    input.name = "fileSn";
    input.value = fileSn;
    tempInfoForm.appendChild(input);
    //최종 만들어진form 생성
    document.body.appendChild(tempInfoForm);
    tempInfoForm.submit();
  }
}

function gbn_fn_headerMenuMove(obj) {
  var parentLi_id = $($(obj).parent("li").parent("ul").parent("li")).attr("id");

  if (parentLi_id) {
    gbn_fn_headerMover(parentLi_id, $(obj).attr("aHref"));
  } else {
    location.href = $(obj).attr("aHref");
  }
}
function gbn_fn_headerMover(id, url) {
  $.ajax({
    url: gbn_getContextPath() + "/portalSelectMenu.do",
    data: { menuId: id },
    type: "POST",
    dataType: "json",
    success: function (result) {
      location.href = url;
    },
  });
}

function gbn_fn_getSumoSelectOption(opt) {
  var option = {
    triggerChangeCombined: true,
    placeholder: "업종명(코드) 선택",
    searchText: "검색...",
    captionFormat: "{0}개 선택되었습니다.",
    captionFormatAllSelected: "{0}개 모두선택되었습니다.!",
    locale: ["확인", "취소", "모두 선택"],
    search: true,
  };

  var returnedTarget = Object.assign(option, opt);
  return returnedTarget;
}

function gbn_fn_autoHyphen(target) {
  target.value = target.value
    .replace(/[^0-9]/, "")
    .replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
}
