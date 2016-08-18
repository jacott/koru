define(function(require, exports, module) {
  return function (API) {
    const util    = require('koru/util');
    const TH = require('./main');

    API._record = function () {
      const json = {};
      for (let api of this._moduleMap.values()) {
        json[api.moduleName] = api.serialize((json[api.moduleName]||{}));
      }
      TH.session.sendBinary('G', [json]);
    };
  };
});
