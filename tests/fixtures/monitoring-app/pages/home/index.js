/* global Page */
Page({
  data: { count: 0, input: '', text: '', checked: false, slider: 0, picker: 0, items: ['One', 'Two'], visible: true, hidden: false },
  increment() { this.setData({ count: this.data.count + 1 }); },
  inputChange(e) { this.setData({ input: e.detail.value }); },
  textChange(e) { this.setData({ text: e.detail.value }); },
  switchChange(e) { this.setData({ checked: e.detail.value }); },
  sliderChange(e) { this.setData({ slider: e.detail.value }); },
  pickerChange(e) { this.setData({ picker: e.detail.value }); }
});
