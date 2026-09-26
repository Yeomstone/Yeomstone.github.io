Vue.component("vue-input-file", {
  props: ["displayValue", "name"],
  template: `<li class="drop_zone"
                @dragenter="onDragenter"
                @dragover="onDragover"
                @dragleave="onDragleave"
                @drop="onDrop"
                :class="isDragged ? 'dropable' : ''"
            >
			<span class="upload-name" title="첨부파일명" aria-label="첨부파일명">{{ showValue }}</span>
            <label :for="name" style="margin-right: 35px;">업로드</label>
            <input :id="name" :name="name" type="file" class="upload-hidden" ref="fileInput" title="첨부파일 업로드" aria-label="첨부파일 업로드" @change="onFileChange">
        </li>`,
  data: function () {
    return {
      isDragged: false,
      fileName: null,
    };
  },
  computed: {
    showValue: function () {
      return this.fileName ? this.fileName : this.displayValue;
    },
  },
  methods: {
    onDragenter: function (e) {
      this.isDragged = true;
    },
    onDragleave: function (e) {
      this.isDragged = false;
    },
    onDragover: function (e) {
      e.preventDefault();
    },
    onDrop: function (ev) {
      ev.preventDefault();
      this.isDragged = false;
      if (ev.dataTransfer.items) {
        if (ev.dataTransfer.items.length > 0) {
          if (ev.dataTransfer.items[0].kind === "file") {
            let file = ev.dataTransfer.items[0].getAsFile();
            this.fileName = file.name;
            this.$refs.fileInput.files = ev.dataTransfer.files;
          }
        }
      }
    },
    onFileChange: function (event) {
      const files = this.$refs.fileInput.files;
      this.fileName = window.FileReader
        ? files[0].name
        : this.$refs.fileInput.value;
    },
  },
});
