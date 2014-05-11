/*global define*/

define(['./sinon', 'bart/util'], function(sinon, util) {
  var geddon = {
    sinon: sinon,

    _testCases: {},

    _init: function () {
      this.testCount = this.skipCount = this.assertCount = 0;
    },

    _u: {
      isElement: function(elm) {
        return elm != null && typeof elm === 'object' && typeof elm.isSameNode === 'function';
      },
    },
    inspect: util.inspect,

    extractError: util.extractError,
  };

  geddon._init();

  return geddon;
});
