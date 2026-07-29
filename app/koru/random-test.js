define((require, exports, module) => {
  'use strict';
  /**
   * Generate random fractions and ids using a

   * [pseudo-random number generator (PRNG)](https://en.wikipedia.org/wiki/Pseudorandom_number_generator)

   * or a

   * [cryptographically secure PRNG (CSPRNG)](https://en.wikipedia.org/wiki/Cryptographically_secure_pseudorandom_number_generator).

   * If a CSRNG is not available on the client then some random like tokens will be used to seed a
   * PRNG instead.
   *
   * The PRNG uses `asSequence` in {#koru/id} to generate the sequence.
   *
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, match: m, intercept} = TH;

  const Random = require('./random');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('constructor', () => {
      /**
       * Create a new PRNG.
       *
       * @param tokens a list of tokens to seed a PRNG or empty for a CSPRNG.
       *
       * @alias create a deprecated alternative static method.
       */
      const Random = api.class();
      //[
      // seeded
      const r1 = new Random(0);
      assert.same(r1.id(), 'iOS64Lq3DR2IP9ZC1');
      assert.same(r1.id(), 'KPO5qmd1YhMXcaGuK');

      // same seed produces same numbers
      assert.same(new Random(0).id(), 'iOS64Lq3DR2IP9ZC1');

      // multiple tokens
      const r2 = new Random('hello', 'world');
      assert.same(r2.id(), 'l0sCeII8FPxy3ypeS');

      const csprng = new Random();
      refute.same(csprng.id(), 'IwillNeverMatchid');
      assert.equals(csprng.id(), m(/^[-~0-9a-zA-Z]{17,17}$/));
      //]
    });

    test('properties', () => {
      api.property('global', {info: `a instance of a CSPRNG`});

      assert.same(Random.global.constructor, Random);
    });

    test('id', () => {
      /**
       * Generate a new random id using the {##id} method from firstly: {#koru/util.thread}`.random`
       * if defined; otherwise `random.global`. Using `util.thread.random` allows for repeatable and
       * effecient ids to be produced for a database transaction.
       */
      api.method();

      after(() => {
        util.thread.random = null;
      });
      //[
      intercept(Random.global, 'id', () => 'aGlobalId');
      assert.same(Random.id(), 'aGlobalId');

      const id = 'abc123';
      util.thread.random = new Random(id);
      assert.same(Random.id(), 'kwQQybVKe2B2GKN4k');
      //]
    });

    test('hexString', () => {
      /**
       * Like {#.id} but generate a {##hexString} (upto 32 chars) instead.
       */
      api.method();

      after(() => {
        util.thread.random = null;
      });
      //[
      intercept(Random.global, 'hexString', (n) => 'f007ba11c4a2'.slice(0, n));
      assert.same(Random.hexString(8), 'f007ba11');

      const token = 'abc123';
      util.thread.random = new Random(token);
      assert.same(Random.hexString(31), '6f8155d1c00c69059afdb6edaf9539b');
      //]
    });

    group('prototype', () => {
      test('id', () => {
        /**
         * Generate a sequence of characters suitable for {#koru/model/main} ids.
         *
         * @return token of {#koru/util}.idLen characters from the set `[0-9A-Za-z]`
         */
        api.protoMethod();
        //[
        const random = new Random(1);
        assert.same(random.id(), 'NAQ9ejpyZq-CQFrcd');
        assert.same(random.id(), 'ZDK6jFbX6cElilhaV');
        assert.same(random.id(), 'jsMp17ySTx1fUCFCY');
        //]
        assert.same(random.id(), 'rJqbAoZ7Vw5BovDfu');
      });

      test('fraction', () => {
        /**
         * Generate a number between 0 and 1.
         */
        api.protoMethod();
        //[
        const random = new Random(1, 2, 3);

        assert.equals(random.fraction(), 0.6270329139315577);
        assert.equals(random.fraction(), 0.32087942231861044);
        assert.equals(random.fraction(), 0.5668917679832505);
        assert.equals(random.fraction(), 0.21724463278327122);
        //]
      });

      test('hexString', () => {
        /**
         * Generate a sequence of hexadecimal characters.
         *
         * @param digits the number of digits to generate.
         */
        api.protoMethod();
        //[
        const random = new Random(6);
        assert.same(random.hexString(2), 'a3');
        assert.same(random.hexString(7), '951c7ca');
        //]
      });
    });

    test('format', () => {
      const randSpy = spy(globalThis.crypto, 'getRandomValues');
      const id = Random.id();
      assert.same(id.length, util.idLen);
      assert.match(id, /^[-~0-9a-zA-Z]*$/);

      assert.calledWith(randSpy, m((u32) => u32.constructor === BigUint64Array));

      randSpy.reset();

      const rand = new Random();

      const numDigits = 9;
      const hexStr = rand.hexString(numDigits);

      let u8;

      assert.calledWith(randSpy, m((a) => u8 = new Uint8Array(a.buffer)));
      assert.equals(util.twoDigits(u8[2].toString(16)), hexStr.substring(4, 6));

      assert.same(hexStr.length, numDigits);
      parseInt(hexStr, 16); // should not throw
      const frac = rand.fraction();
      assert.isTrue(frac < 1.0);
      assert.isTrue(frac >= 0.0);
    });
  });
});
