define((require, exports, module)=>{
  const TH = require('koru/test-helper');

  const {error$} = require('koru/symbols');

  const sut = require('../validation');

  sut.register(module, {required: require('./text-validator')});

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    group("normalize", ()=>{
      test("downcase", ()=>{
        var doc = {name: 'mixedCase'};

        sut.validators('normalize')(doc,'name', 'downcase');

        refute(doc[error$]);

        assert.same(doc.name, 'mixedcase');

        sut.validators('normalize')(doc,'noName', 'downcase');

        refute(doc[error$]);

        assert.equals(doc, {name: 'mixedcase'});
      });

      test("upcase", ()=>{
        var doc = {name: 'mixedCase'};

        sut.validators('normalize')(doc,'name', 'upcase');

        refute(doc[error$]);

        assert.same(doc.name, 'MIXEDCASE');

        sut.validators('normalize')(doc,'noName', 'upcase');

        refute(doc[error$]);

        assert.equals(doc, {name: 'MIXEDCASE'});
      });
    });

    group("boolean", ()=>{
      test("trueOnly", ()=>{
        var doc = {isSet: false};

        sut.validators('boolean')(doc,'isSet', 'trueOnly');
        refute(doc[error$]);

        assert.same(doc.isSet, undefined);

        doc = {isSet: true};

        sut.validators('boolean')(doc,'isSet', 'trueOnly');
        refute(doc[error$]);

        assert.same(doc.isSet, true);
      });

      test("set true", ()=>{
        ['trUe  ', 'T', ' 1', 'on'].forEach(function (val) {
          var doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          refute(doc[error$]);

          assert.same(doc.isSet, true, 'for val "'+val+'"');
        });
      });

      test("set false", ()=>{
        [' FALSE  ', 'f', ' 0', 'off'].forEach(function (val) {
          var doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          refute(doc[error$]);

          assert.same(doc.isSet, false, 'for val "'+val+'"');
        });
      });

      test("if null", ()=>{
        var doc = {};

        sut.validators('boolean')(doc,'isSet');
        refute(doc[error$]);
      });

      test("set invalid", ()=>{
        var doc;

        [' FALS  ', 'tru', '  '].forEach(function (val) {
          doc = {isSet: val};
          sut.validators('boolean')(doc,'isSet');
          assert(doc[error$]);
          assert.equals(doc[error$]['isSet'],[['not_a_boolean']]);

          assert.same(doc.isSet, val);
        });

      });
    });

    group("date", ()=>{
      test("valid", ()=>{
        let doc = {startDate: new Date()};

        sut.validators('date')(doc, 'startDate');
        refute(doc[error$]);

        doc = {startDate: '2015-12-31'};

        sut.validators('date')(doc, 'startDate');
        refute(doc[error$]);

        assert.equals(doc.startDate, new Date(2015, 11, 31));

        doc = {startDate: '2015-12-31T13:14Z'};

        sut.validators('date')(doc, 'startDate');
        refute(doc[error$]);

        assert.equals(doc.startDate, new Date('2015-12-31T13:14Z'));
      });

      test("invalid", ()=>{
        var doc = {startDate: 'abc'};

        sut.validators('date')(doc, 'startDate');
        assert(doc[error$]);
        assert.equals(doc[error$]['startDate'],[['not_a_date']]);
      });
    });

    group("number", ()=>{
      test("min value", ()=>{
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {$gte: 123});
        refute(doc[error$]);

        sut.validators('number')(doc,'order', {$gt: 122});
        refute(doc[error$]);

        sut.validators('number')(doc,'order', {$gte: 124});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_less_than', 124]]);

        doc = {order: 123};

        sut.validators('number')(doc,'order', {$gt: 123});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['must_be_greater_than', 123]]);
      });

      test("negative", ()=>{
        var doc = {order: -4};
        sut.validators('number')(doc,'order', {integer: true, $gte: 0, $lt: 999});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_less_than', 0]]);
      });

      test("max value", ()=>{
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {$lte: 123});
        refute(doc[error$]);

        sut.validators('number')(doc,'order', {$lt: 124});
        refute(doc[error$]);

        sut.validators('number')(doc,'order', {$lte: 122});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_greater_than', 122]]);

        doc = {order: 123};

        sut.validators('number')(doc,'order', {$lt: 123});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['must_be_less_than', 123]]);
      });

      test("integer", ()=>{
        var doc = {order: 123};

        sut.validators('number')(doc,'order', {integer: true});
        refute(doc[error$]);

        doc.order = 123.45;

        sut.validators('number')(doc,'order', {integer: true});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['not_an_integer']]);
      });

      test("valid", ()=>{
        var doc = {order: 123};

        sut.validators('number')(doc,'order');
        refute(doc[error$]);

        doc.order = 0;
        sut.validators('number')(doc,'order');
        refute(doc[error$]);
      });

      test("string as number", ()=>{
         var doc = {order: '0xabc'};

        sut.validators('number')(doc,'order');
        refute(doc[error$]);

        assert.same(doc.order,0xabc);
      });

      test("empty", ()=>{
         var doc = {order: ''};

        sut.validators('number')(doc,'order');
        refute(doc[error$]);

        assert.same(doc.order, null);
      });

      test("invalid", ()=>{
        var doc = {order: 'abc'};

        sut.validators('number')(doc,'order');
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['not_a_number']]);
      });
    });

    group("trim", ()=>{
      test("invalid", ()=>{
        var doc = {name: 123};

        sut.validators('trim')(doc,'name');
        assert(doc[error$]);
        assert.equals(doc[error$]['name'],[['not_a_string']]);
      });

      test("toNull", ()=>{

        var doc = {name: '  '};

        sut.validators('trim')(doc,'name', 'toNull');

        refute(doc[error$]);
        assert.same(doc.name, null);

      });

      test("toUndefined", ()=>{

        var doc = {name: '  '};

        sut.validators('trim')(doc,'name', 'toUndefined');

        refute(doc[error$]);
        assert.same(doc.name, undefined);

      });

      test("trims", ()=>{
        var doc = {name: '  in  the middle  '};

        sut.validators('trim')(doc,'name');
        refute(doc[error$]);
        assert.same(doc.name, 'in  the middle');
      });
    });

    group("color", ()=>{
      test("valid alpha", ()=>{
        var colors = ['#000000', '#12ab3487', '#123456', '#ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          sut.validators('color')(doc,'color', 'alpha');
          refute.msg('should be valid: '+item)(doc[error$]);
        }
      });

      test("valid non-alpha", ()=>{
        const colors = ['#00000005', '#12ab3480', '#123456', '#ffffff'],
              doc = {color: ''};

        for(let i=0,item;item=colors[i];++i) {
          doc.color = item;
          sut.validators('color')(doc,'color');
          refute.msg('should be valid: '+item)(doc[error$]);
          assert.same(doc.color, item.slice(0, 7));

        }
      });

      test("invalid alpha", ()=>{
        var colors = ['#ac', '#0000', '123456', '#0000001', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc[error$] = {};
          sut.validators('color')(doc,'color');

          assert.equals(doc[error$]['color'],[['is_invalid']]);
        }
      });

      test("invalid nonalpha", ()=>{
        var colors = ['#ac', '#0000', '#123456zz', '123456', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(var i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc[error$] = {};
          sut.validators('color')(doc,'color');

          assert.equals(doc[error$]['color'],[['is_invalid']]);
        }
      });
    });
  });
});
