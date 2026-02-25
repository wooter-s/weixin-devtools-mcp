/* eslint-disable no-undef */
import automator from 'miniprogram-automator';

(async () => {
  try {
    const wsEndpoints = process.env.WX_DEVTOOLS_WS_ENDPOINT
      ? [process.env.WX_DEVTOOLS_WS_ENDPOINT]
      : ['ws://localhost:9420', 'ws://localhost:9440'];

    let miniProgram = null;
    let connectedEndpoint = '';
    for (const endpoint of wsEndpoints) {
      try {
        miniProgram = await automator.connect({ wsEndpoint: endpoint });
        connectedEndpoint = endpoint;
        break;
      } catch {
        // Try next endpoint.
      }
    }

    if (!miniProgram) {
      throw new Error(`连接失败，已尝试端点: ${wsEndpoints.join(', ')}`);
    }

    console.log(`✅ 已连接到微信开发者工具 (${connectedEndpoint})`);

    // 等待页面加载稳定
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 注入网络监听并增加请求 ID，便于匹配 request/response
    const setupResult = await miniProgram.evaluate(function () {
      if (!wx.__networkLogs) {
        wx.__networkLogs = [];
      }

      const app = getApp();
      const hasMpxFetch = app && app.$xfetch && app.$xfetch.interceptors;
      if (!hasMpxFetch) {
        return { success: false, hasMpxFetch: false };
      }

      getApp().$xfetch.interceptors.request.use(function (config) {
        const requestId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        config.__manualRequestId = requestId;
        wx.__networkLogs.push({
          id: requestId,
          type: 'request',
          method: config.method || 'GET',
          url: config.url,
          timestamp: Date.now(),
        });
        return config;
      });

      getApp().$xfetch.interceptors.response.use(
        function (response) {
          const requestId = response.requestConfig?.__manualRequestId;
          wx.__networkLogs.push({
            id: requestId,
            type: 'response',
            status: response.status,
            url: response.requestConfig?.url,
            timestamp: Date.now(),
            success: true,
          });
          return response;
        },
        function (error) {
          wx.__networkLogs.push({
            type: 'response',
            status: 0,
            url: error?.requestConfig?.url || '',
            timestamp: Date.now(),
            success: false,
            error: error?.message || error?.errMsg || 'unknown error',
          });
          return Promise.reject(error);
        }
      );

      return { success: true, hasMpxFetch: true };
    });

    console.log('📋 拦截器安装结果:', setupResult);
    if (!setupResult.success) {
      throw new Error('未检测到 getApp().$xfetch.interceptors，无法验证网络拦截');
    }

    // 触发页面跳转来触发请求
    console.log('🔄 触发页面跳转...');
    await miniProgram.reLaunch('/pages/home/index');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('🔄 再次触发页面跳转...');
    await miniProgram.reLaunch('/pages/home/index');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 获取日志
    const logs = await miniProgram.evaluate(function () {
      return wx.__networkLogs || [];
    });

    const requests = logs.filter((log) => log.type === 'request');
    const responses = logs.filter((log) => log.type === 'response');

    console.log('\n📊 捕获的网络请求:', logs.length);
    console.log('   请求数:', requests.length);
    console.log('   响应数:', responses.length);

    if (requests.length > 0) {
      console.log('\n📝 请求列表:');
      requests.forEach((req, index) => {
        console.log(`   [${index + 1}] ${req.method} ${req.url}`);
      });
    }

    await miniProgram.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
})();
