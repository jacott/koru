define(function(require, exports, module) {
  return function (API) {
    const util    = require('koru/util');
    const TH = require('./main');

    API._record = function () {
      const json = {};
      for (const api of this._apiMap.values()) {
        json[api.testCase.name] = api.serialize((json[api.testCase.name]||{}));
      }
      TH.session.sendBinary('G', [json]);
    };
  };
});