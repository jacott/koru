define((require, exports, module) => {
  'use strict';
  const Random          = require('koru/random');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const MathUtil = require('./math-util');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('normDist', () => {
      /**
       * Make a function that generates a normal distribution of random numbers. Uses the
       * [Marsaglia polar method](https://en.wikipedia.org/wiki/Marsaglia_polar_method)

       * @param rng the random number generation; needs to generate a uniform real distribution
       * between 0 and 1.

       * @param mean
       * @param stdDev the standard deviation
       */
      api.method();
      //[
      assert.same(typeof MathUtil.normDist(), 'function');

      const r = new Random(3);
      const rng = () => r.fraction();
      const ndg = MathUtil.normDist(rng, 4, 2);

      assert.near(ndg(), 7.1357, 0.001);
      assert.near(ndg(), 5.5578, 0.001);
      assert.near(ndg(), 4.2491, 0.001);
      //]
    });
  });
});
