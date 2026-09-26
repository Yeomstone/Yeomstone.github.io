(function() {
  // 예상 수수료 계산 추가
  var IntFormat = new Intl.NumberFormat("ko-KR").format;
  var tableKeys = ["bsnsClsL", "bsnsClsM", "fcltyClsL", "fcltyClsM", "fcltyClsS"];

  function emptyCalcValue() {
    return {
      totalCost: 0,
      laborCosts: 0,
      expenses: 0,
      otherCost: 0,
      fee: 0,
      costTotal: 0,
      vat: 0,
      grandTotal: 0
    };
  }

  function getValue(row, camelKey) {
    if (!row) {
      return "";
    }
    var lowerKey = camelKey.toLowerCase();
    if (row[camelKey] !== undefined && row[camelKey] !== null) {
      return row[camelKey];
    }
    if (row[lowerKey] !== undefined && row[lowerKey] !== null) {
      return row[lowerKey];
    }
    return "";
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }
    var parsed = Number(String(value).replace(/,/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }

  function normalizeLabel(value) {
    return String(value || "")
      .replace(/\s/g, "")
      .replace(/[·ㆍ.]/g, "");
  }

  function isSector4EcoPaintRow(row) {
    var sector = getValue(row, "bsnscatcd") || getValue(row, "bsnsCatCd") || getValue(row, "bsnsCat");
    var large = normalizeLabel(getValue(row, "fcltyClsL"));
    var middle = normalizeLabel(getValue(row, "fcltyClsM"));
    return sector === "4-가" &&
      (large.indexOf("친환경도료") > -1 ||
        middle.indexOf("친환경도료") > -1 ||
        middle.indexOf("관리대상물질5wt%미만도료") > -1);
  }

  function getTableDisplayValue(row, key) {
    if (isSector4EcoPaintRow(row)) {
      if (key === "fcltyClsL") {
        return "친환경도료";
      }
      if (key === "fcltyClsM" || key === "fcltyClsS") {
        return "";
      }
    }
    return getValue(row, key);
  }


  function floorToThousand(value) {
    return Math.floor(toNumber(value) / 1000) * 1000;
  }

  function makeSelectedTableData(filterdData) {
    var tableData = filterdData.reduce(function(acc, curr) {
      var row = tableKeys.map(function(key) {
        return {
          value: getTableDisplayValue(curr, key),
          colspan: 1,
          rowspan: 1
        };
      });
      acc.push(row);
      return acc;
    }, []);

    for (var i = tableData.length - 1; i > 0; i--) {
      var currRow = tableData[i];
      var prevRow = tableData[i - 1];
      currRow.forEach(function(col, j) {
        if (j > 0) {
          if (col.value === prevRow[j].value && currRow[j - 1].value === prevRow[j - 1].value) {
            prevRow[j].rowspan += col.rowspan;
            col.rowspan = 0;
          }
        } else if (col.value === prevRow[j].value) {
          prevRow[j].rowspan += col.rowspan;
          col.rowspan = 0;
        }
      });
    }

    tableData.forEach(function(row) {
      for (var i = row.length - 1; i > 0; i--) {
        if (!row[i].value) {
          row[i - 1].colspan += row[i].colspan;
          row[i].colspan = 0;
        }
      }
    });

    return tableData.map(function(row) {
      return row.filter(function(col) {
        return col.colspan > 0 && col.rowspan > 0;
      });
    });
  }

  function buildFormula(expression) {
    var normalized = String(expression || "")
      .replace(/×/g, "*")
      .replace(/횞/g, "*")
      .replace(/Check/g, "Num");

    if (normalized.indexOf("Total") > -1) {
      return function() {
        return 0;
      };
    }

    if (normalized.indexOf("Num") < 0) {
      var fixedValue = toNumber(normalized);
      return function() {
        return fixedValue;
      };
    }

    normalized = normalized.replace(/Num/g, "n");
    if (!/^[0-9+\-*/().\s*n]+$/.test(normalized)) {
      return function() {
        return 0;
      };
    }

    return function(num) {
      var n = toNumber(num);
      if (n === 0) {
        return 0;
      }
      try {
        var value = Function("n", "return " + normalized)(n);
        return isNaN(value) ? 0 : value;
      } catch (e) {
        return 0;
      }
    };
  }

  new Vue({
    el: "#selfFeeCalc",
    data: {
      calcYear: "",
      result: [],
      sectors: [],
      appSectors: [],
      // 수수료 예측: 목업 구조에 맞춰 예측 탭을 첫 화면으로 표시한다.
      activeMainTab: "forecast",
      selected: {},
      sectorCalcData: {},
      calculationRevision: 0,
      wages: 0,
      totalVar: 4,
      // 수수료 예측: 최근 실제 수수료 산정 기준값을 현재 입력값 비교에 사용한다.
      forecastBaseRcptNo: "",
      forecastBaseTotalFee: "",
      forecastBaseTaxInvoiceAddFee: "",
      forecastBaseUnitWages: "",
      forecastBaseFeeDepYmd: "",
      forecastBaseRows: [],
      // 세금계산서용 추가 금액: 셀프 계산에서도 차기 예상 수수료에 별도 수동 금액을 더한다.
      taxInvoiceAddFee: 0,
      // Ⅱ업종 사전 입력 팝업: 시설수와 플레어스택 총발열량 선택값을 계산표 입력 전에 보관한다.
      sector2PreInputApplied: false,
      sector2PreInputPopup: {
        visible: false,
        dust: {
          yard: "",
          loading: "",
          transport: "",
          transfer: ""
        },
        flare: "none"
      },
      // Ⅳ업종 사전 입력 팝업: 친환경도료 해당 여부를 계산표 입력 전에 보관한다.
      sector4PreInputApplied: false,
      sector4PreInputPopup: {
        visible: false,
        ecoPaint: "notApplied"
      }
    },
    watch: {
      sectorCalcData: {
        deep: true,
        handler: function() {
          this.calculationRevision += 1;
        }
      },
      appSectors: function(newValue) {
        var self = this;
        newValue.forEach(function(value) {
          self.ensureSectorData(value);
        });

        if (!this.selected || newValue.indexOf(this.selected.value) < 0) {
          this.selected = this.tabs.length > 0 ? this.tabs[0] : {};
        }
      },
      selected: function(newValue) {
        // 사전 입력 팝업: 업종 탭 변경 시 해당 업종 계산 화면이면 팝업을 표시한다.
        this.openSector2PreInputPopupIfNeeded(newValue);
        this.openSector4PreInputPopupIfNeeded(newValue);
      }
    },
    created: function() {
      this.loadData("");
    },
    computed: {
      tabs: function() {
        var checked = this.appSectors;
        return this.sectors.filter(function(sector) {
          return checked.indexOf(sector.value) > -1;
        });
      },
      filterdData: function() {
        var selectedValue = this.selected ? this.selected.value : "";
        if (!selectedValue) {
          return [];
        }
        return this.result.filter(function(row) {
          return row.bsnscatcd === selectedValue;
        });
      },
      tableData: function() {
        return makeSelectedTableData(this.filterdData);
      },
      calcData: function() {
        if (!this.selected || !this.selected.value) {
          return [];
        }
        return this.ensureSectorData(this.selected.value);
      },
      totalData: function() {
        if (!this.selected || !this.selected.value) {
          return 0;
        }
        return this.getSectorTotalData(this.selected.value);
      },
      calcValue: function() {
        if (!this.selected || !this.selected.value) {
          return emptyCalcValue();
        }
        return this.getSectorCalcValue(this.selected.value);
      },
      totalCalcValue: function() {
        this.calculationRevision;
        var total = emptyCalcValue();
        for (var i = 0; i < this.appSectors.length; i++) {
          var value = this.getSectorCalcValue(this.appSectors[i]);
          total.totalCost += value.totalCost;
          total.laborCosts += value.laborCosts;
          total.expenses += value.expenses;
          total.otherCost += value.otherCost;
          total.fee += value.fee;
          total.costTotal += value.costTotal;
          total.vat += value.vat;
          total.grandTotal += value.grandTotal;
        }
        return total;
      },
      // 수수료 예측: 비교 조건 영역에 표시할 기준 문구를 계산한다.
      forecastCompareYearText: function() {
        return "과거: 실제 3년 전 마지막 수수료 산정 데이터 / 차기: 현재 예상 수수료";
      },
      forecastBaseBasisText: function() {
        if (!this.hasForecastBase) {
          return "과거 수수료 산정 데이터 없음";
        }
        if (this.forecastBaseFeeDepYmd) {
          return "과거 수수료 산정 데이터(" + this.forecastBaseFeeDepYmd + ")";
        }
        return "과거 수수료 산정 데이터";
      },
      forecastNextBasisText: function() {
        return this.appSectors.length === 0 ? "업종 선택 후 계산" : "셀프 수수료 계산 입력값 기준";
      },
      forecastUnitWagesBasisText: function() {
        return this.calcYear ? this.calcYear + "년 기준 임금단가" : "현재 기준 임금단가";
      },
      // 수수료 예측: 현재 입력값으로 계산된 차기 표시용 예상 수수료이다.
      forecastNextTotal: function() {
        this.calculationRevision;
        return this.getFinalGrandTotalForSave();
      },
      totalGrandTotalWithTaxInvoiceAddFee: function() {
        return this.getFinalGrandTotalForSave();
      },
      calcGrandTotalWithTaxInvoiceAddFee: function() {
        // 세금계산서용 추가 금액: 현재 선택된 산정내역 표의 예상 수수료에도 추가 금액을 합산해 표시한다.
        return floorToThousand(this.calcValue.grandTotal) + this.getTaxInvoiceAddFeeForSave();
      },
      hasForecastBase: function() {
        return this.forecastBaseTotalFee !== "" && this.forecastBaseTotalFee !== null && this.forecastBaseTotalFee !== undefined;
      },
      forecastBaseFeeText: function() {
        if (!this.hasForecastBase) {
          return "비교 기준 없음";
        }
        return this.formatForecastWon(this.forecastBaseTotalFee);
      },
      forecastNextFeeText: function() {
        if (this.appSectors.length === 0) {
          return "계산 전";
        }
        return this.formatForecastWon(this.forecastNextTotal);
      },
      forecastChangeText: function() {
        if (!this.hasForecastBase || this.appSectors.length === 0) {
          return "비교 불가";
        }

        var diff = this.getForecastFeeDiff();
        if (diff === 0) {
          return "유사 수준 (0 원)";
        }
        return diff > 0 ? "증가 예상 (" + this.formatForecastSignedWon(diff) + ")" : "감소 예상 (" + this.formatForecastSignedWon(diff) + ")";
      },
      forecastChangeClass: function() {
        var diff = this.getForecastFeeDiff();
        if (diff > 0) {
          return "increase";
        }
        if (diff < 0) {
          return "decrease";
        }
        return "neutral";
      },
      forecastReasons: function() {
        this.calculationRevision;
        if (!this.hasForecastBase) {
          return ["이전 실제 산정 총액이 없어 현재 입력값 기준의 예상 수수료만 표시합니다."];
        }
        if (this.appSectors.length === 0) {
          return ["업종을 선택하면 현재 예상 수수료와 변동 사유가 표시됩니다."];
        }

        var reasons = [];
        var diff = this.getForecastFeeDiff();
        if (diff !== 0) {
          var direction = diff > 0 ? "증가" : "감소";
          reasons.push("과거 산정 수수료 " + this.formatForecastWon(this.forecastBaseTotalFee) + " 대비 차기 예상 수수료 " + this.formatForecastWon(this.forecastNextTotal) + "으로 " + this.formatForecastSignedWon(diff) + " " + direction + "합니다.");
        }

        reasons = reasons.concat(this.getForecastSectorChangeReasons());
        reasons = reasons.concat(this.getForecastInputChangeReasons());
        reasons = reasons.concat(this.getForecastFormulaChangeReasons());
        reasons = reasons.concat(this.getTaxInvoiceAddFeeChangeReasons());

        var wageReason = this.getForecastWageChangeReason();
        if (wageReason) {
          reasons.push(wageReason);
        }
        if (reasons.length === 0) {
          reasons.push("수수료 변동 사항이 없습니다.");
        }
        return reasons;
      }
    },
    methods: {
      changeMainTab: function(tabName) {
        // 수수료 예측: 목업의 메인 탭 전환 동작을 Vue 상태로 제어한다.
        this.activeMainTab = tabName;
        this.openSector2PreInputPopupIfNeeded(this.selected);
        this.openSector4PreInputPopupIfNeeded(this.selected);
      },
      isSector2Tab: function(tab) {
        return tab && tab.value === "2-가";
      },
      isSector4Tab: function(tab) {
        return tab && tab.value === "4-가";
      },
      openSector2PreInputPopupIfNeeded: function(tab) {
        // Ⅱ업종 사전 입력 팝업: 수수료 계산 탭에서 Ⅱ업종 최초 진입 시 한 번만 표시한다.
        if (this.activeMainTab !== "calc" || !this.isSector2Tab(tab) || this.sector2PreInputApplied) {
          return;
        }
        this.initSector2PreInputPopup();
        this.sector2PreInputPopup.visible = true;
      },
      openSector4PreInputPopupIfNeeded: function(tab) {
        // Ⅳ업종 사전 입력 팝업: 수수료 계산 탭에서 Ⅳ업종 최초 진입 시 한 번만 표시한다.
        if (this.activeMainTab !== "calc" || !this.isSector4Tab(tab) || this.sector4PreInputApplied) {
          return;
        }
        this.initSector4PreInputPopup();
        this.sector4PreInputPopup.visible = true;
      },
      initSector2PreInputPopup: function() {
        // Ⅱ업종 사전 입력 팝업: 이미 입력된 계산표 값이 있으면 팝업 기본값으로 다시 보여준다.
        var rows = this.ensureSectorData("2-가");
        this.sector2PreInputPopup.dust.yard = this.getPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "야적");
        });
        this.sector2PreInputPopup.dust.loading = this.getPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "싣기내리기");
        });
        this.sector2PreInputPopup.dust.transport = this.getPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "수송");
        });
        this.sector2PreInputPopup.dust.transfer = this.getPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "이송");
        });

        var appliedItem = this.findCalcItem(rows, function(item) {
          return this.isSector2FlareItem(item, "총발열량 적용");
        });
        var notAppliedItem = this.findCalcItem(rows, function(item) {
          return this.isSector2FlareItem(item, "총발열량 미적용");
        });

        if (appliedItem && toNumber(appliedItem.inputValue) > 0) {
          this.sector2PreInputPopup.flare = "applied";
        } else if (notAppliedItem && toNumber(notAppliedItem.inputValue) > 0) {
          this.sector2PreInputPopup.flare = "notApplied";
        } else {
          this.sector2PreInputPopup.flare = "none";
        }
      },
      initSector4PreInputPopup: function() {
        // Ⅳ업종 사전 입력 팝업: 이미 입력된 친환경도료 값이 있으면 팝업 기본값으로 다시 보여준다.
        var rows = this.ensureSectorData("4-가");
        var ecoPaintItem = this.findCalcItem(rows, function(item) {
          return this.isSector4EcoPaintItem(item);
        });

        this.sector4PreInputPopup.ecoPaint = ecoPaintItem && toNumber(ecoPaintItem.inputValue) > 0 ? "applied" : "notApplied";
      },
      getPopupInputValue: function(rows, matcher) {
        var item = this.findCalcItem(rows, matcher);
        if (!item || item.inputValue === null || item.inputValue === undefined || item.inputValue === "") {
          return "";
        }
        return toNumber(item.inputValue);
      },
      findCalcItem: function(rows, matcher) {
        for (var i = 0; i < rows.length; i++) {
          if (matcher.call(this, rows[i])) {
            return rows[i];
          }
        }
        return null;
      },
      isSector2DustItem: function(item, targetName) {
        return item.bsnscatcd === "2-가" &&
          normalizeLabel(item.fcltyClsL) === normalizeLabel("비산먼지 배출시설") &&
          normalizeLabel(item.fcltyClsM) === normalizeLabel(targetName);
      },
      isSector2FlareItem: function(item, targetName) {
        var large = normalizeLabel(item.fcltyClsL);
        var middle = normalizeLabel(item.fcltyClsM);
        return item.bsnscatcd === "2-가" &&
          large.indexOf("플레어스") > -1 &&
          middle === normalizeLabel(targetName);
      },
      isSector4EcoPaintItem: function(item) {
        return isSector4EcoPaintRow(item);
      },
      parsePopupFacilityCount: function(value, label) {
        if (value === "" || value === null || value === undefined) {
          return "";
        }
        var numberValue = toNumber(value);
        if (numberValue < 0 || Math.floor(numberValue) !== numberValue) {
          alert(label + " 시설수는 0 이상의 정수로 입력해 주세요.");
          return null;
        }
        if (String(numberValue).length >= 7) {
          alert(label + " 시설수는 최대 6자리까지 입력 가능합니다.");
          return null;
        }
        return numberValue;
      },
      applyPopupInputValue: function(rows, matcher, value, label, missingLabels) {
        if (value === "") {
          return;
        }
        var item = this.findCalcItem(rows, matcher);
        if (!item) {
          missingLabels.push(label);
          return;
        }
        this.$set(item, "inputValue", value);
      },
      applySector2PreInputPopup: function() {
        // Ⅱ업종 사전 입력 팝업: 확인 시 팝업 입력값을 기존 산정 row의 inputValue에 반영한다.
        var rows = this.ensureSectorData("2-가");
        var missingLabels = [];
        var dust = this.sector2PreInputPopup.dust;
        var yard = this.parsePopupFacilityCount(dust.yard, "야적");
        var loading = this.parsePopupFacilityCount(dust.loading, "싣기·내리기");
        var transport = this.parsePopupFacilityCount(dust.transport, "수송");
        var transfer = this.parsePopupFacilityCount(dust.transfer, "이송");

        if (yard === null || loading === null || transport === null || transfer === null) {
          return;
        }

        this.applyPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "야적");
        }, yard, "비산먼지 배출시설-야적", missingLabels);
        this.applyPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "싣기내리기");
        }, loading, "비산먼지 배출시설-싣기·내리기", missingLabels);
        this.applyPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "수송");
        }, transport, "비산먼지 배출시설-수송", missingLabels);
        this.applyPopupInputValue(rows, function(item) {
          return this.isSector2DustItem(item, "이송");
        }, transfer, "비산먼지 배출시설-이송", missingLabels);

        if (this.sector2PreInputPopup.flare === "applied" || this.sector2PreInputPopup.flare === "notApplied") {
          this.applyPopupInputValue(rows, function(item) {
            return this.isSector2FlareItem(item, "총발열량 적용");
          }, this.sector2PreInputPopup.flare === "applied" ? 1 : 0, "플레어스택-총발열량 적용", missingLabels);
          this.applyPopupInputValue(rows, function(item) {
            return this.isSector2FlareItem(item, "총발열량 미적용");
          }, this.sector2PreInputPopup.flare === "notApplied" ? 1 : 0, "플레어스택-총발열량 미적용", missingLabels);
        }

        this.sector2PreInputApplied = true;
        this.sector2PreInputPopup.visible = false;

        if (missingLabels.length > 0) {
          alert("다음 기준 항목이 조회되지 않아 팝업 입력값을 반영하지 못했습니다.\n- " + missingLabels.join("\n- ") + "\n기준자료 USE_YN 및 Ⅱ업종 매핑을 확인해 주세요.");
        }
      },
      applySector4PreInputPopup: function() {
        // Ⅳ업종 사전 입력 팝업: 확인 시 친환경도료 해당 여부를 기존 산정 row의 inputValue에 반영한다.
        var rows = this.ensureSectorData("4-가");
        var missingLabels = [];

        this.applyPopupInputValue(rows, function(item) {
          return this.isSector4EcoPaintItem(item);
        }, this.sector4PreInputPopup.ecoPaint === "applied" ? 1 : 0, "친환경도료", missingLabels);

        this.sector4PreInputApplied = true;
        this.sector4PreInputPopup.visible = false;

        if (missingLabels.length > 0) {
          alert("다음 기준 항목이 조회되지 않아 팝업 입력값을 반영하지 못했습니다.\n- " + missingLabels.join("\n- ") + "\n기준자료 USE_YN 및 Ⅳ업종 매핑을 확인해 주세요.");
        }
      },
      getBaseGrandTotalForSave: function() {
        // 세금계산서용 추가 금액과 분리하기 위해 기본 산정 수수료만 천원 단위로 절사한다.
        return floorToThousand(this.totalCalcValue.grandTotal);
      },
      getTaxInvoiceAddFeeForSave: function() {
        // 세금계산서용 추가 금액은 숫자 컬럼 기준으로 콤마 없는 숫자만 사용한다.
        return toNumber(this.taxInvoiceAddFee);
      },
      getFinalGrandTotalForSave: function() {
        return this.getBaseGrandTotalForSave() + this.getTaxInvoiceAddFeeForSave();
      },
      updateTaxInvoiceAddFee: function(value) {
        // 사용자가 입력한 세금계산서용 추가 금액은 숫자만 보관하고 화면에서는 콤마 포맷으로 표시한다.
        this.taxInvoiceAddFee = String(value || "").replace(/[^0-9]/g, "");
      },
      formatTaxInvoiceAddFee: function(value) {
        var numberValue = toNumber(value);
        return numberValue === 0 ? "" : IntFormat(numberValue);
      },
      getForecastFeeDiff: function() {
        // 세금계산서용 추가 금액까지 포함한 실제 표시 금액 기준으로 예상 증감액을 계산한다.
        if (!this.hasForecastBase || this.appSectors.length === 0) {
          return 0;
        }
        return toNumber(this.forecastNextTotal) - toNumber(this.forecastBaseTotalFee);
      },
      formatForecastWon: function(value) {
        return IntFormat(toNumber(value)) + " 원";
      },
      formatForecastSignedWon: function(value) {
        var numberValue = toNumber(value);
        if (numberValue === 0) {
          return "0 원";
        }
        return (numberValue > 0 ? "+" : "-") + IntFormat(Math.abs(numberValue)) + " 원";
      },
      formatForecastNumber: function(value) {
        return IntFormat(toNumber(value));
      },
      getSectorText: function(value) {
        for (var i = 0; i < this.sectors.length; i++) {
          if (this.sectors[i].value === value) {
            return this.sectors[i].text;
          }
        }
        return value;
      },
      getForecastSectorChangeReasons: function() {
        // 수수료 예측: 이전 실제 산정 업종과 현재 선택 업종의 추가/제외 사실만 표시한다.
        var baseValues = this.getForecastBaseSectorValues().sort();
        var currentValues = this.appSectors.slice().sort();
        var reasons = [];
        var added = [];
        var removed = [];

        if (baseValues.length === 0) {
          return reasons;
        }

        for (var i = 0; i < currentValues.length; i++) {
          if (baseValues.indexOf(currentValues[i]) < 0) {
            added.push(this.getSectorText(currentValues[i]));
          }
        }
        for (var j = 0; j < baseValues.length; j++) {
          if (currentValues.indexOf(baseValues[j]) < 0) {
            removed.push(this.getSectorText(baseValues[j]));
          }
        }

        if (added.length > 0) {
          reasons.push("현재 선택 업종에 " + added.join(", ") + "이(가) 추가되었습니다.");
        }
        if (removed.length > 0) {
          reasons.push("과거 수수료 산정 업종 중 " + removed.join(", ") + "이(가) 현재 선택에서 제외되었습니다.");
        }
        return reasons;
      },
      getForecastBaseMap: function() {
        var baseMap = {};
        this.forecastBaseRows.forEach(function(row) {
          if (row.savedBsnsCat && row.seq !== "") {
            baseMap[row.savedBsnsCat + "|" + row.seq] = row;
          }
        });
        return baseMap;
      },

      getForecastInputChangeReasons: function() {
        // 수수료 예측: 이전 실제 입력값과 현재 입력값이 모두 비교 가능한 항목만 구체 사유로 표시한다.
        var reasons = [];
        var hiddenCount = 0;
        var maxReasons = 10;
        var baseMap = this.getForecastBaseMap();

        for (var i = 0; i < this.appSectors.length; i++) {
          var rows = this.ensureSectorData(this.appSectors[i]);
          for (var j = 0; j < rows.length; j++) {
            var item = rows[j];
            var base = baseMap[item.bsnscatcd + "|" + item.seq];
            var currentRaw = item.inputValue;
            if (!base) {
              // 수수료 변동 사유: 이전 실제 산정에 없던 신규 항목도 입력값이 있으면 사유에 표시한다.
              if (!this.hasMeaningfulForecastInput(item, currentRaw)) {
                continue;
              }
              if (reasons.length >= maxReasons) {
                hiddenCount++;
                continue;
              }
              reasons.push(this.getForecastNewInputReasonText(item, currentRaw));
              continue;
            }

            var baseItemNum = base.forecastBaseFcltyItemNum !== "" && base.forecastBaseFcltyItemNum !== null && base.forecastBaseFcltyItemNum !== undefined ? base.forecastBaseFcltyItemNum : base.fcltyItemNum;
            if ((baseItemNum === "" || baseItemNum === null || baseItemNum === undefined) && (currentRaw === "" || currentRaw === null || currentRaw === undefined)) {
              continue;
            }

            var baseCompareValue = this.getForecastComparableInputValue(baseItemNum);
            var currentCompareValue = this.getForecastComparableInputValue(currentRaw);
            if (baseCompareValue === currentCompareValue) {
              continue;
            }

            if (reasons.length >= maxReasons) {
              hiddenCount++;
              continue;
            }

            var baseValue = baseItemNum === "" || baseItemNum === null || baseItemNum === undefined ? "" : toNumber(baseItemNum);
            var currentValue = currentRaw === "" || currentRaw === null || currentRaw === undefined ? "" : toNumber(currentRaw);
            var reasonText = this.getForecastInputReasonText(item, baseValue, currentValue);
            if (reasonText) {
              reasons.push(reasonText);
            }
          }
        }

        if (hiddenCount > 0) {
          reasons.push("그 외 입력값이 달라진 산정 항목이 " + hiddenCount + "건 더 있습니다.");
        }
        return reasons;
      },
      getForecastInputReasonText: function(item, baseValue, currentValue) {
        var label = this.getForecastItemLabel(item);
        var isCheckItem = item.checkBox || String(item.feeCalc || "").indexOf("Check") > -1;
        var baseText = this.formatForecastInputValue(baseValue, isCheckItem);
        var currentText = this.formatForecastInputValue(currentValue, isCheckItem);

        if (isCheckItem) {
          return label + " 적용 여부가 " + baseText + "에서 " + currentText + "으로 변경되었습니다.";
        }

        var diff = toNumber(currentValue) - toNumber(baseValue);
        if (diff === 0) {
          return "";
        }
        var direction = diff > 0 ? "증가" : "감소";
        var diffText = (diff > 0 ? "+" : "-") + this.formatForecastNumber(Math.abs(diff));
        return label + " 입력값이 " + baseText + "에서 " + currentText + "으로 " + diffText + " " + direction + "했습니다.";
      },
      getForecastComparableInputValue: function(value) {
        // 수수료 변동 사유: 미입력과 0은 산정 결과가 같으므로 같은 값으로 비교한다.
        return toNumber(value);
      },
      hasMeaningfulForecastInput: function(item, value) {
        if (value === "" || value === null || value === undefined) {
          return false;
        }
        return toNumber(value) > 0;
      },
      getForecastNewInputReasonText: function(item, currentValue) {
        var label = this.getForecastItemLabel(item);
        var isCheckItem = item.checkBox || String(item.feeCalc || "").indexOf("Check") > -1;
        var currentText = this.formatForecastInputValue(currentValue, isCheckItem);

        if (isCheckItem) {
          return label + " 항목이 신규 추가되어 적용되었습니다.";
        }
        return label + " 항목이 신규 추가되어 입력값 " + currentText + "이(가) 반영되었습니다.";
      },
      formatForecastInputValue: function(value, isCheckItem) {
        if (value === "" || value === null || value === undefined) {
          return "미입력";
        }
        if (isCheckItem) {
          return toNumber(value) > 0 ? "적용" : "미적용";
        }
        return this.formatForecastNumber(value);
      },
      getForecastFormulaChangeReasons: function() {
        // 산식 원문은 노출하지 않고, 산정기준 변경이 금액 변동에 반영된 사실만 표시한다.
        var formulaChanged = false;
        for (var i = 0; i < this.forecastBaseRows.length; i++) {
          var row = this.forecastBaseRows[i];
          if (!row.forecastBaseFeeCalc || !row.feeCalc || row.forecastBaseFeeCalc === row.feeCalc) {
            continue;
          }
          formulaChanged = true;
          break;
        }

        if (!formulaChanged || this.getForecastFeeDiff() === 0) {
          return [];
        }
        return ["수수료 산정기준 변경이 차기 예상 수수료 계산에 반영되었습니다."];
      },
      getTaxInvoiceAddFeeChangeReasons: function() {
        // 세금계산서용 추가 금액이 있으면 예상 수수료 변동 사유에 명시한다.
        var addFee = this.getTaxInvoiceAddFeeForSave();
        if (addFee === 0) {
          return [];
        }
        return ["세금계산서용 추가 금액 " + this.formatForecastWon(addFee) + "이 차기 예상 수수료에 반영되었습니다."];
      },
      getForecastWageChangeReason: function() {
        // 수수료 예측: 임금단가가 실제로 다른 경우에만 변경 사유로 표시한다.
        if (!this.forecastBaseUnitWages || toNumber(this.forecastBaseUnitWages) === toNumber(this.wages)) {
          return "";
        }
        var diff = toNumber(this.wages) - toNumber(this.forecastBaseUnitWages);
        var direction = diff > 0 ? "증가" : "감소";
        var diffText = (diff > 0 ? "+" : "-") + this.formatForecastNumber(Math.abs(diff)) + " 원";
        return "기술자 임금단가가 " + this.formatForecastNumber(this.forecastBaseUnitWages) + " 원에서 " + this.formatForecastNumber(this.wages) + " 원으로 " + diffText + " " + direction + "했습니다.";
      },
      getForecastItemLabel: function(row) {
        var parts = [];
        var keys = ["bsnsClsL", "bsnsClsM", "fcltyClsL", "fcltyClsM", "fcltyClsS", "fcltyItem"];
        for (var i = 0; i < keys.length; i++) {
          var value = getTableDisplayValue(row, keys[i]);
          if (value && parts.indexOf(value) < 0) {
            parts.push(value);
          }
        }
        return parts.length > 0 ? parts.join(" > ") : "산정 항목";
      },
      normalizeRows: function(rows) {
        return (rows || []).map(function(row) {
          var bsnsCatCd = getValue(row, "bsnsCatCd") || getValue(row, "bsnsCat") || "";
          return {
            bsnsClsL: getValue(row, "bsnsClsL"),
            bsnsClsM: getValue(row, "bsnsClsM"),
            fcltyClsL: getValue(row, "fcltyClsL"),
            fcltyClsM: getValue(row, "fcltyClsM"),
            fcltyClsS: getValue(row, "fcltyClsS"),
            feeCalc: getValue(row, "feeCalc"),
            fcltyItemNum: getValue(row, "fcltyItemNum"),
            fcltyItem: getValue(row, "fcltyItem"),
            seq: getValue(row, "seq"),
            savedBsnsCat: getValue(row, "savedBsnsCat"),
            bsnscatcd: bsnsCatCd,
            bsnsCatCd: bsnsCatCd,
            // 수수료 예측: 이전 실제 산정 항목과 총액을 현재 입력값 비교 기준으로 보관한다.
            forecastBaseRcptNo: getValue(row, "forecastBaseRcptNo"),
            forecastBaseTotalFee: getValue(row, "forecastBaseTotalFee"),
            forecastBaseTaxInvoiceAddFee: getValue(row, "forecastBaseTaxInvoiceAddFee"),
            forecastBaseUnitWages: getValue(row, "forecastBaseUnitWages"),
            forecastBaseFeeDepYmd: getValue(row, "forecastBaseFeeDepYmd"),
            forecastBaseFeeCalc: getValue(row, "forecastBaseFeeCalc"),
            // 수수료 예측: 현재 입력값과 이전 실제 산정 입력값을 구분해 변동 사유를 판단한다.
            forecastBaseFcltyItemNum: getValue(row, "forecastBaseFcltyItemNum")
          };
        });
      },
      setForecastBase: function(rows) {
        // 수수료 예측: 같은 접수번호의 이전 실제 산정값을 화면 비교 기준으로 확정한다.
        this.forecastBaseRows = rows || [];
        this.forecastBaseRcptNo = "";
        this.forecastBaseTotalFee = "";
        this.forecastBaseTaxInvoiceAddFee = "";
        this.forecastBaseUnitWages = "";
        this.forecastBaseFeeDepYmd = "";
        this.taxInvoiceAddFee = 0;

        for (var i = 0; i < this.forecastBaseRows.length; i++) {
          var row = this.forecastBaseRows[i];
          if (row.forecastBaseTotalFee !== "" && row.forecastBaseTotalFee !== null && row.forecastBaseTotalFee !== undefined) {
            this.forecastBaseRcptNo = row.forecastBaseRcptNo || "";
            this.forecastBaseTotalFee = row.forecastBaseTotalFee;
            this.forecastBaseTaxInvoiceAddFee = row.forecastBaseTaxInvoiceAddFee || 0;
            // 세금계산서용 추가 금액: 이전 실제 산정값이 있으면 차기 예상 기본값으로 채운다.
            this.taxInvoiceAddFee = this.forecastBaseTaxInvoiceAddFee;
            this.forecastBaseUnitWages = row.forecastBaseUnitWages || "";
            this.forecastBaseFeeDepYmd = row.forecastBaseFeeDepYmd || "";
            return;
          }
        }
      },
      getForecastBaseSectorValues: function() {
        // 수수료 예측: 최근 실제 수수료 산정에 포함된 업종만 추려 현재 선택 업종과 비교한다.
        var values = [];
        this.forecastBaseRows.forEach(function(row) {
          var value = row.savedBsnsCat || "";
          if (value && values.indexOf(value) < 0) {
            values.push(value);
          }
        });
        return values;
      },
      hasForecastSectorChanges: function() {
        var baseValues = this.getForecastBaseSectorValues().sort();
        var currentValues = this.appSectors.slice().sort();
        if (baseValues.length === 0) {
          return false;
        }
        if (baseValues.length !== currentValues.length) {
          return true;
        }
        for (var i = 0; i < baseValues.length; i++) {
          if (baseValues[i] !== currentValues[i]) {
            return true;
          }
        }
        return false;
      },
      hasForecastInputChanges: function() {
        // 수수료 예측: 상세 증감 수치를 노출하지 않고 입력 조건 변경 여부만 판단한다.
        var baseMap = {};
        this.forecastBaseRows.forEach(function(row) {
          if (row.savedBsnsCat && row.seq !== "") {
            baseMap[row.savedBsnsCat + "|" + row.seq] = row;
          }
        });

        for (var i = 0; i < this.appSectors.length; i++) {
          var rows = this.ensureSectorData(this.appSectors[i]);
          for (var j = 0; j < rows.length; j++) {
            var item = rows[j];
            var base = baseMap[item.bsnscatcd + "|" + item.seq];
            var currentValue = item.inputValue === null || item.inputValue === undefined || item.inputValue === "" ? "" : toNumber(item.inputValue);
            if (!base) {
              if (this.hasMeaningfulForecastInput(item, currentValue)) {
                return true;
              }
              continue;
            }
            var baseItemNum = base.forecastBaseFcltyItemNum !== "" && base.forecastBaseFcltyItemNum !== null && base.forecastBaseFcltyItemNum !== undefined ? base.forecastBaseFcltyItemNum : base.fcltyItemNum;
            if (this.getForecastComparableInputValue(currentValue) !== this.getForecastComparableInputValue(baseItemNum)) {
              return true;
            }
          }
        }
        return false;
      },
      hasForecastFormulaChanges: function() {
        for (var i = 0; i < this.forecastBaseRows.length; i++) {
          var row = this.forecastBaseRows[i];
          if (row.forecastBaseFeeCalc && row.feeCalc && row.forecastBaseFeeCalc !== row.feeCalc) {
            return true;
          }
        }
        return false;
      },
      hasForecastWageChanges: function() {
        // 수수료 예측: 임금단가 차이는 사유 문구로만 안내한다.
        if (!this.forecastBaseUnitWages) {
          return false;
        }
        return toNumber(this.forecastBaseUnitWages) !== toNumber(this.wages);
      },
      loadData: function(mode) {
        var self = this;
        axios
          .post(gbn_getContextPath() + "/selfFeeCalcData.do", {
            mode: mode
          })
          .then(function(res) {
            if (!res.data.success) {
              alert(res.data.message);
              location.href = gbn_getContextPath() + "/selfApplyCharge.do";
              return;
            }

            var basis = res.data.basis || {};
            var info = res.data.info || {};
            self.sectors = res.data.sectors || [];
            self.calcYear = getValue(info, "calcYear") || getValue(basis, "calcYear") || new Date().getFullYear().toString();
            self.wages = toNumber(getValue(info, "unitWages") || getValue(basis, "unitWages"));
            self.result = self.normalizeRows(res.data.detailList);
            // 수수료 예측: 이전 실제 산정 데이터를 현재 예측 비교 기준으로 설정한다.
            self.setForecastBase(self.result);
            self.sectorCalcData = {};
            self.sector2PreInputApplied = false;
            self.sector2PreInputPopup.visible = false;
            self.sector4PreInputApplied = false;
            self.sector4PreInputPopup.visible = false;

            var selectedValues = [];
            self.result.forEach(function(row) {
              // 수수료 예측: 저장 데이터가 아니라 과거 실제 산정 업종을 기본 선택 기준으로 사용한다.
              var savedValue = row.savedBsnsCat;
              if (savedValue && selectedValues.indexOf(savedValue) < 0) {
                selectedValues.push(savedValue);
              }
            });

            self.appSectors = selectedValues;
            selectedValues.forEach(function(value) {
              self.ensureSectorData(value);
            });
            self.selected = self.tabs.length > 0 ? self.tabs[0] : {};
          })
          .catch(function(error) {
            var message = "자료 조회 중 오류가 발생했습니다.";
            if (error.response) {
              if (error.response.data && error.response.data.message) {
                message = error.response.data.message;
              } else if (error.response.status) {
                message += " HTTP " + error.response.status;
              }
            }
            alert(message);
            console.log(error);
            return;
          });
      },
      ensureSectorData: function(value) {
        if (!value) {
          return [];
        }
        if (this.sectorCalcData[value]) {
          return this.sectorCalcData[value];
        }

        var self = this;
        var rows = this.result.filter(function(row) {
          return row.bsnscatcd === value;
        });
        var calcData = rows.map(function(row) {
          return self.makeCalcRow(row);
        });

        if (calcData.length > 0) {
          calcData[calcData.length - 1].valueFn = function() {
            return 0;
          };
        }
        this.$set(this.sectorCalcData, value, calcData);
        return calcData;
      },
      makeCalcRow: function(row) {
        var value = String(row.feeCalc || "");
        var numIdx = value.indexOf("Num");
        var checkIdx = value.indexOf("Check");
        var inputValue = row.fcltyItemNum !== "" && row.fcltyItemNum !== null ? toNumber(row.fcltyItemNum) : null;
        var calcRow = {
          value: value,
          bsnscatcd: row.bsnscatcd,
          bsnsClsL: row.bsnsClsL,
          bsnsClsM: row.bsnsClsM,
          fcltyClsL: row.fcltyClsL,
          fcltyClsM: row.fcltyClsM,
          fcltyClsS: row.fcltyClsS,
          feeCalc: row.feeCalc,
          fcltyItem: row.fcltyItem,
          fcltyitemnum: row.fcltyItemNum,
          seq: row.seq,
          delYn: "N",
          unitWages: this.wages
        };

        if (numIdx > -1) {
          calcRow.input = true;
          calcRow.inputValue = inputValue;
          calcRow.prefix = value.substr(0, numIdx);
          calcRow.suffix = value.substr(numIdx + 3);
          calcRow.placeholder = row.fcltyItem;
          calcRow.valueFn = buildFormula(value);
          if (row.bsnscatcd === "4-가" && row.bsnsClsL === "보고서" && inputValue) {
            this.totalVar = inputValue;
          }
        } else if (checkIdx > -1) {
          calcRow.checkBox = true;
          calcRow.inputValue = inputValue !== null ? inputValue : this.getDefaultCheckValue(row);
          calcRow.prefix = value.substr(0, checkIdx);
          calcRow.valueFn = buildFormula(value);
        } else {
          calcRow.valueFn = buildFormula(value);
        }
        return calcRow;
      },
      getDefaultCheckValue: function(row) {
        if (
          row.fcltyClsL === "점검대상 배출시설" &&
          row.bsnsClsM === "공통기준" &&
          (row.bsnscatcd === "2-가" || row.bsnscatcd === "4-가")
        ) {
          return 1;
        }
        return 0;
      },
      getSectorDivisor: function(value) {
        if (value === "3-가") {
          return 4;
        }
        if (value === "4-가") {
          return toNumber(this.totalVar) || 4;
        }
        return 5;
      },
      getSectorTotalData: function(value) {
        var calcData = this.ensureSectorData(value);
        var subtotal = calcData.reduce(function(acc, curr) {
          return acc + curr.valueFn(curr.inputValue);
        }, 0);
        return subtotal / this.getSectorDivisor(value);
      },
      getSectorCalcValue: function(value) {
        var calcData = this.ensureSectorData(value);
        var totalData = this.getSectorTotalData(value);
        var totalCost = calcData.reduce(function(acc, curr) {
          return acc + curr.valueFn(curr.inputValue);
        }, 0) + totalData;
        var laborCosts = totalCost * toNumber(this.wages);
        var expenses = laborCosts * 0.2;
        var otherCost = laborCosts * 1.1;
        var fee = (laborCosts + otherCost) * 0.2;
        var costTotal = (laborCosts + expenses + otherCost + fee) * 0.65;
        var vat = costTotal * 0.1;
        var grandTotal = costTotal + vat;
        return {
          totalCost: totalCost,
          laborCosts: laborCosts,
          expenses: expenses,
          otherCost: otherCost,
          fee: fee,
          costTotal: costTotal,
          vat: vat,
          grandTotal: grandTotal
        };
      },
      changeSector: function(value) {
        if (this.appSectors.indexOf(value) > -1) {
          this.ensureSectorData(value);
        }
      },
      autoCal: function(idx) {
        var item = this.calcData[idx];
        if (!item || item.inputValue === null || item.inputValue === undefined) {
          return;
        }
        if (String(item.inputValue).length >= 7) {
          alert("최대 6자리까지 입력가능합니다.");
          item.inputValue = "";
          return;
        }

        var nextItem = this.calcData[idx + 1];
        if (!nextItem || nextItem.placeholder !== "측정대상시설의수") {
          return;
        }
        if (item.inputValue === 0 || item.inputValue === null || item.inputValue === "") {
          nextItem.inputValue = "";
        } else if (item.inputValue <= 1) {
          nextItem.inputValue = 1;
        } else {
          nextItem.inputValue = Math.ceil(item.inputValue * 0.1);
        }
      },
      totalVariable: function(idx) {
        this.totalVar = this.calcData[idx].inputValue || 4;
      },
      resetBase: function() {
        if (!confirm("기존 데이터 값으로 초기화하시겠습니까?")) {
          return;
        }
        this.loadData("base");
      },
      numFormat: new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 5 }).format,
      numRound: function(num) {
        return IntFormat(Math.round(toNumber(num)));
      },
      numFloor: function(num) {
        return IntFormat(Math.floor(toNumber(num) / 1000) * 1000);
      }
    }
  });
})();
