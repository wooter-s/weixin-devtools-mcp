/* global Page, wx, console */
/* eslint-disable @typescript-eslint/no-this-alias -- Serialized Mini Program callbacks use their page instance. */
function createItems() {
  return Array.from({ length: 20 }, function (_, index) {
    var paddedIndex = String(index).padStart(2, '0');
    return {
      id: 'item-' + paddedIndex,
      ordinal: index,
      testId: 'duplicate-' + paddedIndex,
      label: '重复项'
    };
  });
}

Page({
  data: {
    fixtureVersion: '1.0.0',
    items: createItems(),
    mutationRevision: 0,
    inputValue: '',
    textareaValue: '',
    consoleToken: 'console-000',
    requestToken: 'request-000',
    requestEndpoint: 'http://127.0.0.1:19420/benchmark',
    requestStatus: 'idle',
    actionSequence: 0,
    actionLog: [],
    actionLogText: '[]'
  },

  onLoad: function (options) {
    if (options && options.endpoint) {
      this.setData({ requestEndpoint: decodeURIComponent(options.endpoint) });
    }
    this.recordAction('page-load', 'primary');
  },

  recordAction: function (type, target, value) {
    var sequence = this.data.actionSequence + 1;
    var entry = { seq: sequence, type: type, target: target };
    if (value !== undefined) {
      entry.value = value;
    }
    var actionLog = this.data.actionLog.concat(entry).slice(-200);
    this.setData({
      actionSequence: sequence,
      actionLog: actionLog,
      actionLogText: JSON.stringify(actionLog)
    });
    return sequence;
  },

  tapDuplicate: function (event) {
    var itemId = event.currentTarget.dataset.itemId;
    this.recordAction('duplicate-tap', itemId, event.currentTarget.dataset.ordinal);
  },

  reorderItems: function () {
    this.setData({
      items: this.data.items.slice().reverse(),
      mutationRevision: this.data.mutationRevision + 1
    });
    this.recordAction('reorder', 'duplicate-list', this.data.mutationRevision);
  },

  removeTarget: function () {
    this.setData({
      items: this.data.items.filter(function (item) { return item.id !== 'item-07'; }),
      mutationRevision: this.data.mutationRevision + 1
    });
    this.recordAction('remove', 'item-07', this.data.mutationRevision);
  },

  restoreItems: function () {
    this.setData({
      items: createItems(),
      mutationRevision: this.data.mutationRevision + 1
    });
    this.recordAction('restore', 'duplicate-list', this.data.mutationRevision);
  },

  onInput: function (event) {
    this.setData({ inputValue: event.detail.value });
    this.recordAction('input', 'benchmark-input', event.detail.value);
  },

  onTextarea: function (event) {
    this.setData({ textareaValue: event.detail.value });
    this.recordAction('input', 'benchmark-textarea', event.detail.value);
  },

  onConsoleToken: function (event) {
    this.setData({ consoleToken: event.detail.value });
  },

  emitConsole: function () {
    var sequence = this.recordAction('console', 'benchmark-console', this.data.consoleToken);
    console.log('BENCH_CONSOLE', this.data.consoleToken, sequence);
  },

  onRequestToken: function (event) {
    this.setData({ requestToken: event.detail.value });
  },

  onRequestEndpoint: function (event) {
    this.setData({ requestEndpoint: event.detail.value });
  },

  sendLocalRequest: function () {
    var page = this;
    var sequence = this.recordAction('request-start', 'benchmark-request', this.data.requestToken);
    this.setData({ requestStatus: 'pending' });
    wx.request({
      url: this.data.requestEndpoint,
      method: 'GET',
      data: { token: this.data.requestToken, seq: sequence },
      success: function (response) {
        page.setData({ requestStatus: 'success:' + response.statusCode });
        page.recordAction('request-success', 'benchmark-request', response.statusCode);
      },
      fail: function (error) {
        page.setData({ requestStatus: 'failure' });
        page.recordAction('request-failure', 'benchmark-request', error.errMsg || 'unknown');
      }
    });
  },

  goSecondary: function () {
    var endpoint = encodeURIComponent(this.data.requestEndpoint);
    this.recordAction('navigate', 'secondary');
    wx.navigateTo({ url: '/pages/secondary/index?endpoint=' + endpoint });
  },

  clearActionLog: function () {
    this.setData({ actionSequence: 0, actionLog: [], actionLogText: '[]' });
  }
});
