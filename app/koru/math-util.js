define(()=>{
  'use strict';

  return {
    normDist: (rng=Math.random, mean=0, stdDev=1) => {
      let hasSpare = false, spare = 0;

      return () => {
        if (hasSpare) {
          hasSpare = false;
          return spare * stdDev + mean;
        } else {
          let u = 0, v = 0, s = 0;
          do {
            u = rng() * 2 - 1;
            v = rng() * 2 - 1;
            s = u * u + v * v;
          } while (s >= 1 || s == 0);
          s = Math.sqrt(-2.0 * Math.log(s) / s);
          spare = v * s;
          hasSpare = true;
          return mean + stdDev * u * s;
        }
      };
    },
  };
});
