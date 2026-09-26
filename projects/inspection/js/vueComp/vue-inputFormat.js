Vue.component("vue-input-format", {
  props: ["value"],
  template: `<input type="text" v-model="displayValue" @blur="isInputActive = false" @focus="isInputActive = true"/>`,
  data: function () {
    return {
      isInputActive: false,
    };
  },
  computed: {
    displayValue: {
      get: function () {
        if (this.isInputActive) {
          return this.value.toString();
        } else {
          return (this.value || 0)
            .toFixed(0)
            .replace(/(\d)(?=(\d{3})+(?:\.\d+)?$)/g, "$1,");
        }
      },
      set: function (modifiedValue) {
        let newValue = parseFloat(modifiedValue.replace(/[^\d\.]/g, ""));
        if (isNaN(newValue)) {
          newValue = 0;
        }
        this.$emit("input", newValue);
      },
    },
  },
});
