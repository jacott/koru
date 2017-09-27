define(function (require, exports, module) {
  const Dom             = require('koru/dom');
  const api             = require('koru/test/api');
  const TH              = require('./test');

  const {stub, spy, onEnd, util} = TH;
  const {SVGNS} = Dom;

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

    "test tTangent"() {
      /**
       * Calculate the point at t along a line or a bezier curve

       * @param t 0 < t < 1 where 0 is start point and 1 is end point

       * @param ps start point

       * @param curve bezier curve (See {##bezierBox}) or end point for line

       * @returns the tangent normalized vector in form `[xd, yd]`
       **/
      api.method('tTangent');
      assert.near(sut.tTangent(0, [10, 30], [-40, 70]), [-0.7808, 0.6246], 0.0001);
      const tn = sut.tTangent(.3, [10, 30], [-40, 70]);
      assert.near(tn, [-0.7808, 0.6246], 0.0001);
      assert.same(tn[0]*tn[0]+tn[1]*tn[1], 1);

      assert.near(sut.tTangent(0, [0,0], [0,0, 20,25, 20,25]),
                  sut.tTangent(0, [0,0], [20,25]), 0.00001);

      assert.equals(sut.tTangent(.5, [0,0], [0,0, 20,25, 20,25]),
                    sut.tTangent(0, [0,0], [20,25]));

      assert.near(sut.tTangent(1, [0,0], [0,0, 20,25, 20,25]),
                  sut.tTangent(.5, [0,0], [20,25]), 0.00001);

      assert.near(sut.tTangent(.5, [10000,20000], [-5000,-10000, 57500,70000, 40000,30000]),
                  [0.71672, 0.69735], 0.00001);
    },

    "test closestT"() {
      /**
       * Calculate t along a line or a bezier curve closes to point

       * @param point the point to project on to curve

       * @param ps start point

       * @param curve bezier curve (See {##bezierBox}) or end point for line

       * @returns t along the curve
       **/
      api.method('closestT');

      {
        /** line **/
        const ps = [300, 30], curve = [100, 70];

        // addPath({d: ['M', ps, 'L', curve].join('')});

        // const cx = 230, cy = 150;

        // var [ax, ay] = sut.tPoint(sut.closestT([cx, cy], ps, curve), ps, curve);
        // addCircle({r: 10, cx, cy, color: 'pink'});
        // addCircle({r: 10, cx: ax, cy: ay});

        assert.equals(sut.closestT(ps, ps, curve), 0);
        assert.equals(sut.closestT(curve, ps, curve), 1);
        assert.equals(sut.closestT([-15, 50], ps, curve), 1);
        assert.near(sut.closestT([230, 150], ps, curve), 0.4519, 0.0001);


        assert.equals(sut.closestT([-1000, -3000], ps, curve), 1);
        assert.equals(sut.closestT([2500, 43], ps, curve), 0);
      }

      {
        /** bezier **/

        const ps = [300, 130], curve = [-400, -200, 1140, 500, 200, 100];

        assert.equals(sut.closestT(ps, ps, curve), 0);
        assert.equals(sut.closestT(curve.slice(4), ps, curve), 1);
        assert.near(sut.closestT([-15, 50], ps, curve), 0.19700, 0.0001);
        assert.near(sut.closestT([195, 100], ps, curve), 1, 0.0001);
        assert.near(sut.closestT([600, 200], ps, curve), 0.74987, 0.0001);
        assert.near(sut.closestT([-1000, -3000], ps, curve), 0.20027, 0.00001);
      }

      assert.equals(sut.closestT([-14, 0], [0,0], [0,0, 20,25, 20,25]),
                    0);

      assert.near(sut.closestT([10, 12.5], [0,0], [0,0, 20,25, 20,25]),
                  .5, 0.00001);

      assert.equals(sut.closestT([20, 25], [0,0], [0,0, 20,25, 20,25]),
                    1);

      assert.near(sut.closestT(
        [25978, 28790], [10000,20000], [-5000,-10000, 57500,70000, 40000,30000]),
                  .50059, 0.00001);
    },

    "test splitBezier"() {
      /**
       * Split a bezier curve into two at point t. The passed curve is modified and the second curve
       * is returned.

       * @param t 0 < t < 1 where 0 is start point and 1 is end point

       * @param ps start point

       * @param curve bezier curve (See {##bezierBox})

       * @returns the second curves in form `[cs, ce, pe]`
       **/
      api.method('splitBezier');

      const curve1 = [-5000,-10000, 57500,70000, 40000,30000];
      const curve2 = sut.splitBezier(.5, [10000,20000], curve1);

      assert.equals(curve1, [2500, 5000, 14375, 17500, 25937.5, 28750]);
      assert.equals(curve2, [37500, 40000, 48750, 50000, 40000, 30000]);
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

      // const t = .1;

      // const [cx, cy] = sut.tPoint(t, ps, c);

      // const {left: c1, right: c2} = sut.splitBezier(t, ps, c);

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
      //       style: `stroke: #000; stroke-width:1;fill:none`,
      //       d: `M${c1.ps[0]},${c1.ps[1]} C${c1.curve.join(',')}`,
      //       path: [],
      //     }, {
      //       style: `stroke: #fff; stroke-width:1;fill:none`,
      //       d: `M${c2.ps[0]},${c2.ps[1]} C${c2.curve.join(',')}`,
      //       path: [],
      //     }, {
      //       style: `fill:blue`,
      //       circle: [],
      //       r: 5, cx, cy
      //     }],
      //   }
      // }));
    },

    // "test draw"() {
    //   //const ps = [400, 330], curve = [-200, 100, 700, 100, 400, 330];
    //   const ps = [300, 130], curve = [-400, -200, 1140, 500, 200, 100];

    //   addPath({d: ['M', ps, 'C', curve]});

    //   const blue = addCircle({});


    //   const path = addPath({strokeWidth: 2, color: 'black'});

    //   const point = [100, 260];

    //   const pink = addCircle({cx: point[0], cy: point[1], color: 'pink'});

    //   const drawt = (t)=>{
    //     var [cx, cy] = sut.tPoint(t, ps, curve);
    //     var [tx, ty] = sut.tTangent(t, ps, curve);
    //     let d = ['M', [cx+tx*50, cy+ty*50], 'L', [cx-tx*50, cy-ty*50]].join('');

    //     pink.setAttribute('cx', point[0]);
    //     pink.setAttribute('cy', point[1]);

    //     blue.setAttribute('cx', cx);
    //     blue.setAttribute('cy', cy);
    //     path.setAttribute('d', d);
    //   };

    //   drawt(sut.closestT(point, ps, curve, 0.00001));


    //   getSvg().addEventListener('pointermove', ev=>{
    //     point[0] = ev.clientX - 20;
    //     point[1] = ev.clientY - 20;
    //     drawt(sut.closestT(point, ps, curve, 0.00001));
    //     //   ip = sut.closestT(point, ps, curve);
    //     //   drawt(t += ev.which == 66 ? -.01 : 0.01);
    //   });
    // },
  });

  const test$ = Symbol();

  const getSvg = ()=>{
    let div = Dom('div');
    if (div != null) {
      if (div[test$] === TH.test) return div.querySelector('svg');
      Dom.remove(div);
    }
    div = Dom.h({
      style: `position:absolute;border:1px solid blue;`+
        `left:20px;top:20px;width:600px;height:600px`,
      div: {
        viewBox: `0 0 600 600`,
        style: `overflow:visible`,
        svg: []
      }
    });
    div[test$] = TH.test;
    document.body.appendChild(div);
    return div.querySelector('svg');
  };

  const addPath = ({d='', color='red', strokeWidth=5})=>{
    const svg = getSvg();
    const shape = Dom.h({
      path: [],
      d: typeof d === 'string' ? d : d.join(''),
      style: `fill:none;stroke:${color};stroke-width:${strokeWidth}`
    }, SVGNS);
    svg.appendChild(shape);
    return shape;
  };

  const addCircle = ({r=5, cx=0, cy=0, color='blue'})=>{
    const svg = getSvg();
    const shape = Dom.h({
      circle: [], r, cx,cy, style: `fill:${color}`
    }, SVGNS);
    svg.appendChild(shape);
    return shape;
  };

});
