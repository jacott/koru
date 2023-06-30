define((require, exports, module) => {
  'use strict';
  const Random          = require('koru/random');
  const TH              = require('koru/test-helper');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const session         = require('./main');

  const message = require('./message');

  let v = {};

  const _encode = (object, globalDict = v.gDict) => {
    const buffer = new Uint8ArrayBuilder();
    const dict = message._newLocalDict();
    dict.buffer.push(8);
    message._encode(buffer, object, [globalDict, dict]);
    if (dict.c2k.length != 0) {
      const b = dict.buffer;
      b.push(0);
      b.append(buffer.subarray());
      return Array.from(b.subarray());
    } else {
      return Array.from(buffer.subarray());
    }
  };

  const _decode = (object, globalDict) => {
    return message._decode(new Uint8Array(object), 0, [globalDict || v.gDict, message._newLocalDict()])[0];
  };

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      v.gDict = message.newGlobalDict();
      message.finalizeGlobalDict(v.gDict);
    });

    afterEach(() => {
      v = {};
    });

    test("don't use object with prototype for dictionary", () => {
      const msg = [{toString: 0}];

      const em = message.encodeMessage('G', msg, v.gDict).slice(1);
      const dm = message.decodeMessage(em, v.gDict);
      assert.equals(dm, msg);
    });

    test('encode undefined', () => {
      assert.equals(_encode(undefined), v.ans = [1]);

      assert.same(_decode(v.ans), undefined);
    });

    test('encode null', () => {
      assert.equals(_encode(null), v.ans = [2]);

      assert.same(_decode(v.ans), null);
    });

    test('encode true', () => {
      assert.equals(_encode(true), v.ans = [3]);

      assert.same(_decode(v.ans), true);
    });

    test('encode false', () => {
      assert.equals(_encode(false), v.ans = [4]);

      assert.same(_decode(v.ans), false);
    });

    test('empty string', () => {
      assert.equals(_encode(''), v.ans = [5]);

      assert.same(_decode(v.ans), '');
    });

    test('empty array', () => {
      assert.equals(_encode([]), v.ans = [20]);

      assert.equals(_decode(v.ans), []);
    });

    test('empty object', () => {
      assert.equals(_encode({}), v.ans = [21]);

      const result = _decode(v.ans);
      assert.equals(result, {});
      assert.same(result.constructor, Object);
    });

    test('empty null object', () => {
      assert.equals(_encode(Object.create(null)), v.ans = [23]);

      const result = _decode(v.ans);
      assert.equals(result, {});
      assert.same(result.constructor, void 0);
    });

    test('nonempty null object', () => {
      const obj = Object.create(null);
      obj.x = 1;
      assert.equals(_encode(obj), v.ans = [8, 120, 255, 0, 22, 1, 0, 65, 0]);

      const result = _decode(v.ans);
      assert.equals(result, {x: 1});
      assert.same(result.constructor, void 0);
    });

    test('small string as dict', () => {
      assert.equals(_decode(_encode('12')), '12');

      const text = '\na bit more Ჾ蠇 text\n\x01\xf7\x00\n\n\n';
      assert.equals(_decode(_encode(text)), text);
    });

    test('preserves byte order mark', () => {
      const bomx = '\ufeffx';

      const u8 = message.encodeMessage('M', [bomx], v.gDict);

      assert.equals(u8, new Uint8Array([77, 239, 187, 191, 120, 255, 0, 17, 1, 0]));

      assert.equals(message.decodeMessage(u8.subarray(1), v.gDict), ['\ufeffx']);
    });

    test('surrogate characters', () => {
      v.gDict.limit = 0;

      let text = 'h💣é\xff\u20AC';

      assert.same(text, 'h💣éÿ€');

      assert.equals(_encode(text), v.ans = [140, 104, 240, 159, 146, 163, 195, 169, 195, 191, 226, 130, 172]);

      assert.same(_decode(v.ans), text);
    });

    test('big string', () => {
      v.gDict.limit = 0;
      const string = new Array(500).join('x');

      assert.equals(_decode(_encode(string)).length, string.length);
    });

    test('string in dict', () => {
      const gDict = message.newGlobalDict();
      message.addToDict(gDict, 'Friday');
      message.addToDict(gDict, 'x');
      assert.same(message.finalizeGlobalDict(gDict), gDict);

      assert.equals(_encode('x', gDict), v.ans = [129, 120]);
      assert.same(_decode(v.ans, gDict), 'x');
      assert.same(message.getStringCode(gDict, 'x'), 65534);

      assert.equals(_encode('Friday', gDict), v.ans = [17, 255, 253]);
      assert.same(_decode(v.ans, gDict), 'Friday');

      assert.equals(_encode('new', gDict), v.ans = [8, 110, 101, 119, 255, 0, 17, 1, 0]);
      assert.same(_decode(v.ans, gDict), 'new');
    });

    test('small integer', () => {
      assert.equals(_encode(1), v.ans = [0x41]);

      assert.same(_decode(v.ans), 1);
    });

    test('other numbers', () => {
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
    });

    test('date', () => {
      const date = new Date(1402293586434);
      assert.equals(_encode(date), v.ans = [15, 66, 116, 103, 243, 96, 160, 32, 0]);

      assert.equals(_decode(v.ans), date);
    });

    test('binary', () => {
      const u8 = new Uint8Array(20);

      for (let i = 0; i < 20; ++i) {
        u8[i] = i;
      }

      const ans = _encode(u8);
      assert.equals(ans, [16, 0, 0, 0, 20, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

      const u8ans = new Uint8Array(ans);
      const result = message._decode(u8ans, 0, [v.gDict])[0];
      assert(result.constructor === Uint8Array);
      const ary = Array.from(result);
      assert.equals(ary, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

      u8ans[10] = 88;
      assert.same(result[5], 5); // ensure Uint8Array is copied
    });

    test('populated array', () => {
      assert.equals(_encode([1, 2, 'hello']), v.ans = [8, 104, 101, 108, 108, 111, 255, 0, 6, 65, 66, 17, 1, 0, 0]);

      assert.equals(_decode(v.ans), [1, 2, 'hello']);
    });

    test('sparse array', () => {
      const array = [];
      array[130] = 'x';
      array[131] = 1;
      array[5432] = null;
      assert.equals(_encode(array), v.ans = [6, 18, 130, 129, 120, 65, 19, 0, 0, 20, 180, 2, 0]);

      assert.equals(_decode(v.ans), array);

      array[0] = 0;
      array[1] = -1;
      array[2] = -2;

      assert.equals(_encode(array), v.ans = [6, 64, 10, 255, 10, 254, 18, 127, 129, 120, 65, 19, 0, 0, 20, 180, 2, 0]);

      assert.equals(_decode(v.ans), array);
    });

    test('nested arrays', () => {
      const orig = [1, 2, [true, null, [undefined, 'hello'], 0], 5];
      assert.equals(_decode(_encode(orig)), orig);
    });

    test('populated object', () => {
      const gDict = message.newGlobalDict();
      message.addToDict(gDict, 'foo');
      message.finalizeGlobalDict(gDict);

      const msg = _encode({foo: 'bar', baz: 'foo'}, gDict);

      //fmt-ignore
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

      const result = _decode(v.ans, gDict);
      assert.equals(result, {foo: 'bar', baz: 'foo'});
      assert.same(result.constructor, Object);
    });

    test('bad message', () => {
      assert.exception(
        //fmt-ignore
        () => _decode(new Uint8Array([
          8,                             // Dictionary
          98, 97, 114, 0xff,             // local entry: bar
          98, 97, 122, 0xff,             // local entry: baz
          0,                             // end-of-dict
          61, 2, 3, 4, // junk
          7,                             // object
          0xff, 0xfe, 17, 1, 0,          // foo: bar
          1, 1, 17, 0xff, 0xfe,          // baz: foo
          1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
        ])),
        {
          message: 'Unsupported format: 61 at 11 in:\n' +
            '   8,98,97,114,255,98,97,122,255,0,61,2,3,4,7,255,254,17,1,0,1,1,17,255,254,1,1,1,1,1,1',
        },
      );
    });

    test('large object', () => {
      const obj = {};
      for (let i = 0; i < 129; ++i) {
        obj[i] = i;
      }
      assert.equals(_decode(_encode(obj)), obj);
    });

    test('addToDict', () => {
      const dict = message._newLocalDict();
      assert.equals(message.addToDict(dict, 'foo'), 0x100);

      assert.same(dict.index, 0x101);
      assert.equals(dict.c2k[0], 'foo');

      for (let i = 0; i < 127; ++i) {
        assert.equals(message.addToDict(dict, 'x' + i), 0x101 + i);
      }

      assert.same(dict.index, 128 + 0x100);
      assert.equals(message.addToDict(dict, 'x0'), 0x101);
      assert.same(dict.index, 128 + 0x100);

      dict.index = 0xfff0;
      assert.same(message.addToDict(dict, 'ubig'), -1);
      assert.equals(message.addToDict(dict, 'x0'), 257);
    });

    test('encodeDict decodeDict', () => {
      let dict = message._newLocalDict();
      dict.buffer.push(8);

      message.addToDict(dict, 'foo');
      message.addToDict(dict, 'bár\u0000');

      assert.equals(
        Array.from(message.encodeDict(dict).subarray()),
        v.ans = [8, 102, 111, 111, 0xff, 98, 195, 161, 114, 0, 0xff, 0],
      );

      dict = message._newLocalDict();

      assert.same(message.decodeDict(new Uint8Array(v.ans), 1, dict), 12);

      assert.equals(dict.k2c['foo'], 256);
      assert.equals(dict.k2c['bár\u0000'], 257);

      assert.same(message.getDictItem([{}, dict], 257), 'bár\u0000');
    });

    test('global encodeDict decodeDict', () => {
      let dict = message.newGlobalDict();
      dict.buffer.push(8);

      message.addToDict(dict, 'foo');
      message.addToDict(dict, 'bár\u0000');

      message.finalizeGlobalDict(dict);

      assert.same(dict.k2c['foo'], 0xfffd);
      assert.same(dict.k2c['bár\u0000'], 0xfffe);

      assert.equals(
        Array.from(message.encodeDict(dict).subarray()),
        v.ans = [8, 102, 111, 111, 0xff, 98, 195, 161, 114, 0, 0xff, 0],
      );

      dict = message.newGlobalDict();

      assert.same(message.decodeDict(new Uint8Array(v.ans).subarray(1), 0, dict), 11);
      message.finalizeGlobalDict(dict);

      assert.equals(dict.k2c['bár\u0000'], 0xfffe);

      assert.same(message.getDictItem([dict, {}], 0xfffe), 'bár\u0000');
      assert.same(message.getDictItem([dict, {}], 0xfffd), 'foo');
    });

    test('mixed', () => {
      const gDict = message.newGlobalDict();
      message.addToDict(gDict, 'baz', 'bif');
      message.finalizeGlobalDict(gDict);

      const bin = new Uint8Array([4, 7, 6, 4]);
      const longStr = new Array(200).join('x');
      const data = [
        1,
        bin,
        {foo: {bar: 'abc', baz: [-3.234e30, 63, 3e200]}, longStr, baz: true, a12: 1.23},
        '',
        false,
        new Date(),
        null,
        NaN,
        undefined,
      ];

      const result = message.decodeMessage(message.encodeMessage('T', data, gDict).subarray(1), gDict);

      assert.equals(result, data);

      assert.same(result[1][2], 6);
    });

    test('unchanged encoding system', () => {
      const gDict = message.newGlobalDict();
      message.addToDict(gDict, 'order');
      message.finalizeGlobalDict(gDict);

      const obj = ['6', 'save', 'Ticket', 'jJ9MiaHtcdgJzbFvn', {bin_id: 'GStTJFXHDZmSkXM4z', order: 256}];
      const u8 = message.encodeMessage('X', obj, gDict).subarray(1);
      const len = u8.length;

      const msg = message.toHex(u8).join('');
      assert.same(
        msg,
        '73617665ff5469636b6574ff6a4a394d696148746364674a7a6246766eff62696e5f69' +
          '64ff475374544a465848445a6d536b584d347aff008136110100110101110102070103110104fffe0b010000',
      );

      assert.equals(message.decodeMessage(u8, gDict), obj);
    });

    test('openEncoder', () => {
      const {push, encode} = message.openEncoder('M', v.gDict);
      for (const arg of [1, 2, {foo: 'bar', [Symbol()]: 'notme'}]) {
        push(arg);
      }
      const u8 = encode();

      assert(u8 instanceof Uint8Array);

      assert.equals(Array.from(u8), [77, 102, 111, 111, 255, 98, 97, 114, 255, 0, 65, 66, 7, 1, 0, 17, 1, 1, 0]);

      assert.equals(message.decodeMessage(u8.subarray(1), v.gDict), [1, 2, {foo: 'bar'}]);

      push('append');

      assert.equals(message.decodeMessage(encode().subarray(1), v.gDict), [1, 2, {foo: 'bar'}, 'append']);
    });

    test('encode/decodeMessage', () => {
      const u8 = message.encodeMessage('M', [1, 2, {foo: 'bar', [Symbol()]: 'notme'}]);
      const data = [];

      assert(u8 instanceof Uint8Array);

      assert.equals(Array.from(u8), [77, 102, 111, 111, 255, 98, 97, 114, 255, 0, 65, 66, 7, 1, 0, 17, 1, 1, 0]);

      assert.equals(message.decodeMessage(u8.subarray(1)), [1, 2, {foo: 'bar'}]);
    });

    test('encode empty message', () => {
      const u8 = message.encodeMessage('P', [], v.gDict);
      const data = [];

      assert(u8 instanceof Uint8Array);

      data.forEach.call(u8, (b) => {
        data.push(b);
      });
      assert.equals(data, [80, 0]);

      assert.equals(message.decodeMessage(u8.subarray(1), v.gDict), []);
    });
  });
});
