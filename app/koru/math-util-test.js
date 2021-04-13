define((require, exports, module)=>{
  'use strict';
  const Random          = require('koru/random');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const MathUtil = require('./math-util');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("normDist", ()=>{
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

      const rng = Random.prototype.fraction.bind(new Random(1));
      const ndg = MathUtil.normDist(rng, 4, 2);

      assert.near(ndg(), 4.904, 0.001);
      assert.near(ndg(), 2.093, 0.001);
      assert.near(ndg(), 5.344, 0.001);
      //]
    });

  });
});
