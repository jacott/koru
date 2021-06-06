define((require, exports, module)=>{
  'use strict';
  /**
   * Text formatter with language translation
   */
  const ResourceString  = require('koru/resource-string');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, stubProperty} = TH;

  const format = require('./format');
  const origFormat = format;

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module();
    });

    group("compile", ()=>{
      /**
       * Compile a string of text for faster translating and formatting
       */
      before(()=>{api.method()});

      test("constant", ()=>{
        assert.equals(format.compile("no args"), ["no args"]);
      });

      test("simple", ()=>{
        assert.equals(format.compile("abc {1} de\nf {0}"), ['abc ','s1',' de\nf ','s0', '']);
      });

      test("edge", ()=>{
        assert.equals(format.compile("{3}edge args{4}"), ["", "s3", "edge args", "s4", '']);
      });

      test("escaped", ()=>{
        assert.equals(format.compile("abc {}1} de\nf {0}}"), ['abc {1} de\nf ','s0', '}']);
      });
      test("html escape", ()=>{
        assert.equals(format.compile("abc{e1}"), ['abc','e1', '']);
      });

      test("nested objects", ()=>{
         assert.equals(format.compile("abc{e$foo.bar.baz}"), ['abc','e$foo.bar.baz', '']);
      });

      test("precision", ()=>{
        assert.equals(format.compile("abc{f1,.2}"), ['abc','f1', '.2', '']);
      });
    });

    group("format", ()=>{
      /**
       * Format a string with parameters
       */
      let format;
      beforeEach(()=>{
        format = api.custom(origFormat);
      });
      test("constant", ()=>{
        assert.equals(format("no args"), "no args");
      });

      test("inspect", ()=>{
        const bar = ()=>{};

        assert.same(format("{i0}, {i1} {i2}", "foo", {a: [3,4, bar]}),
                    "'foo', {a: [3, 4, function bar(){}]} undefined");
      });

      test("missing arg", ()=>{
        assert.same(format("abc {1} de\nf {0}", '00'), 'abc  de\nf 00');
      });

      test("simple", ()=>{
        assert.same(format("abc {1} de\nf {0}", '00', 11), 'abc 11 de\nf 00');
      });

      test("edge", ()=>{
        assert.equals(format("{1}edge{} args{2}", 'ww', 'xx', 'yy'), 'xxedge{ argsyy');
      });
      test("html escape", ()=>{
        assert.equals(format("abc{e0}", '<\'he llo"`&>'), 'abc&lt;&#x27;he llo&quot;&#x60;&amp;&gt;');
      });
      test("pre compiled", ()=>{
        assert.same(format(['abc ','s1',' def ','s0'], '00', 11), 'abc 11 def 00');
      });

      test("nested objects", ()=>{
        assert.equals(format("{1}abc{e$foo.bar.baz}", 1, 2, {foo: {bar: {baz: "<fnord>"}}}), "2abc&lt;fnord&gt;");
      });

      test("using this", ()=>{
        assert.equals(format.call({foo: 'bar'}, "{$foo}", 1), "bar");
        assert.equals(format.call({foo: 'bar'}, "{$foo}", {foo: 'fuz'}), "fuz");
      });

      test("precision", ()=>{
        assert.equals(format("{f0,.2}", 39.99999999999999), '40.00');
        assert.equals(format("hello {f0,.2}", -23.4544), 'hello -23.45');
        assert.equals(format("{f0,.1}", 0), '0.0');
        assert.equals(format("{f0,.2}", undefined), '');
        assert.equals(format("{f0,.2z}", 1.3), '1.3');
        assert.equals(format("{f0,.2z}", -4), '-4');
        assert.equals(format("{f0,.2z}", -4.55555), '-4.56');
      });
    });

    test("translate", ()=>{
      api.method();

      stubProperty(ResourceString, 'no', {value: {
        is_invalid: 'er ikke gyldig',
      }});

      stubProperty(ResourceString, 'de', {value: {
        cant_be_less_than: 'darf nicht kleiner als {0} sein'
      }});

      assert.same(format.translate(null), null);

      assert.same(format.translate('is_invalid'), 'is not valid');

      assert.same(format.translate('is_invalid', 'no'), 'er ikke gyldig');

      assert.same(format.translate('cant_be_less_than:5', 'de'), 'darf nicht kleiner als 5 sein');

      assert.same(format.translate(['cant_be_less_than', 20], 'de'), 'darf nicht kleiner als 20 sein');

      assert.same(format.translate(['cant_be_less_than', 20], 'zu'), "can't be less than 20");

      assert.same(format.translate('no translation:123', 'zu'), "no translation:123");
    });
  });
});
