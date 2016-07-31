define(function (require, exports, module) {
  /**
   * API is a semi-automatic API document generator. It uses
   * unit-tests to determine types and values at test time.
   **/
  var test, v;
  const TH   = require('koru/test');
  const util = require('koru/util');
  const API  = require('./api');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.api = class extends API {};
      v.api.reset();
    },

    tearDown() {
      v = null;
    },

    "test method"() {
      /**
       * Document <method> for the current subject
       **/
      API.module(API, 'API');
      API.method('method');
      const fooBar = {
        fnord(a) {return a*2}
      };

      v.api.module(fooBar, 'fooBar');
      v.api.method('fnord');

      assert.same(fooBar.fnord(5), 10);
      assert.same(fooBar.fnord(-1), -2);

      v.api.done();

      assert.equals(v.api.instance.methods.fnord, {
        test,
        sig: 'fnord(a)',
        intro: 'Document <method> for the current subject',
        subject: ['O', fooBar, '{fnord: => fnord}'],
        calls: [[
          [5], 10
        ],[
          [-1], -2
        ]]
      });

      assert.equals(API.instance.methods.method, {
        test,
        sig: 'method(methodName)',
        intro: 'Document <method> for the current subject',
        subject: ['M', API],
        calls: [[
          ['fnord'], undefined
        ]]
      });
    },

    "test auto subject"() {
      TH.stubProperty(test.tc, "moduleId", {get() {
        return "foo-bar-test";
      }});
      TH.stubProperty(module.ctx.modules, 'foo-bar', {value: v.subject = {
        id: 'foo-bar',
        exports: {},
      }});
      TH.stubProperty(module.ctx.modules, 'foo-bar-test',
                      {value: v.testModule = {}});
      const exportsModule = test.spy(module.ctx, 'exportsModule');

      exportsModule.withArgs(TH.match.is(v.subject.exports))
        .returns([v.subject]);

      var api = v.api.instance;

      assert(api);
      assert.same(api.subject, v.subject.exports);
      assert.same(api.subjectName, 'fooBar');
    },

    "test serialize"() {
      const fooBar = {
        fnord(a, b) {return API}
      };
      const api = new v.api(test.tc, fooBar, 'fooBar', [{id: 'koru/test/api'}]);

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns API',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', test.stub, 'stub'], ['O', Date, '{special}']], ['M', API],
        ], [
          ["x", true], undefined,
        ]]
      };

      assert.equals(api.serialize(), {
        subject: {
          ids: ['koru/test/api'],
          name: 'fooBar',
          abstracts: ['API is a semi-automatic API document generator. It uses\n'+
                      'unit-tests to determine types and values at test time.'],
        },
        methods: {
          fnord: {
            test: 'koru/test/api test serialize',
            sig: 'fnord(a, b)',
            intro: 'Fnord ignores args; returns API',
            calls: [[
              [2, ['F', 'stub'], ['O', '{special}']], ['M', 'koru/test/api'],
            ],[
              ['x', true]
            ]],
          }
        },
      });
    },
  });
});
