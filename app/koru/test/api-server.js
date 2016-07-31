const fs = require('fs');
const path = require('path');

define(function(require, exports, module) {
  return function (API) {
    const util  = require('koru/util');
    const session = require('koru/session');

    session.provide('G', function (data) {
//      record('client', data[0]);
    });

    API.OUT_DIR = path.resolve(module.toUrl('.'), '../../../../doc');

    API._record = function () {
      const ans = {};
      for (const api of this._apiMap.values()) {
        ans[api.testCase.name] = api.serialize();
      }
      fs.writeFileSync(`${this.OUT_DIR}/api.json`, JSON.stringify(ans, null, 2));
    };
  };
});
