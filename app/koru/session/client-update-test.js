isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../model/test-helper');
  var session = require('./client-main');
  var Model = require('../model/main');
  var sut = require('./client-update');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
    },

    tearDown: function () {
      v = null;
      Model._destroyModel('Foo', 'drop');
    },

    "test added": function () {
      session._onMessage({}, 'AFoo|f123'+JSON.stringify(v.attrs = {name: 'bob', age: 5}));

      var foo = v.Foo.findById('f123');

      assert(foo);
      v.attrs._id = 'f123';
      assert.equals(foo.attributes, v.attrs);
    },

    "test changed": function () {
      var foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});

      session._onMessage({}, 'CFoo|f222'+JSON.stringify(v.attrs = {age: 7}));

      assert.equals(foo.attributes, {_id: 'f222', name: 'bob', age: 7});
    },

    "test remove": function () {
      var foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});

      session._onMessage({}, 'RFoo|f222');

      assert.isNull(v.Foo.findById('f222'));
    },
  });
});
