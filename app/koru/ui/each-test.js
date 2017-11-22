isClient && define(function (require, exports, module) {
  const Ctx     = require('koru/dom/ctx');
  const Dom     = require('../dom');
  const eachTpl = require('../html!./each-test');
  const Model   = require('../model/main');
  const TH      = require('../model/test-helper');
  const util    = require('../util');

  const {stub, spy, onEnd} = TH;
  const {endMarker$} = require('koru/symbols');
  const $ = Dom.current;

  const each    = require('./each');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.Each = Dom.newTemplate(util.deepCopy(eachTpl));

      v.Each.$helpers({
        fooList: v.fooList = stub(),
      });

      Dom.newTemplate({
        name: "Test.Each.Each_fooList",
        nodes: [{
          name:"li",
          attrs:[["=","id",["", "id"]]],
          children: [["","name"]],
        }],
      });
    },

    tearDown() {
      Dom.removeChildren(document.body);
      Dom.Test = undefined;
      v = null;
    },

    "test default template"() {
      v.Each.nodes[0].children[1].pop();

      const query = {
        compare: util.compareByName,
        compareKeys: ['name', 'id'],
        matches() {return true},
        forEach(func) {func({id: "id1", name: 'r1'})},
      };

      assert.dom(v.Each.$render({}), elm => {
        v.fooList.firstCall.args[0].autoList({
          query,
        });
        assert.dom('li#id1', 'r1');
      });
    },

    "test calling global helper"() {
      delete v.Each._helpers.fooList;
      Dom.registerHelpers({
        fooList: stub(),
      });

      onEnd(() => delete Dom._helpers.fooList);

      v.Each.$render({});

      assert.called(Dom._helpers.fooList);
    },

    "each.autoList": {
      setUp() {
        v.TestModel = Model.define('TestModel').defineFields({
          id1: 'text',
          id2: 'text',
          name: 'text',
          score: 'number',
        });
        v.doc1 = v.TestModel.create({id1: '1', id2: '2', name: 'bob'});
        v.doc2 = v.TestModel.create({id1: '1', id2: '2', name: 'alice'});
        v.other = v.TestModel.create({id1: '2', id2: '3', name: 'Caprice'});
      },

      tearDown() {
        Model._destroyModel('TestModel', 'drop');
      },

      "test sort by field name"() {
         v.Each.$helpers({
          fooList(each) {
            return each.autoList({
              query: v.TestModel.where({id1: $.data().major, id2: '2'}).sort('name'),
              changed: v.changedStub = stub(),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.dom('li', {count: 2});
          assert.dom('li:first-child', 'alice');
          assert.dom('li:nth-child(2)', 'bob');
        });
      },

      "test query"() {
        let count = 0;
        v.Each.$helpers({
          fooList(each) {
            count++;
            v.list = each.list;
            if (each.list) {
              if (each._major !== this.major)
                each.list.changeOptions({
                  query: v.TestModel.where({id1: each._major = this.major, id2: '2'}).sort('name')
                });
            } else each.autoList({
              query: v.TestModel.
                where({id1: each._major = this.major, id2: '2'})
                .sort('name'),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.dom('li', {count: 2});
          assert.dom('li:first-child', 'alice');
          assert.dom('li:nth-child(2)', 'bob');

          const barney = v.TestModel.create({id1: '1', id2: '2', name: 'barny'});
          assert.dom('li', {count: 3});
          assert.dom('li:nth-child(2)', 'barny', elm =>{
            assert.same(Dom.myCtx(elm).parentCtx, Dom.myCtx(elm.parentNode));
          });

          v.doc1.$update({name: 'aalan'});
          assert.dom('li', {count: 3});
          assert.dom('li:nth-child(1)', 'aalan');

          v.doc1.$update({id2: '3'});
          assert.dom('li', {count: 2});
          refute.dom('li', 'aalan');

          v.doc1.$update({id2: '2'});
          assert.dom('li', {count: 3});
          assert.dom('li', 'aalan');

          v.other.$update({id2: '2'});
          assert.dom('li', {count: 3});

          assert.dom('li', 'alice', elm => {
            Dom.ctx(elm).onDestroy(v.oldCtx = stub());
          });

          refute(v.list);
          Dom.ctx(elm).updateAllTags({major: '2'});
          assert.called(v.oldCtx);
          assert(v.list); v.list = null;

          assert.dom('li', {count: 1, text: 'Caprice'});
          var m12 = v.TestModel.create({id1: '1', id2: '2', name: 'm12'});

          refute.dom('li', 'm12');
          refute(v.list);
        });

        assert.same(count, 2);

      },
    },

    "test staticList"() {
      assert.dom(v.Each.$render({}), elm => {
        refute.dom('li');
        assert.calledOnce(v.fooList);
        const each = v.fooList.firstCall.args[0];
        each.staticList([{_id: 'a', name: 'zac'}, ['b', 'alice'], false, null]);

        assert.dom('li', {count: 2});

        assert.dom('li:first-child', 'zac', elm =>{
          assert.equals($.data(elm), {_id: 'a', name: 'zac'});

        });
        assert.dom('li:nth-child(2)', 'alice', elm => {
          assert.equals($.data(elm), {_id: 'b', name: 'alice'});
        });

        each.staticList([2,1], {map: i => [i, 'n'+i]});

        const x4Elm = each.append([4, 'x4']);

        assert.dom('li:first-child', 'n2');
        assert.dom('li:nth-last-child(2)', 'n1');
        assert.dom('li:last-child', 'x4', elm =>{
          assert.same(x4Elm, elm);

        });

        each.clear();

        assert.same(elm.children.length, 0);
      });
    },

    "test helper returns query"() {
      onEnd(_=>{Ctx._currentCtx = null});
      Ctx._currentCtx = new Ctx(v.Each);

      const container = Dom.h({div: ""});

      each(
        container.firstChild, {}, {
          forEach(body) {body({_id: 1, name: 'Alice'})},
          compare: util.compareByName
        }, {template: v.Each.Row});

      assert.dom(container, pn =>{
        assert.dom('li', 'Alice', li =>{
          assert.same($.data(li)._id, 1);
        });
      });
    },
  });
});
