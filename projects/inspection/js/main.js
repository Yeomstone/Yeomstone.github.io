function mfn_openWindow() {
  $("#payImg").css("top", document.documentElement.scrollTop).show();
}

const IntFormat = new Intl.NumberFormat("ko-KR").format;
let searchStr = window.location.search || "";
let queryString = searchStr.indexOf("rcptNo=") > -1 ? searchStr.split("rcptNo=") : null;
let rcptNo = (queryString && queryString.length > 1) ? queryString[1].split("&seq")[0] : "2023-04-0012-01";
let seq = "";

if (queryString && queryString.length > 1 && queryString[1].split("&seq")[1]) {
  seq = queryString[1].split("&seq")[1].split("=")[1];
}

const keys = ["업무대", "업무중", "시설구분대", "시설구분중", "시설구분소"];
const calculateObj = {
  totalCost: function (data, total) {
    if (data) {
      return (
        data.slice(0, data.length - 1).reduce((acc, curr, idx) => {
          return acc + curr.valueFn(curr.inputValue);
        }, 0) + total
      );
    } else {
      return 0 + total;
    }
  },
};

function makeSelectedTableData(filterdData) {
  //데이터 생성
  const divsion = filterdData.length !== 0 ? filterdData[0].bsnscatcd : null;
  const tableData = filterdData.reduce((acc, curr, idx) => {
    const row = keys.map((key, i) => {
      const currVal = curr[key];
      const col = { value: currVal, colspan: 1, rowspan: 1 };
      return col;
    });
    acc.push(row);
    return acc;
  }, []);
  if (divsion !== "2-가" && divsion !== "4-가") {
    //tableData.splice(tableData.length - 1, 1);
  }

  //rowspan 조정
  for (let i = tableData.length - 1; i > 0; i--) {
    const currRow = tableData[i];
    const prevRow = tableData[i - 1];
    currRow.forEach((col, j) => {
      if (j > 0) {
        if (
          col.value === prevRow[j].value &&
          currRow[j - 1].value === prevRow[j - 1].value
        ) {
          prevRow[j].rowspan += col.rowspan;
          col.rowspan = 0;
        }
      } else {
        if (col.value === prevRow[j].value) {
          prevRow[j].rowspan += col.rowspan;
          col.rowspan = 0;
        }
      }
    });
  }

  //colspan 조정
  tableData.forEach((row) => {
    for (let i = row.length - 1; i > 0; i--) {
      if (!row[i].value) {
        row[i - 1].colspan += row[i].colspan;
        row[i].colspan = 0;
      }
    }
  });

  const result = tableData.map((row) => {
    return row.filter((col) => col.colspan > 0 && col.rowspan > 0);
  });
  return result;
}

Vue.component("datepicker", {
  template: "<input style='width: 100%; margin-top: 2px;' readonly/>",
  mounted: function () {
    var self = this;
    $(this.$el).datepicker({
      dateFormat: "yy-mm-dd",
      showOtherMonths: true, //빈 공간에 현재월의 앞뒤월의 날짜를 표시
      showMonthAfterYear: true, // 월- 년 순서가아닌 년도 - 월 순서
      changeYear: true, //option값 년 선택 가능
      changeMonth: true, //option값  월 선택 가능
      showOn: "button", //button:버튼을 표시하고,버튼을 눌러야만 달력 표시 ^ both:버튼을 표시하고,버튼을 누르거나 input을 클릭하면 달력 표시
      buttonImage: gbn_getContextPath() + "/images/icon_cal.png", //버튼 이미지 경로
      buttonImageOnly: true, //버튼 이미지만 깔끔하게 보이게함
      buttonText: "선택", //버튼 호버 텍스트
      yearSuffix: "년", //달력의 년도 부분 뒤 텍스트
      monthNamesShort: [
        "1월",
        "2월",
        "3월",
        "4월",
        "5월",
        "6월",
        "7월",
        "8월",
        "9월",
        "10월",
        "11월",
        "12월",
      ], //달력의 월 부분 텍스트
      monthNames: [
        "1월",
        "2월",
        "3월",
        "4월",
        "5월",
        "6월",
        "7월",
        "8월",
        "9월",
        "10월",
        "11월",
        "12월",
      ], //달력의 월 부분 Tooltip
      dayNamesMin: ["일", "월", "화", "수", "목", "금", "토"], //달력의 요일 텍스트
      dayNames: [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
      ], //달력의 요일 Tooltip
      minDate: "-5Y", //최소 선택일자(-1D:하루전, -1M:한달전, -1Y:일년전)
      maxDate: "+5y", //최대 선택일자(+1D:하루후, -1M:한달후, -1Y:일년후)
      onSelect: function (d) {
        self.$emit("update-date", d);
      },
    });
  },
  beforeDestroy: function () {
    $(this.$el).datepicker("hide").datepicker("destroy");
  },
});

const app = new Vue({
  el: "#contents",
  data: {
    rcptNo: rcptNo,
    result: [],
    seqHist: seq,
    email: null,
    cancelReason: null,
    atchFileId9: null,
    atchFileId9Nm: null,
    sectors: [],
    appSectors: [],
    selected: {}, //null, //"",
    wages: null,
    codeDc: null,
    //2025-05-15_김현광_보고서 계산식 변수로 제어(4업종에 할인에 한해서) 추가
    totalVar:4,
    //2025-07-24_김현광_crf파일 분기 구분자 추가
    newCrf: null,
    rowLengths: {
      // 업종별 row length
      rowLength1: 0,
      rowLength2: 0,
      rowLength3: 0,
      rowLength4: 0,
      rowLength5: 0,
    },
    grandTotal: {
      "1-가": {
        totalCost: 0,
        laborCosts: 0,
        expenses: 0,
        otherCost: 0,
        fee: 0,
        costTotal: 0,
        vat: 0,
        grandTotal: 0,
      },
      "1-나": {
        totalCost: 0,
        laborCosts: 0,
        expenses: 0,
        otherCost: 0,
        fee: 0,
        costTotal: 0,
        vat: 0,
        grandTotal: 0,
      },
      "2-가": {
        totalCost: 0,
        laborCosts: 0,
        expenses: 0,
        otherCost: 0,
        fee: 0,
        costTotal: 0,
        vat: 0,
        grandTotal: 0,
      },
      "3-가": {
        totalCost: 0,
        laborCosts: 0,
        expenses: 0,
        otherCost: 0,
        fee: 0,
        costTotal: 0,
        vat: 0,
        grandTotal: 0,
      },
      "4-가": {
        totalCost: 0,
        laborCosts: 0,
        expenses: 0,
        otherCost: 0,
        fee: 0,
        costTotal: 0,
        vat: 0,
        grandTotal: 0,
      },
    },
    sectorsData1: null,
    sectorsData2: null,
    sectorsData3: null,
    sectorsData4: null,
    sectorsData5: null,
    status: null,
    feeDepYmd: null,
    // 세금계산서용 추가 금액: 기본 산정 수수료와 분리해 입력하고 최종 저장 금액에 합산한다.
    taxInvoiceAddFee: 0,
    vSum_R: 0,
    vSum_P: 0,
    isShow: false,
  },
  watch: {
    appSectors: function (newAs) {
      if (!newAs.includes(this.selected.value)) {
        this.selected = this.sectors.find((sector) => newAs.includes(sector.value)) || {};
      }      
      this.isShow = newAs.includes('4-가') && !mngNo ? true : false;
    },
    selected() {
      if (this.filterdData?.length === 0) return;
      let calcValue = this.calcValue;
      this.grandTotal[this.filterdData[0].bsnscatcd] = {
        ...calcValue,
      };
    },
  },
  created() {
    this.getSectors();    
  },
  mounted() {},
  computed: {
    tabs: function () {
      const checked = this.appSectors;
      return this.sectors.filter((e) => checked.includes(e.value));
    },
    filterdData: function () {
      const sValue = this.selected.value;
      return this.result.filter((e) => e[sValue]);
    },
    tableData: function () {
      return makeSelectedTableData(this.filterdData);
    },
    calcData: function () {
      return this.makeCalcData(this.filterdData);
    },
    totalData: {
      cache: false,
      get() {
        const sValue = this.selected.value;
        let value = this.calcData.reduce((acc, curr) => {
          return acc + curr.valueFn(curr.inputValue);
        }, 0);
        if (sValue === "3-가" || sValue === "4-가") {
            //2025-05-15_김현광_4업종일 경우 보고서 항목 계산 값 반영
        	if(sValue === "4-가"){
        		return value / app.totalVar
        	}else{
        		return value / 4;
        	}
        } else {
          return value / 5;
        }
      },
    },
    calcValue: {
      cache: false,
      get() {
        const totalCost = calculateObj.totalCost(this.calcData, this.totalData);
        const laborCosts = totalCost * this.wages;
        const expenses = laborCosts * 0.2;
        const otherCost = laborCosts * 1.1;
        const fee = (laborCosts + otherCost) * 0.2;
        const costTotal = (laborCosts + expenses + otherCost + fee) * 0.65;
        const vat = costTotal * 0.1;
        const grandTotal = costTotal + vat;
        return {
          totalCost: totalCost,
          laborCosts: laborCosts,
          expenses: expenses,
          otherCost: otherCost,
          fee: fee,
          costTotal: costTotal,
          vat: vat,
          grandTotal: grandTotal,
        };
      },
    },
    totalCalcValue: {
      cache: false,
      get() {
        let tCost;

        if (this.appSectors.length === 0) {
        } else {
          for (let i = 0; i < this.appSectors.length; i++) {
            let totalCalcData;
            let value;

            if (this.appSectors[i] === "1-가") {
              if (this.sectorsData1) {
                value = this.sectorsData1.reduce((acc, curr) => {
                  return acc + curr.valueFn(curr.inputValue);
                }, 0);
              } else {
                return;
              }
            } else if (this.appSectors[i] === "1-나") {
              if (this.sectorsData2) {
                value = this.sectorsData2.reduce((acc, curr) => {
                  return acc + curr.valueFn(curr.inputValue);
                }, 0);
              } else {
                return;
              }
            } else if (this.appSectors[i] === "2-가") {
              if (this.sectorsData3) {
                value = this.sectorsData3.reduce((acc, curr) => {
                  return acc + curr.valueFn(curr.inputValue);
                }, 0);
              } else {
                return;
              }
            } else if (this.appSectors[i] === "3-가") {
              if (this.sectorsData4) {
                value = this.sectorsData4.reduce((acc, curr) => {
                  return acc + curr.valueFn(curr.inputValue);
                }, 0);
              } else {
                return;
              }
            } else {
              if (this.sectorsData5) {
                value = this.sectorsData5.reduce((acc, curr) => {
                  return acc + curr.valueFn(curr.inputValue);
                }, 0);
              } else {
                return;
              }
            }
            if (
              this.appSectors[i] === "3-가" ||
              this.appSectors[i] === "4-가"
            ) {
              //2025-05-15_김현광_4업종일 경우 보고서 항목 계산 값 반영
              if(this.appSectors[i] === "4-가"){
        		totalCalcData = value / app.totalVar;
        	  }else{
        		totalCalcData = value / 4;
        	  }
            } else {
              totalCalcData = value / 5;
            }

            if (this.appSectors[i] === "1-가") {
              tCost = calculateObj.totalCost(this.sectorsData1, totalCalcData);
            } else if (this.appSectors[i] === "1-나") {
              tCost = calculateObj.totalCost(this.sectorsData2, totalCalcData);
            } else if (this.appSectors[i] === "2-가") {
              tCost = calculateObj.totalCost(this.sectorsData3, totalCalcData);
            } else if (this.appSectors[i] === "3-가") {
              tCost = calculateObj.totalCost(this.sectorsData4, totalCalcData);
            } else {
              tCost = calculateObj.totalCost(this.sectorsData5, totalCalcData);
            }

            let laborCosts = tCost * this.wages;
            let expenses = laborCosts * 0.2;
            let otherCost = laborCosts * 1.1;
            let fee = (laborCosts + otherCost) * 0.2;
            let costTotal = (laborCosts + expenses + otherCost + fee) * 0.65;
            let vat = costTotal * 0.1;
            let grandTotal = costTotal + vat;

            this.grandTotal[this.appSectors[i]].totalCost = tCost;
            this.grandTotal[this.appSectors[i]].laborCosts = laborCosts;
            this.grandTotal[this.appSectors[i]].expenses = expenses;
            this.grandTotal[this.appSectors[i]].otherCost = otherCost;
            this.grandTotal[this.appSectors[i]].fee = fee;
            this.grandTotal[this.appSectors[i]].costTotal = costTotal;
            this.grandTotal[this.appSectors[i]].vat = vat;
            this.grandTotal[this.appSectors[i]].grandTotal = grandTotal;
          }
          const totalCost =
            this.grandTotal["1-가"].totalCost +
            this.grandTotal["1-나"].totalCost +
            this.grandTotal["2-가"].totalCost +
            this.grandTotal["3-가"].totalCost +
            this.grandTotal["4-가"].totalCost;
          const laborCosts =
            this.grandTotal["1-가"].laborCosts +
            this.grandTotal["1-나"].laborCosts +
            this.grandTotal["2-가"].laborCosts +
            this.grandTotal["3-가"].laborCosts +
            this.grandTotal["4-가"].laborCosts;
          const expenses =
            this.grandTotal["1-가"].expenses +
            this.grandTotal["1-나"].expenses +
            this.grandTotal["2-가"].expenses +
            this.grandTotal["3-가"].expenses +
            this.grandTotal["4-가"].expenses;
          const otherCost =
            this.grandTotal["1-가"].otherCost +
            this.grandTotal["1-나"].otherCost +
            this.grandTotal["2-가"].otherCost +
            this.grandTotal["3-가"].otherCost +
            this.grandTotal["4-가"].otherCost;
          const fee =
            this.grandTotal["1-가"].fee +
            this.grandTotal["1-나"].fee +
            this.grandTotal["2-가"].fee +
            this.grandTotal["3-가"].fee +
            this.grandTotal["4-가"].fee;
          const costTotal =
            this.grandTotal["1-가"].costTotal +
            this.grandTotal["1-나"].costTotal +
            this.grandTotal["2-가"].costTotal +
            this.grandTotal["3-가"].costTotal +
            this.grandTotal["4-가"].costTotal;
          const vat =
            this.grandTotal["1-가"].vat +
            this.grandTotal["1-나"].vat +
            this.grandTotal["2-가"].vat +
            this.grandTotal["3-가"].vat +
            this.grandTotal["4-가"].vat;
          const grandTotal =
            this.grandTotal["1-가"].grandTotal +
            this.grandTotal["1-나"].grandTotal +
            this.grandTotal["2-가"].grandTotal +
            this.grandTotal["3-가"].grandTotal +
            this.grandTotal["4-가"].grandTotal;
          return {
            totalCost: totalCost,
            laborCosts: laborCosts,
            expenses: expenses,
            otherCost: otherCost,
            fee: fee,
            costTotal: costTotal,
            vat: vat,
            grandTotal: grandTotal,
          };
        }
      },
    },
    num: function () {
      return num.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`);
    },
    disabled: function () {
      return mngNo
        ? true
        : this.status === "6" || this.status === "7" || this.status === "10"
        ? true
        : false;
    },
    taxInvoiceAddFeeDisabled: function () {
      // 세금계산서용 추가 금액은 관리자 산정 단계에서만 수정하고, 사업장/이력/입금 이후에는 읽기 전용으로 둔다.
      return mngNo || this.seqHist !== "" || this.status === "6" || this.status === "7" || this.status === "10";
    },
    totalGrandTotalWithTaxInvoiceAddFee: function () {
      // 화면 출력, 카드결제 검증, 저장 전송에 동일하게 사용할 최종 금액이다.
      return this.getFinalGrandTotalForSave();
    },
  },
  methods: {
    toPlainNumber: function (value) {
      const numberValue = Number(String(value || "0").replace(/,/g, ""));
      return isNaN(numberValue) ? 0 : numberValue;
    },
    getBaseGrandTotalForSave: function () {
      // 기존 수수료 저장 방식과 동일하게 기본 산정 수수료는 천원 단위로 절사한다.
      const baseGrandTotal = this.totalCalcValue ? this.totalCalcValue.grandTotal : 0;
      return Math.floor(this.toPlainNumber(baseGrandTotal) / 1000) * 1000;
    },
    getTaxInvoiceAddFeeForSave: function () {
      // 세금계산서용 추가 금액은 숫자 컬럼이므로 콤마 없는 숫자 문자열로 전송한다.
      return String(this.toPlainNumber(this.taxInvoiceAddFee));
    },
    getFinalGrandTotalForSave: function () {
      return this.getBaseGrandTotalForSave() + this.toPlainNumber(this.taxInvoiceAddFee);
    },
    getFinalGrandTotalTextForSave: function () {
      return this.numFormat(this.getFinalGrandTotalForSave());
    },
    updateTaxInvoiceAddFee: function (value) {
      // 사용자가 입력한 추가 금액은 숫자만 보관하고 화면에서는 콤마 포맷으로 표시한다.
      this.taxInvoiceAddFee = String(value || "").replace(/[^0-9]/g, "");
    },
    formatTaxInvoiceAddFee: function (value) {
      const numberValue = this.toPlainNumber(value);
      return numberValue === 0 ? "" : this.numFormat(numberValue);
    },
    makeCalcData: function (filterdData) {
      if (filterdData.length === 0) return [];
      if (filterdData[0].bsnscatcd === "1-가") {
        if (this.sectorsData1) return this.sectorsData1;
      } else if (filterdData[0].bsnscatcd === "1-나") {
        if (this.sectorsData2) return this.sectorsData2;
      } else if (filterdData[0].bsnscatcd === "2-가") {
        if (this.sectorsData3) return this.sectorsData3;
      } else if (filterdData[0].bsnscatcd === "3-가") {
        if (this.sectorsData4) return this.sectorsData4;
      } else {
        if (this.sectorsData5) return this.sectorsData5;
      }

      const result = filterdData.map((row) => {
        const value = row["공량"] + "";
        const numIdx = value.indexOf("Num");
        const checkIdx = value.indexOf("Check");
        const rtnCol = {
          value: value,
          bsnscatcd: row.bsnscatcd,
          bsnsClsL: row.업무대,
          bsnsClsM: row.업무중,
          fcltyClsL: row.시설구분대,
          fcltyClsM: row.시설구분중,
          fcltyClsS: row.시설구분소,
          feeCalc: row.공량,
          fcltyItem: row.시설의수,
          seq: row.SEQ,
          delYn: "N",
          unitWages: this.wages,
          rcptNo: rcptNo || "",
        };
        if (numIdx > 0) {
          const evalText = value.replace(/×/gi, "*"); //;.replace(/Num/gi, 0);
          rtnCol.input = true;
          rtnCol.inputValue = null;
          rtnCol.prefix = value.substr(0, numIdx);
          rtnCol.suffix = value.substr(numIdx + 3);
          rtnCol.placeholder = row["시설의수"];
          rtnCol.valueFn = (num) => {
            const Num = num || 0;
            if (Num === 0) {
              return 0;
            } else {
              const calc = eval(evalText);
              return calc;
            }
          };
        } else if (checkIdx > 0) {
          const evalText = value.replace(/×/gi, "*").replace("Check", "Num");
          rtnCol.checkBox = true;
          if (
            row.시설구분대 === "점검대상 배출시설" &&
            row.업무중 === "공통기준" &&
            (row.bsnscatcd === "2-가" || row.bsnscatcd === "4-가")
          ) {
            rtnCol.inputValue = 1;
          } else {
            rtnCol.inputValue = 0;
          }
          rtnCol.prefix = value.substr(0, checkIdx);
          rtnCol.valueFn = (num) => {
            const Num = num || 0;
            if (Num === 0) {
              return 0;
            } else {
              const calc = eval(evalText);
              return calc;
            }
          };
        } else {
          rtnCol.valueFn = () => Number(value);
        }
        return rtnCol;
      });

      if (
        result[result.length - 1].bsnscatcd != "2-가" &&
        result[result.length - 1].bsnscatcd != "4-가"
      ) {
        //result.splice(result.length - 1, 1);
      }
      result[result.length - 1].valueFn = () => 0;

      if (filterdData[0].bsnscatcd === "1-가") {
        this.sectorsData1 = _.cloneDeep(result);
        return this.sectorsData1;
      } else if (filterdData[0].bsnscatcd === "1-나") {
        this.sectorsData2 = _.cloneDeep(result);
        return this.sectorsData2;
      } else if (filterdData[0].bsnscatcd === "2-가") {
        this.sectorsData3 = _.cloneDeep(result);
        return this.sectorsData3;
      } else if (filterdData[0].bsnscatcd === "3-가") {
        this.sectorsData4 = _.cloneDeep(result);
        return this.sectorsData4;
      } else {
        this.sectorsData5 = _.cloneDeep(result);
        return this.sectorsData5;
      }
    },
    tCalVlaue: function (value) {
      if (this.grandTotal[value].totalCost !== 0) {
        this.grandTotal[value].totalCost = 0;
        this.grandTotal[value].laborCosts = 0;
        this.grandTotal[value].expenses = 0;
        this.grandTotal[value].otherCost = 0;
        this.grandTotal[value].fee = 0;
        this.grandTotal[value].costTotal = 0;
        this.grandTotal[value].vat = 0;
        this.grandTotal[value].grandTotal = 0;
      }
    },
    changeTotalValue: function () {
      if (this.filterdData?.length === 0) return;
      let calcValue = this.calcValue;
      this.grandTotal[this.filterdData[0].bsnscatcd] = {
        ...calcValue,
      };
    },
    autoCal: function (idx) {
      let length = this.calcData[idx].inputValue.toString().length;
      if (length >= 7) {
        alert("최대 6자리까지 입력가능합니다.");
        this.calcData[idx].inputValue = "";
      }
      if (false && this.calcData[idx].fcltyClsL === "비산누출시설") {
        let targetIdx;
        let loop = this.calcData.length - 1;
        for (let i = 0; i <= loop; i++) {
          targetIdx = this.calcData[i].placeholder;
          if (targetIdx === "비산누출시설총계") {
            targetIdx = i;
            break;
          }
        }
        for (let i = 0; i <= loop; i++) {
          if (this.calcData[i].fcltyClsL === "비산누출시설") {
            const type = this.calcData[i].fcltyClsM;
            if (
              type === "개방식라인" ||
              type === "펌프(비밀폐형)" ||
              type === "압축기" ||
              type === "압력완화장치" ||
              type === "검사용 시료재취장치" ||
              type === "커넥터" ||
              type === "플랜지" ||
              type === "공정배수구" ||
              type === "밸브"
            ) {
              this.vSum_R += this.calcData[i].inputValue
                ? parseInt(this.calcData[i].inputValue)
                : 0;
            }
            if (
              type === "펌프(비밀폐형)" ||
              type === "압축기" ||
              type === "공정배수구" ||
              type === "압력완화장치" ||
              type === "검사용 시료재취장치"
            ) {
              this.vSum_P += this.calcData[i].inputValue
                ? parseInt(this.calcData[i].inputValue)
                : 0;
            }
          }
        }

        let vSum_RC = 5 * Math.sqrt(this.vSum_R);
        let vSum_PC = 0.05 * this.vSum_P;

        if (this.vSum_R <= 500) {
          this.calcData[targetIdx].inputValue = this.vSum_R;
        } else if (vSum_RC > vSum_PC) {
          if (vSum_RC < 500) {
            this.calcData[targetIdx].inputValue = 500;
          } else {
            this.calcData[targetIdx].inputValue = vSum_RC;
          }
        } else if (vSum_RC < vSum_PC) {
          if (vSum_PC < 500) {
            this.calcData[targetIdx].inputValue = 500;
          } else {
            this.calcData[targetIdx].inputValue = vSum_PC;
          }
        }
        this.vSum_R = 0;
        this.vSum_P = 0;
        return;
      } else if (this.calcData[idx + 1].placeholder === "측정대상시설의수") {
        if (
          this.calcData[idx].inputValue === 0 ||
          this.calcData[idx].inputValue === null ||
          this.calcData[idx].inputValue === ""
        ) {
          this.calcData[idx + 1].inputValue = "";
        } else if (this.calcData[idx].inputValue <= 1) {
          this.calcData[idx + 1].inputValue = 1;
        } else {
          this.calcData[idx + 1].inputValue = Math.ceil(
            this.calcData[idx].inputValue * 0.1
          );
        }
        return;
      }
    },
    totalVariable : function (idx){
        //2025-05-15_김현광_4업종일 경우 보고서 항목 계산 값 반영
    	app.totalVar = this.calcData[idx].inputValue;    	
    },
    changeCheckValue: function (idx) {},
    numFormat: new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 5 })
      .format,

    numRound: function (num) {
      return IntFormat(Math.round(num));
    },
    numFloor: function (num) {
      return IntFormat(Math.floor(num / 1000) * 1000);
    },
    getTableData: function (tData, arg) {
      axios
        .post(gbn_getContextPath() + "/tableData.do", {
          status: arg
        })
        .then((res) => {
          let testData = res.data;
		  
		  if(tData == '' || tData == null){
			testData.map((data) => {
				this.result.push({
						  업무대: data.bsnsclsl || "",
						  업무중: data.bsnsclsm || "",
						  시설구분대: data.fcltyclsl || "",
						  시설구분중: data.fcltyclsm || "",
						  시설구분소: data.fcltyclss || "",
						  공량: data.feecalc || "",
						  시설의수: data.fcltyitem || "",
				  SEQ: data.seq || "",
				  [data.bsnscatcd]: data.bsnscatcd || "",
				  bsnscatcd: data.bsnscatcd || "",
				});
				return this.result;
			  });
		  }else{
		  	let bsnscatcd = [];
		  	
			let duplication = tData.filter((review, idx, callback) =>
			  idx === callback.findIndex((review1) => review1.bsnscat === review.bsnscat)
			)
			for(let i = 0; i < duplication.length; i++){
				bsnscatcd.push(duplication[i].bsnscat);
			}
			testData.map((data) => {
				
				if(!bsnscatcd.includes(data.bsnscatcd))  {
					this.result.push({
							  업무대: data.bsnsclsl || "",
							  업무중: data.bsnsclsm || "",
							  시설구분대: data.fcltyclsl || "",
							  시설구분중: data.fcltyclsm || "",
							  시설구분소: data.fcltyclss || "",
							  공량: data.feecalc || "",
							  시설의수: data.fcltyitem || "",
					  SEQ: data.seq || "",
					  [data.bsnscatcd]: data.bsnscatcd || "",
					  bsnscatcd: data.bsnscatcd || "",
					});
				}
				return this.result;
			  });
			  
			  tData.map((data) => {
			  	
			  	if(data.bsnscat == "2-가" || data.bsnscat == "4-가"){
			  		if(data.fcltyclsm == "관리대상물질5wt%미만 도료" || data.fcltyclsm == "야적"){
			  			this.newCrf = "new";
			  		}
			  	}else{
			  		if(data.fcltyclsm == "점검대상 배출시설" || data.feecalc == "0.2339×Check"){
			  			this.newCrf = "new";
			  		}
			  	}
			  	
				this.result.push({
						  업무대: data.bsnsclsl || "",
						  업무중: data.bsnsclsm || "",
						  시설구분대: data.fcltyclsl || "",
						  시설구분중: data.fcltyclsm || "",
						  시설구분소: data.fcltyclss || "",
						  공량: data.feecalc || "",
						  시설의수: data.fcltyitem || "",
				  SEQ: data.seq || "",
				  [data.bsnscat]: data.bsnscat || "",
				  bsnscatcd: data.bsnscat || "",
				});
				return this.result;
			  });			  
		  }
		  
        })
        .catch((error) => {
          console.log(error);
        });
    },
    getSectors: function () {
      let app = this;
      axios
        .get(gbn_getContextPath() + "/sectorsName.do")
        .then(function (res) {
          let dataUrl = "";
          app.seqHist == ""
            ? (dataUrl = "/feeInquiryDetail.do")
            : (dataUrl = "/feeInquiryHistDetail.do");
          app.sectors = res.data;
          axios
            .post(gbn_getContextPath() + dataUrl, {
              rcptNo: app.rcptNo,
              seq: app.seqHist,
            })
            .then((tRow) => {
              if (tRow.data.length !== 0) {
              	app.getTableData(tRow.data, '0');
              	
                app.wages = tRow.data[0].unitwages * 1;
                app.codeDc = app.rcptNo.split("-")[0];
                
                const result = tRow.data.map((row) => {
                  const value = row["feecalc"] + "";
                  const numIdx = value.indexOf("Num");
                  const checkIdx = value.indexOf("Check");
                  const rtnCol = {
                    value: value,
                    bsnscatcd: row.bsnscat || "",
                    bsnsClsL: row.bsnsclsl || "",
                    bsnsClsM: row.bsnsclsm || "",
                    fcltyClsL: row.fcltyclsl || "",
                    fcltyClsM: row.fcltyclsm || "",
                    fcltyClsS: row.fcltyclss || "",
                    feeCalc: row.feecalc || "",
                    fcltyItem: row.fcltyitem || "",
                    fcltyitemnum: row.fcltyitemnum || "",
                    seq: row.seq || "",
                    delYn: "N",
                    unitWages: row.unitwages || "",
                    rcptNo: rcptNo || "",
                  };
                  
                  //2025-05-15_김현광_4업종일 경우 보고서 항목 계산 값 반영
				  if(row.bsnscat == "4-가" && row.bsnsclsl == '보고서'){
				    app.totalVar = row.fcltyitemnum * 1;
				  }

                  if (numIdx > 0) {
                    const evalText = value.replace(/×/gi, "*"); //;.replace(/Num/gi, 0);
                    rtnCol.input = true;
                    rtnCol.inputValue = row.fcltyitemnum
                      ? parseFloat(row.fcltyitemnum)
                      : null;
                    rtnCol.prefix = value.substr(0, numIdx);
                    rtnCol.suffix = value.substr(numIdx + 3);
                    rtnCol.placeholder = row["fcltyitem"];
                    rtnCol.valueFn = (num) => {
                      const Num = num || 0;

                      if (Num === 0) {
                        return 0;
                      } else {
                        const calc = eval(evalText);
                        return calc;
                      }
                    };
                  } else if (checkIdx > 0) {
                    const evalText = value
                      .replace(/×/gi, "*")
                      .replace("Check", "Num");
                    rtnCol.checkBox = true;
                    rtnCol.inputValue = row.fcltyitemnum
                      ? parseInt(row.fcltyitemnum)
                      : 0;
                    rtnCol.prefix = value.substr(0, checkIdx);
                    rtnCol.valueFn = (num) => {
                      const Num = num || 0;
                      if (Num === 0) {
                        return 0;
                      } else {
                        const calc = eval(evalText);
                        return calc;
                      }
                    };
                  } else {
                    if (value === "Total/5" || value === "Total/4") {
                      rtnCol.valueFn = () => 0;
                    } else {
                      rtnCol.valueFn = () => Number(value);
                    }
                  }
                  return rtnCol;
                });
                
                app.atchFileId9 = tRow.data[0].atchfileid9 || null;
                app.atchFileId9Nm = tRow.data[0].atchfileid9nm || null;
                app.feeDepYmd = tRow.data[0].feeDepYmd || null;
                app.email = tRow.data[0].email || null;
                app.cancelReason = tRow.data[0].cancelreason || null;
                // 세금계산서용 추가 금액: 저장된 별도 금액이 있으면 화면 입력값으로 복원한다.
                app.taxInvoiceAddFee = tRow.data[0].taxinvoiceaddfee || tRow.data[0].taxInvoiceAddFee || 0;
                // app.codeDc = tRow.data[0].code;
                
                //2025-01-03_김현광 수수료 할인율 radio button 값 체크
                if(typeof tRow.data[0].discount != 'undefined'){                	
                	let id = tRow.data[0].discount * 1;
                	setTimeout( function(){
					    $('#'+id).prop('checked', true);
					}, 0);
                }else{
                	setTimeout( function(){
                		$('#0').prop('checked', true);
                	}, 0);
                }
                
                result[result.length - 1].valueFn = () => 0;

                const sValue = app.sectors.filter(
                  (e) => e.value === result[0].bsnscatcd
                );

                for (let i = 0; i < app.sectors.length; i++) {
                  let tData = result.filter(
                    (e) => e.bsnscatcd === app.sectors[i].value
                  );
                  let idx = i + 1;
                  if (tData.length !== 0) {
                    app.appSectors.push(tData[0].bsnscatcd);

                    if (idx === 1) app.sectorsData1 = _.cloneDeep(tData);
                    if (idx === 2) app.sectorsData2 = _.cloneDeep(tData);
                    if (idx === 3) app.sectorsData3 = _.cloneDeep(tData);
                    if (idx === 4) app.sectorsData4 = _.cloneDeep(tData);
                    if (idx === 5) app.sectorsData5 = _.cloneDeep(tData);
                  }
                }
                app.selected = sValue[0];
                app.status = tRow.data[0].status;
              } else {
              	app.getTableData('', '1');
                app.status = "4";
                axios
                  .post(gbn_getContextPath() + "/selectedSectors.do", {
                    rcptNo: rcptNo,
                  })
                  .then((result) => {
                    var upjong = result.data.selectedList.split(",");
                    app.wages = result.data.codeNm * 1;
                    app.codeDc = app.rcptNo.split("-")[0];
                    for (let i = 0; i < upjong.length; i++) {
                      if (upjong[i] === "1-가") {
                        app.appSectors.push(res.data[0].value);
                        app.selected = res.data[0];
                      } else if (upjong[i] === "1-나") {
                        app.appSectors.push(res.data[1].value);
                        app.selected = res.data[1];
                      } else if (upjong[i] === "2-가") {
                        app.appSectors.push(res.data[2].value);
                        app.selected = res.data[2];
                      } else if (upjong[i] === "3-가") {
                        app.appSectors.push(res.data[3].value);
                        app.selected = res.data[3];
                      } else {
                        app.appSectors.push(res.data[4].value);
                        app.selected = res.data[4];
                      }
                    }
                  })
                  .catch((error) => {
                    console.log(error);
                  });
              }
            })
            .catch((error) => {
              console.log(error);
            });
        })
        .catch((error) => {
          console.log(error);
        });
    },
    submit: function (arg) {
      //업종별 row length계산
      calcLength: {
        if (this.appSectors.length === 0) {
          return;
        }
        for (let i = 0; i < this.appSectors.length; i++) {
          if (this.appSectors[i] === "1-가") {
            if (this.sectorsData1) {
              const length = this.sectorsData1.length;
              this.rowLengths.rowLength1 = length;
            }
          } else if (this.appSectors[i] === "1-나") {
            if (this.sectorsData2) {
              const length = this.sectorsData2.length;
              this.rowLengths.rowLength2 = length;
            }
          } else if (this.appSectors[i] === "2-가") {
            if (this.sectorsData3) {
              const length = this.sectorsData3.length;
              this.rowLengths.rowLength3 = length;
            }
          } else if (this.appSectors[i] === "3-가") {
            if (this.sectorsData4) {
              const length = this.sectorsData4.length;
              this.rowLengths.rowLength4 = length;
            }
          } else {
            if (this.sectorsData5) {
              const length = this.sectorsData5.length;
              this.rowLengths.rowLength5 = length;
            }
          }
        }
      }

      let data = [];
      let vlaue = arg;
      if (this.appSectors.length !== 0) {
        for (let i = 0; i < this.appSectors.length; i++) {
          if (this.appSectors[i] === "1-가") {
            data.push(this.sectorsData1);
          } else if (this.appSectors[i] === "1-나") {
            data.push(this.sectorsData2);
          } else if (this.appSectors[i] === "2-가") {
            data.push(this.sectorsData3);
          } else if (this.appSectors[i] === "3-가") {
            data.push(this.sectorsData4);
          } else {
            data.push(this.sectorsData5);
          }
        }
      } else {
        alert("최소 1개 이상의 업종을 선택해 주세요.");
        return;
      }

      if (this.status === "5") {
        if (arg === "5") {
          this.status = "4";
          this.submit("5");
          return;
        }

        // 세금계산서용 추가 금액을 더한 최종 금액을 저장한다.
        const baseTotal = this.getBaseGrandTotalForSave();
        const total = this.getFinalGrandTotalTextForSave();
        const taxInvoiceAddFee = this.getTaxInvoiceAddFeeForSave();

        if (baseTotal === 0) {
          alert("모든 탭을 확인해 주세요.");
          return;
        }

        let email = this.email;
        let uploadFile = this.$refs.fileInput.$refs.fileInput;
        var frm = new FormData();


        if (!email) {
          alert("이메일을 입력해 주세요.");
          return;
        }
        
        if (uploadFile.files[0]) {
          frm.append("fAtchFileId9", uploadFile.files[0]);
        }
        frm.append("rcptNo", rcptNo);
        frm.append("email", email);
        frm.append("grandTotal", total);
        frm.append("taxInvoiceAddFee", taxInvoiceAddFee);

        axios
          .post(gbn_getContextPath() + "/feesFileUpload.do", frm, {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          })
          .then((res) => {
            alert("요청이 정상적으로 처리되었습니다.");
            location.href = gbn_getContextPath() + "/feesCalBoard.do";
          })
          .catch((error) => {
            alert("요청을 처리하던 중 오류가 발생했습니다.");
            console.log(error);
          });
      } else if (this.status === "6") {
        // 세금계산서용 추가 금액을 더한 최종 금액을 입금 확인 금액으로 저장한다.
        const total = this.getFinalGrandTotalTextForSave();
        const taxInvoiceAddFee = this.getTaxInvoiceAddFeeForSave();

        if (this.feeDepYmd === "" || this.feeDepYmd === null) {
          alert("수수료 입금 일자를 입력해 주세요.");
          return;
        }

        axios
          .post(gbn_getContextPath() + "/updateFeeDepYmd.do", {
            rcptNo: rcptNo,
            feeDepYmd: this.feeDepYmd.replace(/[^0-9]/g, ""),
            grandTotal: total,
            taxInvoiceAddFee: taxInvoiceAddFee,
          })
          .then((res) => {
            alert("요청이 정상적으로 처리되었습니다.");
            location.href = gbn_getContextPath() + "/feesCalBoard.do";
          })
          .catch((error) => {
            console.log(error);
          });
      } else {
        // 세금계산서용 추가 금액을 더한 최종 금액을 수수료 총액으로 저장한다.
        const baseTotal = this.getBaseGrandTotalForSave();
        const total = this.getFinalGrandTotalTextForSave();
        const taxInvoiceAddFee = this.getTaxInvoiceAddFeeForSave();

        if (baseTotal === 0) {
          alert("모든 탭을 확인해 주세요.");
          return;
        }
        
        let discount = $("input[name='discount']:checked").val();
        if (!mngNo && typeof discount == 'undefined' && this.isShow) {
          alert("수수료 할인율을 선택해 주세요.");
          return;
        }else if(!this.isShow){
        	discount = 0;
        }
		
        // total row length 계산
        const ttlrw =
          this.rowLengths.rowLength1 +
          this.rowLengths.rowLength2 +
          this.rowLengths.rowLength3 +
          this.rowLengths.rowLength4 +
          this.rowLengths.rowLength5;

        axios
          .post(gbn_getContextPath() + "/feesCalInsert.do", {
            ttlrw: ttlrw,
            tabs: data,
            status: vlaue,
            rcptNo: rcptNo,
            grandTotal: total,
            taxInvoiceAddFee: taxInvoiceAddFee,
            unitWages: this.wages,
            discount: discount,
          })
          .then((res) => {
            alert(res.data);
            location.href = gbn_getContextPath() + "/feesCalBoard.do";
          })
          .catch((error) => {
            alert("저장이 실패했습니다. 삭제 후 다시 시도해 주세요.");
            console.log(error);
          });
      }
    },
    fn_showHist() {
      window.open(
        gbn_getContextPath() + "/feesCalHistBoard.do?rcptNo=" + rcptNo,
        "수수료산정 이력",
        "width=1200, height=900"
      );
    },
    fn_recalculation: function (arg) {
      let reason = $("#cancelReason").val();

      if (cancelReason != "" && cancelReason != null) {
        axios
          .post(gbn_getContextPath() + "/feesCalRecalculation.do", {
            status: arg,
            rcptNo: rcptNo,
            reason: reason,
          })
          .then((res) => {
            alert(res.data);
            location.href = gbn_getContextPath() + "/feesCalBoard.do";
          })
          .catch((error) => {
            console.log(error);
          });
      } else {
        alert("사유를 입력해 주세요");
        return;
      }
    },
    fn_revertState: function (arg) {
      axios
        .post(gbn_getContextPath() + "/revertState.do", {
          status: arg,
          rcptNo: rcptNo,
        })
        .then((res) => {
          alert(res.data);
          location.href = gbn_getContextPath() + "/applyStatus.do";
        })
        .catch((error) => {
          console.log(error);
        });
    },
    fn_modal: function (arg) {
      if (arg === "0") {
        $("#modal1").show();
      } else {
        $("#modal1").hide();
      }
    },
    fn_downFile: function () {
      /*
      window.open(
        gbn_getContextPath() +
          "/FileDown.do?atchFileId=" +
          this.atchFileId9 +
          "&fileSn=" +
          0
      );
      */

      var ifm = document.createElement("iframe");
      var tempInfoForm = document.createElement("form");
      tempInfoForm.name = "tempInfoView";
      tempInfoForm.action = gbn_getContextPath() + "/FileDown.do";
      tempInfoForm.method = "POST";
      tempInfoForm.target = "ifm";

      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "atchFileId";
      input.value = this.atchFileId9;
      tempInfoForm.appendChild(input);

      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "fileSn";
      input.value = "0";
      tempInfoForm.appendChild(input);
      //최종 만들어진form 생성
      document.body.appendChild(tempInfoForm);
      tempInfoForm.submit();
    },
    updateDate: function (d) {
      this.feeDepYmd = d;
    },
    reset: function (arg) {
      axios
        .post(gbn_getContextPath() + "/feesCalReset.do", {
          status: arg,
          rcptNo: rcptNo,
        })
        .then((res) => {
          alert(res.data);
          location.href = gbn_getContextPath() + "/feesCalBoard.do";
        })
        .catch((error) => {
          console.log(error);
        });
    },
  },
});
