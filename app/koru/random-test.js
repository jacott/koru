define((require, exports, module)=>{
  'use strict';
  /**
   * Generate random fractions and ids using a

   * [pseudo-random number generator (PRNG)](https://en.wikipedia.org/wiki/Pseudorandom_number_generator)

   * or a

   * [cryptographically secure PRNG (CSPRNG)](https://en.wikipedia.org/wiki/Cryptographically_secure_pseudorandom_number_generator).

   * If a CSRNG is not available on the client then some random like tokens will be used to seed a
   * PRNG instead.
   *
   * The PRNG uses {#koru/srp/acc-sha256} to generate the sequence.
   *
   **/
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, match: m, intercept} = TH;

  const Random = require('./random');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("constructor", ()=>{
      /**
       * Create a new PRNG.
       *
       * @param tokens a list of tokens to seed a PRNG or empty for a CSPRNG.
       *
       * @alias create a deprecated alternative static method.
       **/
      const Random = api.class();
      //[
      // seeded
      const r1 = new Random(0);
      assert.same(r1.id(), "kFsE9G6DL26jiPd2U");
      assert.same(r1.id(), "o8kyB8YoOT2NCM03U");

      // same seed produces same numbers
      assert.same(new Random(0).id(), "kFsE9G6DL26jiPd2U");

      // multiple tokens
      const r2 = new Random("hello", "world");
      assert.same(r2.id(), 'NTuiM1uEZR7vz2Nd5');

      const csprng = new Random();
      refute.same(csprng.id(), 'IwillNeverMatchid');
      //]
    });

    test("properties", ()=>{
      api.property('global', {info: `a instance of a CSPRNG`});

      assert.same(Random.global.constructor, Random);
    });

    test("id", ()=>{
      /**
       * Generate a new random id using the {##id} method from firstly: {#koru/util.thread}`.random`
       * if defined; otherwise `random.global`. Using `util.thread.random` allows for repeatable and
       * effecient ids to be produced for a database transaction.
       **/
      api.method();

      onEnd(() => {util.thread.random = null});
      //[
      intercept(Random.global, 'id', ()=>'aGlobalId');
      assert.same(Random.id(), "aGlobalId");

      const id = "abc123";
      util.thread.random = new Random(id);
      assert.same(Random.id(), "kfx4FPotz6UerPhgc");
      //]
    });

    test("hexString", ()=>{
      /**
       * Like {#.id} but generate a {##hexString} instead.
       **/
      api.method();

      onEnd(() => {util.thread.random = null});
      //[
      intercept(Random.global, 'hexString', (n)=>'f007ba11c4a2'.slice(0,n));
      assert.same(Random.hexString(8), "f007ba11");

      const token = "abc123";
      util.thread.random = new Random(token);
      assert.same(Random.hexString(33), 'ce8b9dfb29ed185b23fd764c97af4f108');
      //]
    });

    group("prototype", ()=>{
      test("id", ()=>{
        /**
         * Generate a sequence of characters suitable for {#koru/model/main} ids.
         *
         * @return token of {#koru/util}.idLen characters from the set `[0-9A-Za-z]`
         **/
        api.protoMethod();
        //[
        const random = new Random(0);
        assert.same(random.id(), "kFsE9G6DL26jiPd2U");
        assert.same(random.id(), "o8kyB8YoOT2NCM03U");
        assert.same(random.id(), "3KkBsZqIxSLG9cNmT");
        //]
        assert.same(random.id(), "j1JePqz3IKW31RKSR");
      });

      test("fraction", ()=>{
        /**
         * Generate a number between 0 and 1.
         **/
        api.protoMethod();
        //[
        const random = new Random(1,2,3);

        assert.equals(random.fraction(), 0.26225688261911273);
        assert.equals(random.fraction(), 0.5628666188567877);
        assert.equals(random.fraction(), 0.09692026115953922);
        //]
      });

      test("hexString", ()=>{
        /**
         * Generate a sequence of hexadecimal characters.
         *
         * @param digits the number of digits to generate.
         **/
        api.protoMethod();
        //[
        const random = new Random(6);
        assert.same(random.hexString(2), "c7");
        assert.same(random.hexString(7), "e8b19da");
        //]
      });
    });

    test("format", ()=>{
      const randSpy = isServer ? spy(requirejs.nodeRequire('crypto'), 'randomBytes')
              : spy(window.crypto, 'getRandomValues');
      const id = Random.id();
      assert.same(id.length, util.idLen);
      assert.match(id, /^[0-9a-zA-Z]*$/);


      if (isServer) {
        assert.calledWith(randSpy, 17);
      } else {
        assert.calledWith(randSpy, m(
          u32 => u32.constructor === Uint32Array));
      }

      randSpy.reset();

      const rand = new Random();

      const numDigits = 9;
      const hexStr = rand.hexString(numDigits);

      let u8;

      if (isServer) {
        assert.calledWith(randSpy, 5);
        u8 = randSpy.firstCall.returnValue;
      } else {
        assert.calledWith(randSpy, m(a => u8 = a));
      }
      assert.equals(util.twoDigits(u8[2].toString(16)), hexStr.substring(4, 6));

      assert.same(hexStr.length, numDigits);
      parseInt(hexStr, 16); // should not throw
      const frac = rand.fraction();
      assert.isTrue(frac < 1.0);
      assert.isTrue(frac >= 0.0);
    });
  });
});
