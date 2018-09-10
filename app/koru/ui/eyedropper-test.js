isClient && define((require, exports, module)=>{
  const Dom             = require('koru/dom');
  const Geometry        = require('koru/geometry');
  const MockPromise     = require('koru/test/mock-promise');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, util, match: m, intercept} = TH;

  const sut  = require('./eyedropper');

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      sut.options = null;
      TH.domTearDown();
    });

    test("pick one option", async ()=>{
      const div = Dom.h({style: "background-color:rgba(255, 0, 255, 0.5);width:300px;height:200px"});

      document.body.appendChild(div);
      const bbox = div.getBoundingClientRect();

      const color = await new Promise((resolve, reject) => {
        const callback = (err, color)=>{
          if (err) reject(err);
          else resolve(color);
        };

        sut.pick(callback);

        TH.trigger(document.body, 'pointerdown', {
          clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});
      });

      refute.dom('#SelectMenu');

      assert.near(color, 'rgba(255, 0, 255, 0.5)');
    });

    test("pick with intercept", async ()=>{
       const div = Dom.h({style: "background-color:rgb(255, 0, 255);width:300px;height:200px"});

      document.body.appendChild(div);
      const bbox = div.getBoundingClientRect();

      const intercept = (elm)=>(
        {color: elm.style.getPropertyValue('background-color').replace(/\)/, ', 0.4)')});

      const color = await new Promise((resolve, reject) => {
        sut.pick((err, color)=>{
          if (err) reject(err);
          else resolve(color);
        }, {intercept});

        TH.trigger(document.body, 'pointerdown', {
          clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});
      });

      assert.equals(color, 'rgba(255, 0, 255, 0.4)');
    });

    test("pick all duplicates", ()=>{
      const div = Dom.h({style: "background-color:rgba(255, 0, 255, 0.5);width:300px;height:200px"});

      document.body.appendChild(div);
      const callback = stub();

      const mp = MockPromise.resolve({
        textColor: {r: 10, g: 20, b: 30, a: 1},
        backgroundColor: {r: 10, g: 20, b: 30, a: 1},
        imageColor: {r: 10, g: 20, b: 30, a: 1},
      });
      stub(sut, 'getPointColors').returns(mp);

      const bbox = div.getBoundingClientRect();
      sut.pick(callback);

      const clientX = bbox.left + .5*bbox.width, clientY = bbox.top + .5*bbox.height;

      TH.trigger(document.body, 'pointerdown', {clientX, clientY});

      assert.calledWith(sut.getPointColors, clientX, clientY);

      MockPromise._poll();

      refute.dom('#SelectMenu');

      assert.calledWith(callback, null, 'rgb(10, 20, 30)');
    });

    test("pick multi options", async ()=>{
      const div = Dom.h({
        style: "background-color:#ffee33;", div: {
          style: 'border: 1px solid #556644;color:rgba(255, 0, 0, .8);', span: ["foo bar"]}});
      document.body.appendChild(div);
      document.body.appendChild(Dom.h({
        style: 'position:absolute;top:0;background-color:rgba(250,130,200,.09);width:300px;height:200px'
      }));
      const divCalled = stub();
      div.addEventListener('pointerdown', divCalled, true);

      let glassPane;

      const callback = stub(()=>{
        TH.trigger(document.body, 'pointerdown', {
          clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});
      });
      sut.pick(callback);

      glassPane = Dom('body>.glassPane:last-child');
      assert(glassPane);
      assert.className(document.body, 'eyedropper-active');

      const span = Dom('span');
      const bbox = span.getBoundingClientRect();
      let resolve;
      const mo = new window.MutationObserver(() =>{resolve()});
      onEnd(()=>{mo.disconnect()});
      mo.observe(document.body, {childList: true});
      let menuPromise = new Promise(r =>{resolve = r});

      TH.trigger(glassPane, 'pointerdown', {
        clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

      assert.dom('body>div', div =>{assert.same(div.style.visibility, '')});

      await menuPromise;

      assert.dom('#SelectMenu', sm =>{Dom.remove(sm.parentNode)});
      refute.className(document.body, 'eyedropper-active');

      sut.pick(callback);

      glassPane = Dom('body>.glassPane:last-child');

      mo.takeRecords();
      menuPromise = new Promise(r =>{resolve = r});

      TH.trigger(glassPane, 'pointerdown', {
        clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

      await menuPromise;

      assert.className(document.body, 'eyedropper-active');
      assert.isNull(glassPane.parentNode);

      assert.dom('#SelectMenu.eyedropper-chooser', menu =>{
        assert.dom('li', {count: 3});
        assert.dom('li:last-child>div>div', elm =>{
          assert.colorEqual(elm.style.backgroundColor, [255, 0, 0, 0.8]);
        });
        assert.dom('li:nth-child(2)>div>div', elm =>{
          assert.colorEqual(elm.style.backgroundColor, [85, 102, 68, 1]);
        });
        assert.dom('li:first-child>div>div', elm =>{
          assert.colorEqual(elm.style.backgroundColor, [255, 238, 51]);
          TH.click(elm);
        });
      });

      refute.dom('#SelectMenu');
      refute.className(document.body, 'eyedropper-active');

      assert.calledOnceWith(callback, null, 'rgb(255, 238, 51)');
      refute.called(divCalled);
    });

    test("getPointColors html", async ()=>{
      const div = Dom.h({style: "margin:20px;background-color:rgba(100, 2, 1, 0.9);", div: {
        style: "width:20px;height:30px;background-color:rgba(1, 2, 1, 0.9);"+
          "background-image:url('/foo.png')"
      }});
      document.body.appendChild(div);
      const dd = Dom('div>div');
      const bbox = dd.getBoundingClientRect();

      stub(sut, 'getColorFromImage').returns({r: 123, g: 321, b: 0, a: .5});

      const colors = await sut.getPointColors(bbox.left + 1, bbox.top + 1);

      assert.calledWith(
        sut.getColorFromImage, dd, bbox.left + 1, bbox.top + 1);

      assert.equals(colors, {
        textColor: null,
        borderColor: null,
        imageColor: {r: 123, g: 321, b: 0, a: .5},
        backgroundColor: {r: 1, g: 2, b: 1, a: m.near(0.9, 0.01)}});
    });

    group("with svg", ()=>{
      let x, y;
      before(()=>{
        const div = Dom.h({style: "margin:20px;background-color:rgba(1, 2, 1, 0.9);", svg: {
          rect: [], x: 5, width: 100, y: 5, height: 100,
          fill: 'rgba(51, 102, 153, 0.5)', style: 'stroke:#f4a3c2;stroke-width:5;'
        }});
        document.body.appendChild(div);
        const rect = Dom('rect').getBoundingClientRect();
        x = rect.left+1, y = rect.top+1;
      });

      test("too translucent", async ()=>{
        const callback = stub();

        stub(sut, 'getColorFromImage').returns({r: 244, g: 163, b: 194, a: .01});

        const colors = await sut.getPointColors(x, y, callback);

        assert.equals(colors, {
          textColor: null,
          borderColor: null,
          backgroundColor: null, imageColor: null});
      });

      test("getPointColors svg", async ()=>{
        const callback = stub();

        stub(sut, 'getColorFromImage').returns({r: 244, g: 163, b: 194, a: .11});

        const colors = await sut.getPointColors(x, y, callback);

        assert.calledWith(sut.getColorFromImage, Dom('svg'), x, y);

        assert.equals(colors, {
          textColor: null,
          borderColor: null,
          backgroundColor: {r: 1, g: 2, b: 1, a: 0.9},
          imageColor: {r: 244, g: 163, b: 194, a: .11}});
      });
    });

    test("svg getColorFromImage", async ()=>{
      const div = Dom.h({
        viewBox: "0 0 300 150", width: 300, height: 150,
        style: "margin:20px;background-color:rgba(1, 2, 1, 0.9);",
        svg: {
          rect: [], x: 5, width: 100, y: 5, height: 100,
          fill: 'rgba(51, 102, 153, 0.5)', style: 'stroke:rgba(151, 22, 253, 0.8);stroke-width:5;'
        }
      });
      document.body.appendChild(div);
      const rect = Dom('rect');
      const bbox = rect.getBoundingClientRect();

      const color = await sut.getColorFromImage(Dom('svg'), bbox.left+1, bbox.top+1);

      assert.near(
        color, util.engine.startsWith('Firefox')
          ? {r: 122, g: 17, b: 206, a: 0.980}
        : util.engine.startsWith('Safari')
          ? {r: 127, g: 27, b: 220, a: 0.988} : {r: 126, g: 27, b: 220, a: 0.988},
        0.001);
    });

    test("layered images", async ()=>{
      const createSvg = mod => ({
        viewBox: "0 0 300 150", width: 300, height: 150,
        style: "position:absolute;left:50px;top:400px;",
        svg: Object.assign({
          rect: [], x: 0, width: 100, y: 0, height: 100,
          style: 'overflow:visible;',
        }, mod)
      });

      document.body.appendChild(Dom.h([
        createSvg({fill: 'rgba(0, 102, 0, 1)'}),
        createSvg({stroke: 'rgba(0, 0, 153, 1)', fill: 'none', 'stroke-width': '200'})
      ]));

      const colors = await sut.getPointColors(60, 410);

      assert.near(colors.imageColor, {r: 0, g: 0, b: 153, a: 1}, 0.001);
    });

    test("intercept", async ()=>{
      document.body.appendChild(Dom.h([{
        id: 'div1',
        style: 'background-color:#fff;position:absolute;top:0;left:0;width:100px;height:100px'
      }, {
        id: 'div2',
        style: 'background-color:rgba(0,0,0,.01);position:absolute;top:0;left:0;width:100px;height:100px'
      },
      ]));

      const colors = await sut.getPointColors(10, 10, {intercept: (elm, cs) =>{
        return elm.id === 'div1' && {borderColor: '#0ff', textColor: '#f00'};
      }});

      assert.equals(colors, {
        textColor: {r: 255, g: 0, b: 0, a: 1},
        backgroundColor: {r: 255, g: 255, b: 255, a: 1},
        imageColor: null,
        borderColor: {r: 0, g: 255, b: 255, a: 1}
      });
    });

    test("transformed svg getColorFromImage", async ()=>{
      const div = Dom.h({
        viewBox: "0 0 300 150", width: 300, height: 150,
        style: "position:absolute;left:50px;top:400px;background-color:rgb(160, 160, 160);"
          + 'transform-origin: 50%  100%;'
          + 'transform: rotate(-30deg) translate(10px, 20px);'
          ,
        svg: {
          rect: [], x: 90, width: 100, y: 30, height: 100,
          fill: 'rgba(51, 102, 153, 0.5)',
          style: 'overflow:visible;stroke:rgb(151, 22, 253);stroke-width:5;'
        }
      });
      document.body.appendChild(div);
      const svg = Dom('svg');
      const dr = svg.getBoundingClientRect();

      const ox = 190, oy = 190;

      const x = dr.left + ox, y = dr.top + oy;

      sut.options = {setupSvg(svgc, ox, oy, orig) {
        assert.equals(ox, x-dr.left);
        assert.equals(oy, y-dr.top);
        assert.same(orig, svg);

        svgc.lastChild.style.setProperty('stroke', 'rgb(155, 50, 253)');
      }};

      const color = await sut.getColorFromImage(Dom('svg'), x, y);

      assert.equals(color, {r: 155, g: 50, b: 253, a: 1});
    });

    test("png getColorFromImage", async ()=>{
      const div = Dom.h({
        style: 'border: 1px solid black;margin:150px;'+
          'background: url(/koru/ui/test-box.png) no-repeat 0 0/100%;width:200px;height:200px;'+
          'transform-origin: 50%  100%;'+
          'transform: rotate(-30deg) translate(0px, 0px);',
        div: {}});
      document.body.appendChild(div);

      const dr = div.getBoundingClientRect();
      const ox = 70, oy = 185;
      const x = dr.left + ox, y = dr.top + oy;

      const color = await sut.getColorFromImage(div, x, y);

      assert.near(color, {r: 0, g: 255, b: 0, a: 1}, 0.001);
    });
  });
});
