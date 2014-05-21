define(function(require, exports, module) {
  var TH = require('../test-helper');

  TH.util.extend(TH, {
    matchModel: function (expect) {
      return TH.sinon.match(function (actual) {
        if (expect === actual) return true;
        if (expect && actual && expect._id === actual._id) {
          assert.equals(actual.attributes, expect.attributes);
          return true;
        }
      });
    },
  });

  return TH;
});
