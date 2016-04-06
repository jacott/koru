define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var message = require('./message');
  var session = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.gDict = message.newGlobalDict();
      message.finalizeGlobalDict(v.gDict);
    },

    tearDown: function () {
      v = null;
    },

    "test encode undefined": function () {
      assert.equals(_encode(undefined), v.ans = [1]);

      assert.same(_decode(v.ans), undefined);
    },

    "test encode null": function () {
      assert.equals(_encode(null), v.ans = [2]);

      assert.same(_decode(v.ans), null);
    },

    "test encode true": function () {
      assert.equals(_encode(true), v.ans = [3]);

      assert.same(_decode(v.ans), true);
    },

    "test encode false": function () {
      assert.equals(_encode(false), v.ans = [4]);

      assert.same(_decode(v.ans), false);
    },

    "test empty string": function () {
      assert.equals(_encode(''), v.ans = [5]);

      assert.same(_decode(v.ans), '');
    },

    "test empty array": function () {
      assert.equals(_encode([]), v.ans = [6,0]);

      assert.equals(_decode(v.ans), []);
    },

    "test empty object": function () {
      assert.equals(_encode({}), v.ans = [7,0]);

      assert.equals(_decode(v.ans), {});
    },

    "test small string": function () {
      v.gDict.limit = 0;
      assert.equals(_encode('hé\xff\u20AC', v.gDict),  v.ans = [136, 104, 195, 169, 195, 191, 226, 130, 172]);

      assert.same(_decode(v.ans), 'hé\xff\u20AC');
    },

    "test big string": function () {
      v.gDict.limit = 0;
      var string = new Array(500).join("x");

      assert.equals(_decode(_encode(string)).length, string.length);
    },

    "test string in dict": function () {
      var gDict = message.newGlobalDict();
      message.addToDict(gDict, "Friday");
      message.addToDict(gDict, "x");
      assert.same(message.finalizeGlobalDict(gDict), gDict);


      assert.equals(_encode('x', gDict),  v.ans = [129, 120]);
      assert.same(_decode(v.ans, gDict), 'x');

      assert.equals(_encode('Friday', gDict),  v.ans = [17, 255, 253]);
      assert.same(_decode(v.ans, gDict), 'Friday');

      assert.equals(_encode('new', gDict),  v.ans = [8, 110, 101, 119, 255, 0, 17, 1, 0]);
      assert.same(_decode(v.ans, gDict), 'new');
    },

    "test small integer": function () {
      assert.equals(_encode(1), v.ans = [0x41]);

      assert.same(_decode(v.ans), 1);
    },

    "test other numbers": function () {
      assert.same(_decode(_encode(64)), 64);
      assert.same(_decode(_encode(-1)), -1);

      assert.equals(_encode(-1.345e200), v.ans = [13, 233, 124, 29, 57, 187, 232, 23, 124]);
      assert.equals(_encode(-1.324e8), v.ans2 = [12, 248, 27, 188, 128]);
      assert.equals(_encode(-4561), v.ans3 = [11, 238, 47]);
      assert.equals(_encode(45123.4567), v.ans4 = [14, 26, 229, 75, 7]);
      assert.equals(_encode(256), v.ans5 = [11, 1, 0]);


      assert.same(_decode(v.ans), -1.345e200);
      assert.same(_decode(v.ans2), -1.324e8);
      assert.same(_decode(v.ans3), -4561);
      assert.same(_decode(v.ans4), 45123.4567);
      assert.same(_decode([11, 0, 128]), 128);
      assert.same(_decode(v.ans5), 256);
    },

    "test date": function () {
      var date = new Date(1402293586434);
      assert.equals(_encode(date), v.ans = [15, 66, 116, 103, 243, 96, 160, 32, 0]);

      assert.equals(_decode(v.ans), date);
    },

    "test binary": function () {
      var ab = new ArrayBuffer(20);
      var u8 = new Uint8Array(ab);

      for(var i = 0; i < 20; ++i) {
        u8[i] = i;
      }

      assert.equals(_encode(u8), v.ans = [16, 0, 0, 0, 20, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

      var result = _decode(v.ans);
      assert(result.constructor === Uint8Array);
      var ary = [];
      Array.prototype.push.apply(ary, result);
      assert.equals(ary, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    },

    "test populated array": function () {
      assert.equals(_encode([1 ,2, "hello"]), v.ans = [8, 104, 101, 108, 108, 111, 255, 0, 6, 65, 66, 17, 1, 0, 0]);

      assert.equals(_decode(v.ans), [1 ,2, "hello"]);
    },

    "test sparse array": function () {
      var array = [];
      array[130] = "x";
      array[131] = 1;
      array[5432] = null;
      assert.equals(_encode(array), v.ans = [6, 18, 130, 129, 120, 65, 19, 0, 0, 20, 180, 2, 0]);

      assert.equals(_decode(v.ans), array);
    },

    "test nested arrays": function () {
      var orig = [1, 2, [true, null, [undefined, "hello"], 0], 5];
      assert.equals(_decode(_encode(orig)), orig);
    },

    "test populated object": function () {
      var gDict = message.newGlobalDict();
      message.addToDict(gDict, 'foo');
      message.finalizeGlobalDict(gDict);

      var msg = _encode({foo: 'bar', baz: 'foo'}, gDict);

      assert.equals(msg, v.ans = [
        8,                             // Dictionary
        98, 97, 114, 0xff,             // local entry: bar
        98, 97, 122, 0xff,             // local entry: baz
        0,                             // end-of-dict
        7,                             // object
        0xff, 0xfe, 17, 1, 0,          // foo: bar
        1, 1, 17, 0xff, 0xfe,          // baz: foo
        0                              // eom
      ]);

      assert.equals(_decode(v.ans, gDict), {foo: 'bar', baz: 'foo'});
    },

    "test large object": function () {
      var obj = {};
      for(var i = 0; i < 129; ++i) {
        obj[i]=i;
      }
      assert.equals(_decode(_encode(obj)), obj);
    },

    "test addToDict": function () {
      var dict = message._newLocalDict();
      assert.equals(message.addToDict(dict, "foo"), 0x100);

      assert.same(dict.index, 0x101);
      assert.equals(dict.c2k[0], "foo");

      for(var i = 0; i < 127; ++i) {
        assert.equals(message.addToDict(dict, "x"+i), 0x101 + i);
      }

      assert.same(dict.index, 128 + 0x100);
      assert.equals(message.addToDict(dict, "x0"), 0x101);
      assert.same(dict.index, 128 + 0x100);


      dict.index = 0xfff0;
      assert.same(message.addToDict(dict, "ubig"), null);
      assert.equals(message.addToDict(dict, "x0"), 257);
    },

    "test encodeDict decodeDict": function () {
      var dict = message._newLocalDict();

      message.addToDict(dict, "foo");
      message.addToDict(dict, "bár\x00");

      assert.equals(message.encodeDict(dict, [8]), v.ans = [8,
                                               102, 111, 111, 0xff,
                                               98, 195, 161, 114, 192, 128, 0xff,
                                               0]);

      var dict = message._newLocalDict();

      assert.same(message.decodeDict(v.ans, 0, dict), 13);

      assert.equals(dict.k2c["bár\x00"], 257);

      assert.same(message.getDictItem([{}, dict], 257), "bár\x00");
    },

    "test global encodeDict decodeDict": function () {
      var dict = message.newGlobalDict();

      message.addToDict(dict, "foo");
      message.addToDict(dict, "bár\x00");

      message.finalizeGlobalDict(dict);

      assert.same(dict.k2c['foo'], 0xfffd);
      assert.same(dict.k2c["bár\x00"], 0xfffe);


      assert.equals(message.encodeDict(dict, [8]), v.ans = [8,
                                                            102, 111, 111, 0xff,
                                                            98, 195, 161, 114, 192, 128, 0xff,
                                                            0]);

      var dict = message.newGlobalDict();

      assert.same(message.decodeDict(v.ans.slice(1), 0, dict), 12);
      message.finalizeGlobalDict(dict);

      assert.equals(dict.k2c["bár\x00"], 0xfffe);

      assert.same(message.getDictItem([dict, {}], 0xfffe), "bár\x00");
      assert.same(message.getDictItem([dict, {}], 0xfffd), "foo");
    },

    "test mixed": function () {
      var gDict = message.newGlobalDict();
      message.addToDict(gDict, 'baz', 'bif');
      message.finalizeGlobalDict(gDict);

      var bin = new Uint8Array([4,7,6,4]);
      var longStr = new Array(200).join('x');
      var data = [1, bin, {foo: {bar: 'abc', baz: [-3.234e30, 63, 3e200]}, longStr: longStr, baz: true, a12: 1.23}, "", false, new Date(), null, NaN, undefined];

      var result = message.decodeMessage(message.encodeMessage('T',data, gDict).subarray(1), gDict);

      assert.equals(result, data);

      assert.same(result[1][2], 6);
    },

    "test unchanged encoding system": function () {
      var gDict = message.newGlobalDict();
      message.addToDict(gDict, 'order');
      message.finalizeGlobalDict(gDict);

      var obj = ["6", "save", "Ticket", "jJ9MiaHtcdgJzbFvn", {bin_id: "GStTJFXHDZmSkXM4z", order: 256}];
      var u8 = message.encodeMessage("X", obj, gDict).subarray(1);
      var len = u8.length;

      var msg = message.toHex(u8).join('');
      assert.same(msg, '73617665ff5469636b6574ff6a4a394d696148746364674a7a6246766eff62696e5f69' +
                  '64ff475374544a465848445a6d536b584d347aff008136110100110101110102070103110104fffe0b010000');

      assert.equals(message.decodeMessage(u8, gDict), obj);
    },

    "test encode/decodeMessage": function () {
      var u8 = message.encodeMessage("M", [1, 2, {foo: 'bar'}], v.gDict);
      var data = [];

      assert.same(Object.prototype.toString.call(u8), '[object Uint8Array]');

      data.forEach.call(u8, function (b) {data.push(b)});
      assert.equals(data, [77, 102, 111, 111, 255, 98, 97, 114, 255, 0, 65, 66, 7, 1, 0, 17, 1, 1, 0]);

      assert.equals(message.decodeMessage(u8.subarray(1), v.gDict), [1, 2, {foo: 'bar'}]);
    },

    "test encode empty message": function () {
      var u8 = message.encodeMessage("P", [], v.gDict);
      var data = [];

      assert.same(Object.prototype.toString.call(u8), '[object Uint8Array]');

      data.forEach.call(u8, function (b) {data.push(b)});
      assert.equals(data, [80, 0]);

      assert.equals(message.decodeMessage(u8.subarray(1), v.gDict), []);
    },
  });

  function _encode(object, globalDict, dict) {
    var buffer = [];
    dict = dict || message._newLocalDict();
    message._encode(buffer, object, [globalDict || v.gDict, dict]);
    if (dict.c2k.length)
      return message.encodeDict(dict, [8]).concat(buffer);
    else
      return buffer;
  }

  function _decode(object, globalDict) {
    return message._decode(object, 0, [globalDict || v.gDict, message._newLocalDict()])[0];
  }
});
