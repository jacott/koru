isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../model/test-helper');
  var eachTpl = require('../html!./each-test');
  var Dom = require('../dom');
  var Model = require('../model/main');
  var each = require('./each');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.Each = Dom.newTemplate(util.deepCopy(eachTpl));

      v.Each.$helpers({
        fooList: v.fooList = test.stub(),
      });
    },

    tearDown: function () {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      v = null;
    },

    "test default template": function () {
      v.Each.nodes[0].children[1].pop();

      Dom.newTemplate({
        name: "Test.Each.Each_fooList",
        nodes: [{
          name:"li",
          attrs:[["=","id",["", "id"]]],
          children: [["","name"]],
        }],
      });

      assert.dom(v.Each.$render({}), function () {
        v.fooList.yield({id: "id1", name: 'r1'});
        assert.dom('li#id1', 'r1');
      });
    },

    "callback.render": {
      setUp: function () {
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

      tearDown: function () {
        Model._destroyModel('TestModel', 'drop');
      },

      "test sort by field name": function () {
         v.Each.$helpers({
          fooList: function (callback) {
            return callback.render({
              model: v.TestModel,
              index: v.index,
              params: {id1: Dom.current.data().major, id2: '2'},
              sort: 'name',
              changed: v.changedStub = test.stub(),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), function () {
          assert.dom('li', {count: 2});
          assert.dom('li:first-child', 'alice');
          assert.dom('li:nth-child(2)', 'bob');
        });
      },

      "test params and index": function () {
        v.Each.$helpers({
          fooList: function (callback) {
            if (! v.spy) v.spy = test.spy(callback, 'setDefaultDestroy');
            return callback.render({
              model: v.TestModel,
              index: v.index,
              params: {id1: Dom.current.data().major, id2: '2'},
              sort: util.compareByName,
              changed: v.changedStub = test.stub(),
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), function () {
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

          assert.dom('li', 'alice', function () {
            Dom.getCtx(this).onDestroy(v.oldCtx = test.stub());
          });


          Dom.getCtx(this).updateAllTags({major: '2'});

          assert.calledTwice(v.spy);

          assert.called(v.oldCtx);

          assert.dom('li', {count: 1, text: 'Caprice'});
          var m12 = v.TestModel.create({id1: '1', id2: '2', name: 'm12'});

          refute.dom('li', 'm12');

        });
      },

      "test intercept": function () {
        v.Each.$helpers({
          fooList: function (callback) {
            return callback.render({
              model: v.TestModel,
              params: {id1: Dom.current.data().major, id2: '2'},
              intercept: function (doc, old) {
                if (old && old.name === 'bob')
                  return v.bob = true;
                return /ice/.test(doc.name);
              },
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), function () {
          assert.dom('li', {count: 1});
          assert.dom('li', 'bob');
          v.doc1.$remove();
          assert.dom('li', 'bob');
          assert.isTrue(v.bob);
          v.TestModel.create({id1: '1', id2: '2', name: 'Rick'});
          assert.dom('li', 'Rick');
        });
      },

      "test filter and model": function () {
         v.Each.$helpers({
          fooList: function (callback) {
            return callback.render({
              model: v.TestModel,
              params: {id1: Dom.current.data().major, id2: '2'},
              filter: function (doc) {
                return doc.name.match(/ice/);
              },
            });
          }
        });

        assert.dom(v.Each.$render({major: '1'}), function () {
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

    "test sets parentCtx": function () {
      assert.dom(v.Each.$render({}), function () {
        var eachCtx = Dom.getCtx(this);
        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', function () {
          assert.same(Dom.getCtx(this).parentCtx, eachCtx);
        });
      });
    },

    "test simple adding and deleting": function () {
      assert.dom(v.Each.$render({}), function () {
        refute.dom('li');
        assert.calledOnceWith(v.fooList, TH.match.func, {template: "Row"},
                              TH.match(function (elm) {
          return elm._each;
        }));

        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', 'r1');

        v.fooList.yield({_id: 2, name: 'r2'});
        assert.dom('li+li', 'r2');

        Dom.getCtx(this).updateAllTags();
        assert.dom('li+li', 'r2');

        v.fooList.yield({id: 2, name: 'r3'});
        assert.dom('li', {count: 2});
        assert.dom('li+li', 'r3');

        assert.dom('li', 'r1', function () {
          Dom.getCtx(this).onDestroy(v.destroy = test.stub());
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

    "test clear intially": function () {
      v.Each.$helpers({
        fooList: function (callback) {
          callback.clear();
        }
      });
      assert.dom(v.Each.$render({}), function () {
        refute.dom('li', {count: 0});
      });
    },

    "test clear rows": function () {
      assert.dom(v.Each.$render({}), function () {
        var callback = v.fooList.args[0][0];
        v.fooList.yield({id: 1, name: 'r1'});
        v.fooList.yield({id: 2, name: 'r2'});
        v.fooList.yield({id: 3, name: 'r3'});

        assert.dom('li', {count: 3});

        callback.clear(function (row) {
          return row.textContent === 'r2';
        });

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

    "test update of helper": function () {
      assert.dom(v.Each.$render({}), function () {
        refute.dom('li');
        assert.calledOnceWith(v.fooList, TH.match.func);
        assert.same(v.fooList.args[0][0].count, 1);

        v.fooList.yield({id: 1, name: 'r1'});
        assert.dom('li', 'r1');

        Dom.getCtx(this).updateAllTags();
        assert.calledTwice(v.fooList);
        assert.same(v.fooList.args[0][0], v.fooList.args[1][0]);
        assert.same(v.fooList.args[0][0].count, 2);

        assert.dom('li', {count: 1});
      });
    },

    "test doc and old null": function () {
      assert.dom(v.Each.$render({}), function () {
        var callback = v.fooList.args[0][0];

        refute.exception(function () {
          callback(null, null);
        });
      });
    },

    "test works with removeInserts": function () {
      assert.dom(v.Each.$render({}), function () {
        var callback = v.fooList.args[0][0];

        callback({id: 1, name: 'r1'});
        callback({id: 2, name: 'r2'});

        assert.dom('li', {text: 'r1', parent: function () {
          var start = this.firstChild.nextSibling;
          Dom.removeInserts(start);
          assert.same(start.nextSibling, start._koruEnd);
          assert.same(callback.startEach, start);
          assert.same(start._koruEnd.nodeType, document.COMMENT_NODE);
        }});
        refute.dom('li');
      });
    },

    "test ordered": function () {
      assert.dom(v.Each.$render({}), function () {
        var callback = v.fooList.args[0][0];

        function sort(a, b) {
          return a.order - b.order;
        }

        callback({id: 1, name: 'r1', order: 3}, null, sort);
        assert.dom('li', 'r1');

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
        callback({id: 1, name: 'r4', order: -2}, {id: 1, name: 'r4', order: 1}, sort);
        assert.dom('li+li', 'r2');
      });
    },

    "test initial insert with sort": function () {
      v.Each.$helpers({
        fooList: function (callback) {
          // -1 will force search list to look until start comment reached
          callback({id: 'x', value: 'init'}, null, function (a, b) {return -1});
        },
      });

      assert.dom(v.Each.$render({major: '1'}), function () {
        assert.dom('li', function () {
          assert.same(this.previousSibling.nodeValue, 'start');
          assert.same(this.nextSibling.nodeValue, 'end');
          assert.same(this.previousSibling._koruEnd, this.nextSibling);
        });
      });
    },
  });
});
