isClient && define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const Dom             = require('./dom-client');

  require('./range-select');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let list;
    beforeEach(()=>{
      document.body.appendChild(list = Dom.h({
        div: [0,1,2,3,4,5].map(i => Dom.h({div: "row "+i}))
      }));
    });

    afterEach(()=>{
      Dom.removeChildren(document.body);
    });

    test("toggle", ()=>{
      assert.dom(list, self => {
        assert.dom('div', 'row 2', self => {
          const selected = Dom.selectRange(self, {});
          assert.className(self, 'selected');
          const foo = Dom.selectRange(self, {}, 'foo');
          assert.className(self, 'foo');

          refute.same(selected, foo);

          assert.same(Dom.selectRange(self, {}, 'foo'), foo);

          refute.className(self, 'foo');

          // on class should not affect another
          assert.same(selected.length, 1);
          assert.same(foo.length, 0);

        });
      });
    });

    test("shift range", ()=>{
      assert.dom(list, ()=>{
        assert.dom('div', 'row 2', elm =>{
          Dom.selectRange(elm, {});
        });

        assert.dom('div', 'row 4', elm =>{
          Dom.selectRange(elm, {shiftKey: true});
          assert.className(elm, 'selected');
        });

        assert.dom('div.selected', {count: 3});
      });
    });

    test("control toggle", ()=>{
      assert.dom(list, ()=>{
        assert.dom('div', 'row 2', elm =>{
          Dom.selectRange(elm, {ctrlKey: true});
        });

        let selected;
        assert.dom('div', 'row 4', elm=>{
          selected = Dom.selectRange(elm, {shiftKey: true});
        });

        assert.dom('div', 'row 3', elm=>{
          assert.className(elm, 'selected');
          Dom.selectRange(elm, {ctrlKey: true});
          assert.same(selected.length, 2);

          Dom.selectRange(elm);
          assert.same(selected.length, 1);
          assert.same(selected[0], elm);
        });

        assert.dom('div.selected', {count: 1});
      });
    });
  });
});
