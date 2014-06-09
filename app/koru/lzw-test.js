define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var lzw = require('./lzw');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test compress": function () {
      var msg = [];
      var str = "TOBEORNOTTOBEORTOBEORNOT";
      for(var i = 0; i < str.length; ++i) msg.push(str.charCodeAt(i));

      assert.equals(lzw.compress(msg), [84,79,66,69,79,82,78,79,84,256,258,260,265,259,261,263]);
      assert.equals(lzw.decompress(lzw.compress(msg)), msg);

    },

    "test decompress": function () {
      assert.equals(lzw.decompress(lzw.compress([1,2,3,4])), [1,2,3,4]);

      var ary = [];
      for(var i = 0; i < 0x100; ++i) ary.push(i);

      assert.equals(lzw.decompress(lzw.compress(ary)), ary);
    },

  });
});
