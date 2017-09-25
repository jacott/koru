define(function (require, exports, module) {
  const Dom             = require('koru/dom');
  const api             = require('koru/test/api');
  const TH              = require('./test');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./geometry');

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


      // show visually
      // const ps = [150,200], cs = [25,-100], ce = [575,700], pe = [400,300];
      // const {left, top, right, bottom} = sut.bezierBox(ps, cs, ce, pe);

      // const width = right-left, height = bottom-top;
      // const sw = 50;

      // Dom.remove(Dom('div'));
      // document.body.appendChild(Dom.h({
      //   style: `position:absolute;border:1px solid blue;`+
      //     `left:${left-sw}px;top:${top-sw}px;width:${width+sw*2}px;height:${height+sw*2}px`,
      //   div: {
      //     viewBox: `${left-sw} ${top-sw} ${width+sw*2} ${height+sw*2}`,
      //     style: `overflow:visible`,
      //     svg: {
      //       style: `stroke: #f00; stroke-width:${sw*2};fill:none`,
      //       d: `M${ps[0]},${ps[1]} C${cs[0]},${cs[1]} ${ce[0]},${ce[1]} ${pe[0]},${pe[1]}`,
      //       path: [],
      //     },
      //   }
      // }));

    },
  });
});
