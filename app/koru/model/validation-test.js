define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var val = require('./validation');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      TH.silenceLogger();
    },

    tearDown: function () {
      v = null;
    },

    'test msgFor': function () {
      var doc = {_errors: {foo: [['too_long', 34]]}};

      assert.same(val.Error.msgFor(doc, 'foo'), "34 characters is the maximum allowed");
    },


    "test validateName": function () {
      assert.equals(val.validateName(), ['is_required']);
      assert.equals(val.validateName(' ', 300), ['is_required']);
      assert.equals(val.validateName('1234', 3), ['cant_be_greater_than', 3]);
      assert.equals(val.validateName('   1234  ', 4), '1234');
    },

    "test allowIfSimple": function () {
      assert.accessDenied(function () {val.allowIfSimple([12, {}])});
      assert.accessDenied(function () {val.allowIfSimple({})});
      refute.accessDenied(function () {val.allowIfSimple('sdfs')});
      refute.accessDenied(function () {val.allowIfSimple(123)});
      refute.accessDenied(function () {val.allowIfSimple([], ['abc', 1234])});
    },

    "test allowAccessIf": function () {
      assert.accessDenied(function () {val.allowAccessIf(false);});
      refute.accessDenied(function () {val.allowAccessIf(true);});
    },

    "test ensureString": function () {
      refute.accessDenied(function () {
        val.ensureString("a", "b");
      });

      assert.accessDenied(function () {
        val.ensureString("a", 2, "b");
      });
    },

    "test invalidRequest": function () {
      assert.invalidRequest(function () {val.allowIfValid(false);});
      refute.invalidRequest(function () {val.allowIfValid(true);});
    },

    'test validators': function () {
      var fooStub = {};

      val.register('fooVal', fooStub);

      assert.same(val.validators('fooVal'),fooStub);

      val.deregister('fooVal');

      refute(val.validators('fooVal'));
    },

    'with permitParams': {
      "test permitDoc": function () {
        var stub = test.stub(val, 'permitParams');
        var doc = {$isNewRecord: function () {return 'isNewRecordCalled'}, changes: 'changesArg'};
        val.permitDoc(doc, 'params', 'filter');

        assert.calledWithExactly(stub, doc.changes, 'params', 'isNewRecordCalled', 'filter');
      },

      'with nested arrays': {
        setUp: function () {
          test.ps = val.permitSpec('baz', [{things: ['heading', [{items: ['name']}]]}]);
        },

        "test change to null": function () {
          assertPermitted({name: null, }, val.permitSpec('name'));
        },

        'test okay full change': function () {
          assertPermitted({'things': [{items: [{name: 'foo'},{name: 'bar'}]}]}, test.ps);
        },

        'test okay diff changes': function () {
          assert.equals(test.ps, {baz: true, things: [{heading: true, items: [{name: true}]}]});

          assertPermitted({'things.0.heading': 'head', 'things.0.items.0.name': 'foo'}, test.ps);
        },

        'test okay substructure': function () {
          assertPermitted({'things.1': {items: [{name: 'foo'},{name: 'bar'}]}}, test.ps);
        },

        'test bad full change': function () {
          refutePermitted({'things': [{items: [{name: 'foo'},{names: 'bar'}]}]}, test.ps);
        },

        'test bad diff changes': function () {
          refutePermitted({'things.0.heading': 'head', 'things.0.items.0.named': 'foo'}, test.ps);

          refutePermitted({'things.0.heading': 'head', 'things.0.items.0a.name': 'foo'}, test.ps);
        },

        'test bad substructure': function () {
          refutePermitted({'things.1': {items: [{name: 'foo'},{names: 'bar'}]}}, test.ps);
        },
      },

      'test none allowed': function () {
        refutePermitted({abc: '123'},val.permitSpec());
      },

      'test only string of number': function () {
        refutePermitted({name: {nau: 'ghty'}, size: {width: 123, height: 456, deep: {val: 'a'}}},
                        val.permitSpec('name', {size: [{deep: ['val']}, 'width', 'height']}));
      },

      'test okay string': function () {
        assertPermitted({name: 'text', size: {width: 123, height: 456, deep: {val: 'a'}}},
                        val.permitSpec('name', {size: [{deep: ['val']}, 'width', 'height']}));
      },

      'test okay number': function () {
        assertPermitted({name: 1234, size: {width: 123, height: 456, deep: {val: 'a'}}},
                        val.permitSpec('name', {size: [{deep: ['val']}, 'width', 'height']}));
      },

      'test nearly okay': function () {
        refutePermitted({name: 'nm', size: {width: 123, height: 456, deep: {val: 'a', bad: 1}}},
                        val.permitSpec('name', {size: [{deep: ['val']}, 'width', 'height']}));
      },

      'test wrong type': function () {
        refutePermitted({name: 'nm', size: {width: 123, height: 456, deep: 'wt'}},
                        val.permitSpec('name', {size: [{deep: ['val']}, 'width', 'height']}));
      },
    },
  });

  function assertPermitted(params, spec) {
    refute.accessDenied(function () {
      val.permitParams(params, spec);
    });
  }

  function refutePermitted(params, spec) {
    assert.accessDenied(function () {
      val.permitParams(params, spec);
    });
  }
});
