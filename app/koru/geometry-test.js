define(function (require, exports, module) {
  const api             = require('koru/test/api');
  const TH              = require('./test');

  const {stub, spy, onEnd, util} = TH;

  const sut = require('./geometry');

  TH.testCase(module, {
    setUp() {
      api.module(module);
    },

    "test combineBox"() {
      /**
       * Combine two boundry boxes
       *
       * @param a the first boundry box which is modified to include the second

       * @param b the second boundry box

       * @returns `a`
       **/
      api.method('combineBox');
      const a = {left: 0, top: 0, right: 20, bottom: 25};
      const b = {left: -20, top: -25, right: 0, bottom: 0};
      assert.same(sut.combineBox(a, b), a);
      assert.equals(a, {left: -20, top: -25, right: 20, bottom: 25});

      assert.equals(sut.combineBox(a, {left: -10, top: -15, right: 10, bottom: 15}),
                    {left: -20, top: -25, right: 20, bottom: 25});

      assert.equals(sut.combineBox(a, {left: -40, top: -55, right: 60, bottom: 95}),
                    {left: -40, top: -55, right: 60, bottom: 95});
    },

    "test combineBoxPoint"() {
      /**
       * Combine a point into a boundy box
       *
       * @param box the boundry box which is modified to include the point

       * @param x the x coordinate of the point

       * @param y the y coordinate of the point

       * @returns `box`
       **/
      api.method('combineBoxPoint');
      const box = {left: 0, top: 0, right: 20, bottom: 25};
      assert.same(sut.combineBoxPoint(box, -20, -25), box);
      assert.equals(box, {left: -20, top: -25, right: 20, bottom: 25});

      assert.equals(sut.combineBoxPoint(box, 10, 15),
                    {left: -20, top: -25, right: 20, bottom: 25});

      assert.equals(sut.combineBoxPoint(box, 100, 150),
                    {left: -20, top: -25, right: 100, bottom: 150});
    },

    "test tPoint"() {
      /**
       * Calculate the point at t along a line or a bezier curve

       * @param t 0 < t < 1 where 0 is start point and 1 is end point

       * @param ps start point

       * @param curve bezier curve (See {##bezierBox}) or end point for line

       * @returns the midpoint in form `[x, y]`
       **/
      api.method('tPoint');

      assert.equals(sut.tPoint(0, [10, 30], [-40, 70]), [10, 30]);
      assert.equals(sut.tPoint(.5, [10, 30], [-40, 70]), [-15, 50]);
      assert.equals(sut.tPoint(1, [10, 30], [-40, 70]), [-40, 70]);

      assert.equals(sut.tPoint(0, [0,0], [0,0, 20,25, 20,25]),
                    [0, 0]);

      assert.equals(sut.tPoint(.5, [0,0], [0,0, 20,25, 20,25]),
                    [10, 12.5]);

      assert.equals(sut.tPoint(1, [0,0], [0,0, 20,25, 20,25]),
                    [20, 25]);

      assert.near(sut.tPoint(.5, [10000,20000], [-5000,-10000, 57500,70000, 40000,30000]),
                  [25938, 28750]);
    },

    "test bezierBox"() {
      /**
       * Calculate the boundry box for a cubic bezier curve
       *
       * @param ps start point

       * @param curve of the form `[csx,csy, cex,cey, pex,pey]` where:

       * * `csx,csy` is the control point for the start

       * * `cex,cey` is the control point for the end

       * * `pex,pey` is the end point

       * @returns boundryBox in format `{left, top, right, bottom}`
       **/
      api.method('bezierBox');
      assert.equals(sut.bezierBox([0,0], [0,0, 20,25, 20,25]),
                    {left: 0, top: 0, right: 20, bottom: 25});

      assert.equals(sut.bezierBox([0,0], [0,0, -20,-25, -20,-25]),
                    {left: -20, top: -25, right: 0, bottom: 0});

      assert.equals(sut.bezierBox([0,0], [0,0, -20,-25, -20,-25]),
                    {left: -20, top: -25, right: 0, bottom: 0});

      assert.near(sut.bezierBox([10000,20000], [-5000,-10000, 57500,70000, 40000,30000]),
                    {left: 7653, top: 13101, right: 43120, bottom: 41454});


      // // show visually
      // const ps = [150,200], c = [25,-100, 575,700, 400,300];
      // const {left, top, right, bottom} = sut.bezierBox(ps, c);

      // const width = right-left, height = bottom-top;
      // const sw = 5;

      // const [cx, cy] = sut.tPoint(.95, ps, c);

      // Dom.remove(Dom('div'));
      // document.body.appendChild(Dom.h({
      //   style: `position:absolute;border:1px solid blue;`+
      //     `left:${left-sw}px;top:${top-sw}px;width:${width+sw*2}px;height:${height+sw*2}px`,
      //   div: {
      //     viewBox: `${left-sw} ${top-sw} ${width+sw*2} ${height+sw*2}`,
      //     style: `overflow:visible`,
      //     svg: [{
      //       style: `stroke: #f00; stroke-width:${sw*2};fill:none`,
      //       d: `M${ps[0]},${ps[1]} C${c.join(',')}`,
      //       path: [],
      //     }, {
      //       style: `fill:blue`,
      //       circle: [],
      //       r: 5, cx, cy
      //     }],
      //   }
      // }));
    },
  });
});
