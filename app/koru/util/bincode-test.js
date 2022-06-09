define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const Bincode = require('./bincode');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    const buildAssert = (type) => {
      const enc = type + 'Encode';
      const dec = type + 'Decode';
      return (n, array) => {
        const encoder = new Bincode.Encoder();
        encoder[enc](n);

        const u8Ans = encoder.uint8Subarray();
        assert.equals(Array.from(u8Ans), array);

        const decoder = new Bincode.Decoder(u8Ans);
        assert.equals(decoder[dec](), n);
      };
    };

    test('encodes bool', () => {
      const assertEncode = buildAssert('bool');

      assertEncode(false, [0]);
      assertEncode(true, [1]);
    });

    test('encodes u8 (byte)', () => {
      const assertEncode = buildAssert('u8');

      assertEncode(0, [0]);
      assertEncode(1, [1]);
      assertEncode(251, [251]);
      assertEncode(255, [255]);
    });

    test('encodes i8', () => {
      const assertEncode = buildAssert('i8');

      assertEncode(0, [0]);
      assertEncode(1, [1]);
      assertEncode(-5, [251]);
      assertEncode(-1, [255]);
    });

    test('encodes u32', () => {
      const assertEncode = buildAssert('u32');

      assertEncode(0, [0, 0, 0, 0]);
      assertEncode(2 ** 32 - 1, [255, 255, 255, 255]);
    });

    test('encodes i32', () => {
      const assertEncode = buildAssert('i32');

      assertEncode(0, [0, 0, 0, 0]);
      assertEncode(-1, [255, 255, 255, 255]);
      assertEncode(2 ** 31 - 1, [255, 255, 255, 127]);
    });

    test('encodes u64', () => {
      const assertEncode = buildAssert('u64');

      assertEncode(0n, [0, 0, 0, 0, 0, 0, 0, 0]);
      assertEncode(2n ** 64n - 1n, [255, 255, 255, 255, 255, 255, 255, 255]);
    });

    test('encodes i64', () => {
      const assertEncode = buildAssert('i64');

      assertEncode(0n, [0, 0, 0, 0, 0, 0, 0, 0]);
      assertEncode(- 1n, [255, 255, 255, 255, 255, 255, 255, 255]);
      assertEncode(2n ** 63n - 1n, [255, 255, 255, 255, 255, 255, 255, 127]);
    });

    test('encodes f32', () => {
      const assertEncode = buildAssert('f32');

      assertEncode(0, [0, 0, 0, 0]);
      assertEncode(-1, [0, 0, 128, 191]);
      assertEncode(2147483648, [0, 0, 0, 79]);
      assertEncode(2.3450000284861006e+32, [230, 252, 56, 117]);
    });

    test('encodes f64', () => {
      const assertEncode = buildAssert('f64');

      assertEncode(0, [0, 0, 0, 0, 0, 0, 0, 0]);
      assertEncode(-1, [0, 0, 0, 0, 0, 0, 240, 191]);
      assertEncode(2147483648, [0, 0, 0, 0, 0, 0, 224, 65]);
      assertEncode(2.3450000284861006e+32, [0, 0, 0, 192, 156, 31, 167, 70]);
    });

    test('encodes uint (littleEndian)', () => {
      const assertEncode = (n, array) => {
        const encoder = new Bincode.Encoder();
        encoder.uintEncode(n);
        assert.equals(Array.from(encoder.uint8Subarray()), array);
      };

      assertEncode(1, [1]);

      assertEncode(250, [250]);

      assertEncode(251, [251, 251, 0]);

      assertEncode(2 ** 16 - 1, [251, 255, 255]);

      assertEncode(2 ** 16, [252, 0, 0, 1, 0]);

      assertEncode(2 ** 32 - 1, [252, 255, 255, 255, 255]);

      assertEncode(2 ** 32, [253, 0, 0, 0, 0, 1, 0, 0, 0]);

      assertEncode(BigInt(2 ** 32), [253, 0, 0, 0, 0, 1, 0, 0, 0]);

      assertEncode(2n ** 64n - 1n, [253, 255, 255, 255, 255, 255, 255, 255, 255]);

      // note: u128 not supported
    });

    test('decodes uint (littleEndian)', () => {
      const assertEncode = (array, number) => {
        const decoder = new Bincode.Decoder(new Uint8Array(array));
        assert.equals(decoder.uintDecode(), number);
      };

      assertEncode([1], 1);
      assertEncode([251, 251, 0], 251);

      assertEncode([251, 255, 255], 2 ** 16 - 1);

      assertEncode([252, 0, 0, 1, 0], 2 ** 16);

      assertEncode([252, 255, 255, 255, 255], 2 ** 32 - 1);

      assertEncode([253, 0, 0, 0, 0, 1, 0, 0, 0], BigInt(2 ** 32));

      assertEncode([253, 255, 255, 255, 255, 255, 255, 255, 255], 2n ** 64n - 1n);
    });

    test('encodes signed int', () => {
      const assertEncode = buildAssert('int');

      assertEncode(-1, [1]);
      assertEncode(0, [0]);
      assertEncode(1, [2]);
      assertEncode(2, [4]);
      assertEncode(BigInt(2 ** 32 + 5), [253, 10, 0, 0, 0, 2, 0, 0, 0]);
      assertEncode(-BigInt(2 ** 32 + 5), [253, 9, 0, 0, 0, 2, 0, 0, 0]);
    });

    test('encodes string', () => {
      const assertEncode = buildAssert('str');

      assertEncode('hello', [5, 0, 0, 0, 0, 0, 0, 0, 104, 101, 108, 108, 111]);
    });

    test('custom', () => {
      const encoder = new Bincode.Encoder();

      encoder.u8Encode(3);
      encoder.strEncode('hello');
      encoder.f32Encode(5);
      encoder.boolEncode(true);

      const u8Ans = encoder.uint8Subarray();
      assert.equals(Array.from(u8Ans), [3, 5, 0, 0, 0, 0, 0, 0, 0, 104, 101, 108, 108, 111, 0, 0, 160, 64, 1]);

      const decoder = new Bincode.Decoder(u8Ans);

      assert.equals(decoder.u8Decode(), 3);
      assert.equals(decoder.strDecode(), 'hello');
      assert.equals(decoder.f32Decode(), 5);
      assert.equals(decoder.boolDecode(), true);
    });
  });
});
