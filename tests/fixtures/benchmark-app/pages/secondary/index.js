/* global Page, wx */
Page({
  data: {
    requestEndpoint: 'http://127.0.0.1:19420/benchmark',
    actionSequence: 0,
    actionLog: [],
    actionLogText: '[]'
  },

  onLoad: function (options) {
    if (options && options.endpoint) {
      this.setData({ requestEndpoint: decodeURIComponent(options.endpoint) });
    }
    this.recordAction('page-load', 'secondary');
  },

  recordAction: function (type, target) {
    var sequence = this.data.actionSequence + 1;
    var actionLog = this.data.actionLog.concat({ seq: sequence, type: type, target: target }).slice(-50);
    this.setData({
      actionSequence: sequence,
      actionLog: actionLog,
      actionLogText: JSON.stringify(actionLog)
    });
  },

  tapCrossPageTarget: function () {
    this.recordAction('cross-page-tap', 'secondary-shared-target');
  },

  goBack: function () {
    this.recordAction('navigate-back', 'primary');
    wx.navigateBack({ delta: 1 });
  }
});
