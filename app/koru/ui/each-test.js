isClient && define(function (require, exports, module) {
  const Dom     = require('../dom');
  const eachTpl = require('../html!./each-test');
  const Model   = require('../model/main');
  const TH      = require('../model/test-helper');
  const util    = require('../util');

  const each    = require('./each');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.Each = Dom.newTemplate(util.deepCopy(eachTpl));

      v.Each.$helpers({
        fooList: v.fooList = this.stub(),
      });
    },

    tearDown() {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      v = null;
    },

    "test default template"() {
      v.Each.nodes[0].children[1].pop();

      Dom.newTemplate({
        name: "Test.Each.Each_fooList",
        nodes: [{
          name:"li",
          attrs:[["=","id",["", "id"]]],
          children: [["","name"]],
        }],
      });

      assert.dom(v.Each.$render({}), elm => {
        v.fooList.yield({id: "id1", name: 'r1'});
        assert.dom('li#id1', 'r1');
      });
    },

    "test calling global helper"() {
      delete v.Each._helpers.fooList;
      Dom.registerHelpers({
        fooList: this.stub(),
      });

      this.onEnd(() => delete Dom._helpers.fooList);

      v.Each.$render({});

      assert.calledWith(Dom._helpers.fooList, TH.match.func);
    },

    "callback.render": {
      setUp() {
        v.TestModel = Model.define('TestModel').defineFields({
          id1: 'text',
          id2: 'text',
          name: 'text',
          score: 'number',
        });
        v.index = v.TestModel.addUniqueIndex('id1', 'id2', 'name');

        v.doc1 = v.TestModel.create({id1: '1', id2: '2', name: 'bob'});
        v.doc2 = v.TestModel.create({id1: '1', id2: '2', name: 'alice'});
        v.other = v.TestModel.create({id1: '2', id2: '3', name: 'Caprice'});
      },

      tearDown() {
        Model._destroyModel('TestModel', 'drop');
      },

      "test sort by field name"() {
         v.Each.$helpers({
          fooList(callback) {
            return callback.render({
              model: v.TestModel,
              index: v.index,
              params: {id1: Dom.current.data().major, id2: '2'},
              sort: 'name',
              changed: v.changedStub = TH.test.stub(),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.dom('li', {count: 2});
          assert.dom('li:first-child', 'alice');
          assert.dom('li:nth-child(2)', 'bob');
        });
      },

      "test params and index"() {
        v.Each.$helpers({
          fooList(callback) {
            if (! v.spy) v.spy = TH.test.spy(callback, 'setDefaultDestroy');
            return callback.render({
              model: v.TestModel,
              index: v.index,
              params: {id1: Dom.current.data().major, id2: '2'},
              sort: util.compareByName,
              changed: v.changedStub = TH.test.stub(),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.called(v.spy);
          assert.dom('li', {count: 2});
          assert.dom('li:first-child', 'alice');
          assert.dom('li:nth-child(2)', 'bob');
          refute.called(v.changedStub);

          var barney = v.TestModel.create({id1: '1', id2: '2', name: 'barny'});
          assert.dom('li', {count: 3});
          assert.dom('li:nth-child(2)', 'barny');
          assert.calledOnce(v.changedStub);
          assert.calledWithExactly(v.changedStub, TH.matchModel(barney), null);
          v.changedStub.reset();

          v.doc1.$update({name: 'aalan'});
          assert.dom('li', {count: 3});
          assert.dom('li:nth-child(1)', 'aalan');
          assert.calledWith(v.changedStub, TH.matchModel(v.doc1), {name: "bob"});

          v.doc1.$update({id2: '3'});
          assert.dom('li', {count: 2});
          refute.dom('li', 'aalan');

          v.doc1.$update({id2: '2'});
          assert.dom('li', {count: 3});
          assert.dom('li', 'aalan');

          v.other.$update({id2: '2'});
          assert.dom('li', {count: 3});

          assert.dom('li', 'alice', elm => {
            Dom.getCtx(elm).onDestroy(v.oldCtx = this.stub());
          });


          Dom.getCtx(elm).updateAllTags({major: '2'});

          assert.calledTwice(v.spy);

          assert.called(v.oldCtx);

          assert.dom('li', {count: 1, text: 'Caprice'});
          var m12 = v.TestModel.create({id1: '1', id2: '2', name: 'm12'});

          refute.dom('li', 'm12');

        });
      },

      "test intercept"() {
        v.Each.$helpers({
          fooList(callback) {
            return callback.render({
              model: v.TestModel,
              params: {id1: Dom.current.data().major, id2: '2'},
              intercept(doc, old) {
                if (old && old.name === 'bob')
                  return v.bob = true;
                return /ice/.test(doc.name);
              },
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.dom('li', {count: 1});
          assert.dom('li', 'bob');
          v.doc1.$remove();
          assert.dom('li', 'bob');
          assert.isTrue(v.bob);
          v.TestModel.create({id1: '1', id2: '2', name: 'Rick'});
          assert.dom('li', 'Rick');
        });
      },

      "test filter and model"() {
         v.Each.$helpers({
          fooList(callback) {
            return callback.render({
              model: v.TestModel,
              params: {id1: Dom.current.data().major, id2: '2'},
              filter(doc) {
                return doc.name.match(/ice/);
              },
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), elm => {
          assert.dom('li', {count: 1});
          assert.dom('li', 'alice');

          v.TestModel.create({id1: '1', id2: '2', name: 'Rick'});
          assert.dom('li', {count: 1});
          assert.dom('li', 'alice');


          v.TestModel.create({id1: '1', id2: '2', name: 'Patrice'});
          assert.dom('li', {count: 2});
          assert.dom('li:last-child', 'Patrice');

          v.doc1.$update({name: 'Maurice'});
          assert.dom('li', {count: 3});
          assert.dom('li:last-child', 'Maurice');

          v.doc1.$update({id2: '3'});
          assert.dom('li', {count: 2});
          refute.dom('li', 'Maurice');

          v.doc1.$update({id2: '2'});
          assert.dom('li', {count: 3});
          assert.dom('li', 'Maurice');

          v.other.$update({id2: '2'});
          assert.dom('li', {count: 3});
        });
      },
    },

    "test sets parentCtx"() {
      assert.dom(v.Each.$render({}), elm => {
        var eachCtx = Dom.getCtx(elm);
        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', elm => {
          assert.same(Dom.getCtx(elm).parentCtx, eachCtx);
        });
      });
    },

    "test simple adding and deleting"() {
      assert.dom(v.Each.$render({}), elm => {
        refute.dom('li');
        assert.calledOnceWith(v.fooList, TH.match.func, {template: "Row"},
                              TH.match(elm => elm._each));

        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', 'r1');

        v.fooList.yield({_id: 2, name: 'r2'});
        assert.dom('li+li', 'r2');

        Dom.getCtx(elm).updateAllTags();
        assert.dom('li+li', 'r2');

        v.fooList.yield({id: 2, name: 'r3'});
        assert.dom('li', {count: 2});
        assert.dom('li+li', 'r3');

        assert.dom('li', 'r1', elm => {
          Dom.getCtx(elm).onDestroy(v.destroy = this.stub());
        });

        v.fooList.yield(null, {id: 1});
        refute.dom('li', 'r1');
        assert.dom('li', {count: 1});
        assert.called(v.destroy);

        // ensure removed from lookup list
        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', 'r1');
      });
    },

    "test no data id"() {
      v.Each.$helpers({
        fooList(callback) {
          callback({name: 'r1'});
          callback({name: 'r2'});
          callback.clear(); // does not work
        }
      });
      assert.dom(v.Each.$render({}), elm => {
        assert.dom('li', 'r1');
        assert.dom('li+li', 'r2');
      });
    },

    "test clear rows"() {
      assert.dom(v.Each.$render({}), elm => {
        const callback = v.fooList.args(0, 0);
        v.fooList.yield({id: 1, name: 'r1'});
        v.fooList.yield({id: 2, name: 'r2'});
        v.fooList.yield({id: 3, name: 'r3'});

        assert.dom('li', {count: 3});

        callback.clear(row => row.textContent === 'r2');

        assert.dom('li', {count: 2});
        refute.dom('li', 'r2');

        callback.clear();

        refute.dom('li');
        assert.equals(callback.rows, {});


        v.fooList.yield({id: 2, name: 'r2'});

        assert.dom('li', 'r2');

        callback.clear();

        refute.dom('li');
        assert.equals(callback.rows, {});
      });
    },

    "test update of helper"() {
      assert.dom(v.Each.$render({}), elm => {
        refute.dom('li');
        assert.calledOnceWith(v.fooList, TH.match.func);
        assert.same(v.fooList.args(0, 0).count, 1);

        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', 'r1');

        Dom.getCtx(elm).updateAllTags();
        assert.calledTwice(v.fooList);
        assert.same(v.fooList.args(0, 0), v.fooList.args(1, 0));
        assert.same(v.fooList.args(0, 0).count, 2);

        assert.dom('li', {count: 1});
      });
    },

    "test doc and old null"() {
      assert.dom(v.Each.$render({}), elm => {
        const callback = v.fooList.args(0, 0);

        refute.exception(() => {
          callback(null, null);
        });
      });
    },

    "test works with removeInserts"() {
      assert.dom(v.Each.$render({}), elm => {
        const callback = v.fooList.args(0, 0);

        callback({id: 1, name: 'r1'});
        callback({id: 2, name: 'r2'});

        assert.dom('li', {text: 'r1', parent() {
          const start = this.firstChild.nextSibling;
          Dom.removeInserts(start);
          assert.same(start.nextSibling, start._koruEnd);
          assert.same(callback.startEach, start);
          assert.same(start._koruEnd.nodeType, document.COMMENT_NODE);
        }});
        refute.dom('li');
      });
    },

    "test ordered"() {
      assert.dom(v.Each.$render({}), elm => {
        var callback = v.fooList.args(0, 0);

        function sort(a, b) {
          return a.order - b.order;
        }

        const r1 = callback({id: 1, name: 'r1', order: 3}, null, sort);
        assert.dom('li', 'r1', elm => {
          assert.same(elm, r1);
        });

        callback({_id: 2, name: 'r2', order: 1}, null, sort);
        assert.dom('li+li', 'r1');


        callback({id: 2, name: 'r2', order: 4}, null, sort);
        assert.dom('li+li', 'r2');
        assert.dom('li', {count: 2});

        callback({id: 2, name: 'r2', order: -1}, null, sort);
        assert.dom('li+li', 'r1');
        assert.dom('li', {count: 2});

        // ensure only reinserts if order changes
        callback({id: 1, name: 'r4', order: 1}, {id: 1, name: 'r1', order: 1}, sort);
        assert.dom('li+li', 'r4');
        const r4 = callback({id: 1, name: 'r4', order: -2}, {id: 1, name: 'r4', order: 1}, sort);
        assert.same(r4.textContent, 'r4');
        assert.dom('li+li', 'r2');
      });
    },

    "test before"() {
      assert.dom(v.Each.$render({}), elm => {
        var callback = v.fooList.args(0, 0);

        callback({id: 1, name: 'r1'});
        callback({id: 2, name: 'r2'});
        callback({id: 3, name: 'r3'}, null, elm.querySelector('li:nth-child(2)'));

        assert.dom('li:nth-child(1)', 'r1');
        assert.dom('li:nth-child(2)', 'r3');
        assert.dom('li:nth-child(3)', 'r2');
      });
    },

    "test initial insert with sort"() {
      v.Each.$helpers({
        fooList(callback) {
          // -1 will force search list to look until start comment reached
          callback({id: 'x', value: 'init'}, null, a => -1);
        },
      });

      assert.dom(v.Each.$render({major: '1'}), elm => {
        assert.dom('li', elm => {
          assert.same(elm.previousSibling.nodeValue, 'start');
          assert.same(elm.nextSibling.nodeValue, 'end');
          assert.same(elm.previousSibling._koruEnd, elm.nextSibling);
        });
      });
    },
  });
});
