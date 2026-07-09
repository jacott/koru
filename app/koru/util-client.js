define((require) => {
  'use strict';
  const util            = require('./util');
  const findEngine = () => {
    // 1. Modern Client Hints (Chromium-based: Chrome, Edge, Opera)
    if (navigator.userAgentData?.brands) {
      const standardBrands = navigator.userAgentData.brands.filter((b) => !b.brand.includes('Not'));

      // Return the specific brand if possible, otherwise fall back to the first valid one
      const primaryBrand = standardBrands.find((b) => b.brand !== 'Chromium') || standardBrands[0];

      if (primaryBrand != null) {
        return `${primaryBrand.brand}-${primaryBrand.version}`;
      }
    }

    return util.versionFromUserAgent(navigator.userAgent);
  };
  util.engine = findEngine();

  util.browserVersion = () => util.engine;

  util.isFirefox = util.engine.startsWith('Firefox');
  util.isSafari = util.engine.startsWith('Safari');
  util.thread = {dbId: ''};

  util.isMacPlatform = () => {
    const macRe = /mac|iphone|ipad/i;
    if (navigator.userAgentData?.platform) {
      return macRe.test(navigator.userAgentData.platform);
    }

    return macRe.test(navigator.platform ?? '') || macRe.test(navigator.userAgent ?? '');
  };

  return util;
});
