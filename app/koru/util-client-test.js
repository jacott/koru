define((require, exports, module) => {
  'use strict';
  const TH = require('koru/test-helper');

  const {stub, spy, util, stubProperty} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let navigator;
    beforeEach(() => {
      navigator = {};
      stubProperty(globalThis, 'navigator', {value: navigator});
    });

    group('Chromium Engine (using userAgentData)', () => {
      test('macOS device running Chrome', () => {
        Object.assign(navigator, {
          userAgentData: {platform: 'macOS'},
          platform: 'Win32', // Simulating frozen legacy platform string
        });
        assert.isTrue(util.isMacPlatform());
      });

      test('iPhone running Chrome', () => {
        Object.assign(navigator, {userAgentData: {platform: 'iPhone'}});
        assert.isTrue(util.isMacPlatform());
      });

      test('Linux device running Chrome', () => {
        Object.assign(navigator, {userAgentData: {platform: 'Linux'}});
        assert.isFalse(util.isMacPlatform());
      });
    });

    group('Safari & Firefox (falling back to legacy fields)', () => {
      test('MacIntel via navigator.platform (Safari Desktop)', () => {
        Object.assign(navigator, {
          userAgentData: undefined,
          platform: 'MacIntel',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
        });
        assert.isTrue(util.isMacPlatform());
      });

      test('Macintosh via userAgent when platform is masked (Firefox Privacy)', () => {
        Object.assign(navigator, {
          userAgentData: undefined,
          platform: 'Win32', // Privacy spoofing active
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
        });
        assert.isTrue(util.isMacPlatform());
      });

      test('standard Windows device running Firefox', () => {
        Object.assign(navigator, {
          userAgentData: undefined,
          platform: 'Win32',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
        });
        assert.isFalse(util.isMacPlatform());
      });
    });
  });
});
