define(function(require, exports, module) {
  return function (API) {
    const util    = require('koru/util');
    const TH = require('./main');

    API._record = function (data) {
//      TH.session.sendBinary('G', [data]);
    };
  };
});
