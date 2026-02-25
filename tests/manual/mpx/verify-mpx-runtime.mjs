/* eslint-disable no-undef */
import automator from 'miniprogram-automator';

(async () => {
  try {
    const miniProgram = await automator.connect({
      wsEndpoint: 'ws://localhost:9420',
    });

    const result = await miniProgram.evaluate(function () {
      const app = typeof getApp !== 'undefined' ? getApp() : null;
      const appKeys = Object.keys(app || {});
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      const currentPage = pages[pages.length - 1] || null;
      const pageKeys = Object.keys(currentPage || {}).filter((key) =>
        key.includes('mpx') || key.includes('xfetch') || key.includes('fetch')
      );

      const globalScope = globalThis;
      const runtimeMpx = globalScope.mpx;
      const runtimeXfetch = globalScope.xfetch;
      const hasGlobalMpx = typeof runtimeMpx !== 'undefined';
      const hasGlobalXfetch = typeof runtimeXfetch !== 'undefined';
      const hasMpxInterceptors = hasGlobalMpx && !!runtimeMpx?.xfetch?.interceptors;
      const hasMpxRequestUse = hasMpxInterceptors && typeof runtimeMpx.xfetch.interceptors.request.use === 'function';

      return {
        appKeys: appKeys.filter((key) =>
          key.includes('mpx') || key.includes('xfetch') || key.includes('fetch') || key.startsWith('$')
        ),
        hasMpx: !!(app && app.mpx),
        hasXfetch: !!(app && app.xfetch),
        has$Xfetch: !!(app && app.$xfetch),
        hasInterceptors: !!(app && app.$xfetch && app.$xfetch.interceptors),
        hasRequestUse: !!(app && app.$xfetch && app.$xfetch.interceptors && typeof app.$xfetch.interceptors.request.use === 'function'),
        globalMpx: hasGlobalMpx,
        globalXfetch: hasGlobalXfetch,
        mpxHasInterceptors: !!hasMpxInterceptors,
        mpxHasRequestUse: !!hasMpxRequestUse,
        networkInterceptorsInstalled: typeof wx !== 'undefined' && !!wx.__networkInterceptorsInstalled,
        mpxInterceptorInstalled: typeof wx !== 'undefined' && !!wx.__mpxInterceptorInstalled,
        networkLogsCount: typeof wx !== 'undefined' && wx.__networkLogs ? wx.__networkLogs.length : 0,
        pageKeys,
        hasGlobalConfig: !!(app && app.GLOBAL_CONFIG),
      };
    });

    console.log('MPX运行时检测结果:');
    console.log(JSON.stringify(result, null, 2));

    await miniProgram.disconnect();
  } catch (error) {
    console.error('检测失败:', error.message);
    process.exit(1);
  }
})();
