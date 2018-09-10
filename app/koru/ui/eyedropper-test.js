isClient && define((require, exports, module)=>{
  const Dom             = require('koru/dom');
  const Geometry        = require('koru/geometry');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, util, match: m} = TH;

  const sut  = require('./eyedropper');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      sut.options = null;
      TH.domTearDown();
    });

    test("pick one option", ()=>{
      const div = Dom.h({style: "background-color:rgba(255, 0, 255, 0.5);width:300px;height:200px"});

      document.body.appendChild(div);
      const callback = stub();
      const bbox = div.getBoundingClientRect();

      sut.pick(callback);

      TH.trigger(document.body, 'pointerdown', {
        clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

      refute.dom('#SelectMenu');

      assert.calledWith(callback, null, m.near('rgba(255, 0, 255, 0.5)'));
    });

    test("pick with intercept", ()=>{
       const div = Dom.h({style: "background-color:rgb(255, 0, 255);width:300px;height:200px"});

      document.body.appendChild(div);
      const callback = stub();
      const bbox = div.getBoundingClientRect();

      const intercept = (elm, cs)=>{
        return {color: cs.getPropertyValue('background-color').replace(/\)/, ', 0.4)')};
      };

      sut.pick(callback, {intercept});

      TH.trigger(document.body, 'pointerdown', {
        clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

      assert.calledWith(callback, null, 'rgba(255, 0, 255, 0.4)');
    });

    test("pick no duplicates", ()=>{
      const div = Dom.h({style: "background-color:rgba(255, 0, 255, 0.5);width:300px;height:200px"});

      document.body.appendChild(div);
      const callback = stub();

      stub(sut, 'getPointColors');

      const bbox = div.getBoundingClientRect();
      sut.pick(callback);

      const clientX = bbox.left + .5*bbox.width, clientY = bbox.top + .5*bbox.height;

      TH.trigger(document.body, 'pointerdown', {clientX, clientY});

      assert.calledWith(sut.getPointColors, clientX, clientY, TH.match.func);

      sut.getPointColors.yield(null, {
        textColor: {r: 10, g: 20, b: 30, a: 1},
        backgroundColor: {r: 10, g: 20, b: 30, a: 1},
        imageColor: {r: 10, g: 20, b: 30, a: 1},
      });

      refute.dom('#SelectMenu');

      assert.calledWith(callback, null, 'rgb(10, 20, 30)');
    });

    test("image overrides", ()=>{
      const callback = stub();
      stub(sut, 'getPointColors');
      sut.pick(callback);
      TH.trigger(document.body, 'pointerdown', {clientX: 1, clientY: 2});

      assert.calledWith(sut.getPointColors, 1, 2);

      sut.getPointColors.yield(null, {
        imageColor: {r: 123, g: 213, b: 132, a: 1},
        borderColor: {r: 23, g: 23, b: 13, a: 1},
        textColor: {r: 12, g: 21, b: 13, a: 1},
        backgroundColor: {r: 13, g: 13, b: 12, a: 1},
      });

      refute.dom('#SelectMenu');

      assert.calledWith(callback, null, 'rgb(123, 213, 132)');
    });

    test("pick multi options", ()=>{
      const div = Dom.h({style: "background-color:#ffee33;", div: {style: 'border: 1px solid #556644;color:rgba(255, 0, 0, .8);', span: ["foo bar"]}});
      document.body.appendChild(div);
      document.body.appendChild(Dom.h({
        style: 'position:absolute;top:0;background-color:rgba(250,130,200,.09);width:300px;height:200px'}));
      const divCalled = stub();
      div.addEventListener('pointerdown', divCalled, true);

      let glassPane;

      const callback = stub(()=>{
        TH.trigger(document.body, 'pointerdown', {clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});
      });
      sut.pick(callback);

      glassPane = Dom('body>.glassPane:last-child');
      assert(glassPane);
      assert.className(document.body, 'eyedropper-active');

      const span = Dom('span');
      const bbox = span.getBoundingClientRect();

      TH.trigger(glassPane, 'pointerdown', {clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

      assert.dom('body>div', div =>{
        assert.same(div.style.visibility, '');
      });

      assert.dom('#SelectMenu', sm =>{
        Dom.remove(sm.parentNode);
      });

      refute.className(document.body, 'eyedropper-active');

      sut.pick(callback);

      glassPane = Dom('body>.glassPane:last-child');

      TH.trigger(glassPane, 'pointerdown', {clientX: bbox.left + .5*bbox.width, clientY: bbox.top + .5*bbox.height});

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

    test("getPointColors async html", ()=>{
      const div = Dom.h({style: "margin:20px;background-color:rgba(1, 2, 1, 0.9);", div: {
        style: "width:20px;height:30px;background-image:url('/foo.png')"
      }});
      document.body.appendChild(div);
      const dd = Dom('div>div');
      const bbox = dd.getBoundingClientRect();

      const callback = stub();

      stub(sut, 'getColorFromImage');

      sut.getPointColors(bbox.left + 1, bbox.top + 1, callback);

      let func;
      assert.calledWith(
        sut.getColorFromImage, dd, bbox.left + 1, bbox.top + 1, TH.match(f => func =f));

      func(null, 'imageColor');

      assert.calledWith(callback, null, {
        textColor: null,
        backgroundColor: {r: 1, g: 2, b: 1, a: m.near(0.9, 0.01)}, imageColor: 'imageColor'});
    });

    test("getPointColors svg", ()=>{
      const div = Dom.h({style: "margin:20px;background-color:rgba(1, 2, 1, 0.9);", svg: {
        rect: [], x: 5, width: 100, y: 5, height: 100,
        fill: 'rgba(51, 102, 153, 0.5)', style: 'stroke:#f4a3c2;stroke-width:5;'
      }});
      document.body.appendChild(div);
      const rect = Dom('rect');
      const bbox = rect.getBoundingClientRect();

      assert.equals(sut.getPointColors(bbox.left + 50, bbox.top + 50), {
        textColor: {r: 244, g: 163, b: 194, a: 1},
        backgroundColor: {r: 51, g: 102, b: 153, a: m.near(0.5, .01)}, imageColor: undefined});

      assert.equals(sut.getPointColors(bbox.left + 1, bbox.top + 1), {
        textColor: {r: 244, g: 163, b: 194, a: 1},
        backgroundColor: {r: 51, g: 102, b: 153, a: m.near(0.5, .01)}, imageColor: undefined});
    });

    test("getPointColors async svg", ()=>{
      const div = Dom.h({style: "margin:20px;background-color:rgba(1, 2, 1, 0.9);", svg: {
        rect: [], x: 5, width: 100, y: 5, height: 100,
        fill: 'rgba(51, 102, 153, 0.5)', style: 'stroke:#f4a3c2;stroke-width:5;'
      }});
      document.body.appendChild(div);
      const rect = Dom('rect');
      const bbox = rect.getBoundingClientRect();

      const callback = stub();

      stub(sut, 'getColorFromImage');

      sut.getPointColors(bbox.left + 1, bbox.top + 1, callback);

      let func;
      assert.calledWith(
        sut.getColorFromImage, Dom('svg'), bbox.left + 1, bbox.top + 1, TH.match(f => func = f));

      func(null, 'imageColor');

      assert.calledWith(callback, null, {
        textColor: {r: 244, g: 163, b: 194, a: 1},
        backgroundColor: {r: 51, g: 102, b: 153, a: m.near(0.5, .01)}, imageColor: 'imageColor'});
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

      const color = await new Promise((resolve, reject) => {
        sut.getColorFromImage(Dom('svg'), bbox.left+1, bbox.top+1, (err, color) => {
          if (err) reject(err);
          else resolve(color);
        });
      });
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

      const colors = await new Promise((resolve, reject)=>{
        sut.getPointColors(60, 410, (err, colors) =>{
          if (err) reject(err);
          else resolve(colors);
        });
      });

      assert.near(colors.imageColor, {r: 0, g: 0, b: 153, a: 1}, 0.001);
    });

    test("intercept", ()=>{
      document.body.appendChild(Dom.h([{
        id: 'div1',
        style: 'background-color:#fff;position:absolute;top:0;left:0;width:100px;height:100px'
      }, {
        id: 'div2',
        style: 'background-color:#fff;position:absolute;top:0;left:0;width:100px;height:100px'
      },
      ]));

      const colors = sut.getPointColors(10, 10, undefined, {intercept: (elm, cs) =>{
        return elm.id === 'div1'
          ? {color: '#0ff', textColor: '#f00'} : {color: null, borderColor: '#00fa'};
      }});

      assert.equals(colors, {
        textColor: {r: 255, g: 0, b: 0, a: 1},
        backgroundColor: {r: 0, g: 255, b: 255, a: 1},
        imageColor: undefined,
        borderColor: {r: 0, g: 0, b: 255, a: 0.6654}
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

      const color = await new Promise((resolve, reject) => {
        sut.getColorFromImage(Dom('svg'), x, y, (err, color) => {
          if (err) reject(err);
          else resolve(color);
        });
      });

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

      const color = await new Promise((resolve, reject)=>{
        sut.getColorFromImage(div, x, y, (err, color) => {
          if (err) reject(err);
          else resolve(color);
        });
      });

      assert.near(color, {r: 0, g: 255, b: 0, a: 1}, 0.001);
    });
  });
});
