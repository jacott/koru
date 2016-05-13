define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var util = require('koru/util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'string', age: 'number', toys: 'object'});
      v.doc = v.TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
      v.obs = [];
      v.TestModel.registerObserveField('age');
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      for(var i = 0; i < v.obs.length; ++i) {
        var row = v.obs[i];
        row.stop();
      }
      v = null;
    },

    "test multi dbs": function () {
      v.TestModel.registerObserveField('toys');
      var origId = v.dbId = util.dbId;
      test.intercept(util, 'dbId');
      Object.defineProperty(util, 'dbId', {configurable: true, get: function () {return v.dbId}});
      var oc = test.spy(v.TestModel, 'onChange');

      v.obs.push(v.TestModel.observeToys(['robot'], v.origOb = test.stub()));
      v.dbId = 'alt';
      assert.same(util.dbId, 'alt');

      assert.calledWith(oc, TH.match(func => v.oFunc = func));
      oc.reset();
      v.obs.push(v.altHandle = v.TestModel.observeToys(['robot'], v.altOb = test.stub()));
      assert.calledWith(oc, TH.match(func => v.altFunc = func));
      v.oFunc(v.doc, {name: 'old'});
      assert.calledWith(v.origOb, v.doc);
      refute.called(v.altOb);

      v.origOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      assert.calledWith(v.altOb, v.doc);
      refute.called(v.origOb);

      v.altHandle.stop();

      v.altOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      refute.called(v.altOb);


      oc.reset();
      v.obs.push(v.TestModel.observeToys(['robot'], test.stub()));
      v.obs.push(v.TestModel.observeToys(['buzz'], test.stub()));
      assert.calledOnce(oc);
    },

    "observe array field": {
      setUp: function () {
        v.TestModel.registerObserveField('toys');

        v.obs.push(v.toys = v.TestModel.observeToys(['buzz', 'woody'], v.callback = test.stub()));
      },

      "test adding observed field": function () {
        var doc = v.TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'slinky']});

        assert.calledOnceWith(v.callback, TH.matchModel(doc), null);
      },

      "test adding two observed fields": function () {
        var doc = v.TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'buzz']});

        assert.calledOnceWith(v.callback, TH.matchModel(doc), null);
      },

      "test updating observered field": function () {
        v.doc.toys = v.attrs = ['woody', 'slinky'];
        v.doc.$$save();

        assert.calledWith(v.callback, TH.matchModel(v.doc.$reload()), {toys: ['robot']});
      },

      "test add/remove to observered field": function () {
        v.doc.$onThis.addItem('toys', 'woody');

        assert.calledWith(v.callback, TH.matchModel(v.doc.$reload()), {'toys.$-1': 'woody'});

        v.doc.$onThis.removeItem('toys', 'woody');

        assert.calledWith(v.callback, TH.matchModel(v.doc.$reload()), {'toys.$+1': 'woody'});
      },

      "test updating other field": function () {
        v.doc.toys = v.attrs = ['woody', 'buzz'];
        v.doc.$$save();
        v.callback.reset();

        v.doc.$reload().age = 8;
        v.doc.$$save();

        assert.calledWith(v.callback, TH.matchModel(v.doc.$reload()), {age: 5});
      },
    },

    "manipulation": {
      setUp: function () {
        v.doc2 =  v.TestModel.create({name: 'Bob', age: 35});
        v.doc3 = v.TestModel.create({name: 'Helen', age: 25});

        v.obs.push(v.ids = v.TestModel.observeAge([5, 35], v.callback = test.stub()));
      },

      "test replaceValues": function () {
        v.ids.replaceValues([5, 25]);

        v.TestModel.create({name: 'Henry', age: 35});
        refute.called(v.callback);

        v.doc3.name = "changed";
        v.doc3.$$save();
        assert.calledWith(v.callback, TH.matchModel(v.doc3.$reload()), {name: 'Helen'});
        v.callback.reset();

        v.ids.stop();

        v.doc3.name = "Helen";
        v.doc3.$$save();
        refute.called(v.callback);
      },

      "test addValue": function () {
        v.ids.addValue(25);

        var doc = v.TestModel.create({_id: '123', name: 'Mamma', age: 25});

        assert.calledWith(v.callback, TH.matchModel(doc));
      },

      "test removeValue": function () {
        v.ids.removeValue(5);

        v.doc2.age = 5;
        v.doc2.$$save();

        assert.calledWith(v.callback, TH.matchModel(v.doc2.$reload()));

        v.callback.reset();

        v.doc2.name = 'new name';
        v.doc2.$$save();

        refute.called(v.callback);
      },
    },
  });
});
