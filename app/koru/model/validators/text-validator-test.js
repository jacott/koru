define(function (require, exports, module) {
  var test, doc;
  var geddon = require('../../test');
  var sut = require('../validation');

  sut.register(module, {required: require('./text-validator')});

  geddon.testCase(module, {
    "normalize": {
      "test downcase"() {
        var doc = {name: 'mixedCase'};

        sut.validators('normalize')(doc,'name', 'downcase');

        refute(doc._errors);

        assert.same(doc.name, 'mixedcase');

        sut.validators('normalize')(doc,'noName', 'downcase');

        refute(doc._errors);

        assert.equals(doc, {name: 'mixedcase'});
      },

      "test upcase"() {
        var doc = {name: 'mixedCase'};

        sut.validators('normalize')(doc,'name', 'upcase');

        refute(doc._errors);

        assert.same(doc.name, 'MIXEDCASE');

        sut.validators('normalize')(doc,'noName', 'upcase');

        refute(doc._errors);

        assert.equals(doc, {name: 'MIXEDCASE'});
      },
    },

    'boolean': {
      "test trueOnly"() {
        var doc = {isSet: false};

        sut.validators('boolean')(doc,'isSet', 'trueOnly');
        refute(doc._errors);

        assert.same(doc.isSet, undefined);

        doc = {isSet: true};

        sut.validators('boolean')(doc,'isSet', 'trueOnly');
        refute(doc._errors);

        assert.same(doc.isSet, true);
      },

      "test set true"() {
        ['trUe  ', 'T', ' 1', 'on'].forEach(function (val) {
          var doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          refute(doc._errors);

          assert.same(doc.isSet, true, 'for val "'+val+'"');
        });
      },

      "test set false"() {
        [' FALSE  ', 'f', ' 0', 'off'].forEach(function (val) {
          var doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          refute(doc._errors);

          assert.same(doc.isSet, false, 'for val "'+val+'"');
        });
      },

      "test if null"() {
        var doc = {};

        sut.validators('boolean')(doc,'isSet');
        refute(doc._errors);
      },

      "test set invalid"() {
        var doc;

        [' FALS  ', 'tru', '  '].forEach(function (val) {
          doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          assert(doc._errors);
          assert.equals(doc._errors['isSet'],[['not_a_boolean']]);

          assert.same(doc.isSet, val);
        });

      },
    },

    "date": {
      "test valid"() {
        var doc = {startDate: new Date()};

        sut.validators('date')(doc, 'startDate');
        refute(doc._errors);

        var doc = {startDate: '2015-12-31'};

        sut.validators('date')(doc, 'startDate');
        refute(doc._errors);

        assert.equals(doc.startDate, new Date(Date.parse('2015-12-31')));
      },

      'test invalid'() {
        var doc = {startDate: 'abc'};

        sut.validators('date')(doc, 'startDate');
        assert(doc._errors);
        assert.equals(doc._errors['startDate'],[['not_a_date']]);
      },
    },

    'number': {
      "test min value"() {
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {$gte: 123});
        refute(doc._errors);

        sut.validators('number')(doc,'order', {$gt: 122});
        refute(doc._errors);

        sut.validators('number')(doc,'order', {$gte: 124});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['cant_be_less_than', 124]]);

        doc = {order: 123};

        sut.validators('number')(doc,'order', {$gt: 123});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['must_be_greater_than', 123]]);
      },

      "test negative"() {
        var doc = {order: -4};
        sut.validators('number')(doc,'order', {integer: true, $gte: 0, $lt: 999});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['cant_be_less_than', 0]]);
      },

      "test max value"() {
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {$lte: 123});
        refute(doc._errors);

        sut.validators('number')(doc,'order', {$lt: 124});
        refute(doc._errors);

        sut.validators('number')(doc,'order', {$lte: 122});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['cant_be_greater_than', 122]]);

        doc = {order: 123};

        sut.validators('number')(doc,'order', {$lt: 123});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['must_be_less_than', 123]]);
      },

      "test integer"() {
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {integer: true});
        refute(doc._errors);

        doc.order = 123.45;

        sut.validators('number')(doc,'order', {integer: true});
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['not_an_integer']]);
      },

      'test valid'() {
        var doc = {order: 123};

        sut.validators('number')(doc,'order');
        refute(doc._errors);

        doc.order = 0;
        sut.validators('number')(doc,'order');
        refute(doc._errors);
      },

      'test string as number'() {
         var doc = {order: '0xabc'};

        sut.validators('number')(doc,'order');
        refute(doc._errors);

        assert.same(doc.order,0xabc);
      },

      "test empty"() {
         var doc = {order: ''};

        sut.validators('number')(doc,'order');
        refute(doc._errors);

        assert.same(doc.order, null);
      },

      'test invalid'() {
        var doc = {order: 'abc'};

        sut.validators('number')(doc,'order');
        assert(doc._errors);
        assert.equals(doc._errors['order'],[['not_a_number']]);
      },
    },

    'trim': {
      'test invalid'() {
        var doc = {name: 123};

        sut.validators('trim')(doc,'name');
        assert(doc._errors);
        assert.equals(doc._errors['name'],[['not_a_string']]);
      },

      "test toNull"() {

        var doc = {name: '  '};

        sut.validators('trim')(doc,'name', 'toNull');

        refute(doc._errors);
        assert.same(doc.name, null);

      },

      "test toUndefined"() {

        var doc = {name: '  '};

        sut.validators('trim')(doc,'name', 'toUndefined');

        refute(doc._errors);
        assert.same(doc.name, undefined);

      },

      'test trims'() {
        var doc = {name: '  in  the middle  '};

        sut.validators('trim')(doc,'name');
        refute(doc._errors);
        assert.same(doc.name, 'in  the middle');
      },
    },

    'color': {
      'test valid alpha'() {
        var colors = ['#000000', '#12ab3487', '#123456', '#ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          sut.validators('color')(doc,'color', 'alpha');
          refute.msg('should be valid: '+item)(doc._errors);
        }
      },

      'test valid non-alpha'() {
        var colors = ['#000000', '#12ab34', '#123456', '#ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          sut.validators('color')(doc,'color');
          refute.msg('should be valid: '+item)(doc._errors);
        }
      },

      'test invalid alpha'() {
        var colors = ['#ac', '#0000', '123456', '#0000001', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc._errors = {};
          sut.validators('color')(doc,'color');

          assert.equals(doc._errors['color'],[['is_invalid']]);
        }
      },

      'test invalid nonalpha'() {
        var colors = ['#ac', '#0000', '#11223344', '123456', '#0000001', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc._errors = {};
          sut.validators('color')(doc,'color');

          assert.equals(doc._errors['color'],[['is_invalid']]);
        }
      },
    },
  });
});
