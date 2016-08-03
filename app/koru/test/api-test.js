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

    "test module"() {
      /**
       * Specify the <subject> to be documented
       *
       * @param {[module,...]} subjectModules - list of modules that define the subject
       **/
      API.module(API, 'API');
      API.method('module');

      v.api.module();
      const api = v.api._apiMap.get(API);
      assert(api);
      assert.same(api.subject, API);

      const myHelper = {
        clean() {}
      };

      v.api.module(myHelper, 'myHelper');
    },

    "test method"() {
      /**
       * Document <methodName> for the current subject
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
        intro: 'Document <methodName> for the current subject',
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
        intro: 'Document <methodName> for the current subject',
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

    "test resolveObject"() {
      assert.equals(v.api.resolveObject(test.stub(), 'my stub'), ['Oi', 'my stub', 'Function']);
      v.api._apiMap.set(v.api, v.myApi = new v.api(test.tc, API, 'API', [{id: 'koru/test/api'}]));

      assert.equals(v.ans = v.api.resolveObject(v.myApi, 'myApi'), ['Oi', 'myApi', 'koru/test/api']);
      assert.msg('should cache').same(v.api.resolveObject(v.myApi), v.ans);

      const foo = {foo: 123};

      assert.equals(v.ans = v.api.resolveObject(foo, 'foo'), ['O', 'foo']);
      assert.equals(v.ans = v.api.resolveObject(util.protoCopy(foo), 'ext foo'), ['O', 'ext foo']);

      class SubApi extends v.api {}

      assert.equals(v.ans = v.api.resolveObject(SubApi, 'sub'), ['Os', 'sub', 'koru/test/api']);

      class S2ubApi extends SubApi {}
      class S3ubApi extends S2ubApi {}

      assert.equals(v.ans = v.api.resolveObject(S3ubApi, 's3'), ['Os', 's3', 'koru/test/api']);
      assert.msg('should cache').same(v.api.resolveObject(S3ubApi), v.ans);

      assert.equals(v.api.resolveObject(new S2ubApi(), 's2()'), ['Oi', 's2()', 'koru/test/api']);

      assert.equals(v.api.resolveObject(util.protoCopy(new S2ubApi()), 'ext s2()'), ['Oi', 'ext s2()', 'koru/test/api']);

      assert.equals(v.api.resolveObject([2], '[2]'), ['Oi', '[2]', 'Array']);
      assert.equals(v.api.resolveObject(new Date(), 'dd/mm/yy'), ['Oi', 'dd/mm/yy', 'Date']);
    },

    "test serialize"() {
      const fooBar = {
        fnord(a, b) {return new v.api()}
      };
      const api = new v.api(test.tc, fooBar, 'fooBar', [{id: 'koru/test/api'}]);

      // map in superClass: API
      v.api._apiMap.set(v.api, new v.api(test.tc, API, 'API', [{id: 'koru/test/api'}]));

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns API',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', test.stub, 'stub'], ['O', Date, '{special}']], ['M', API],
        ], [
          [
            "x", true,
            ['O', v.api, '{api extends API}'],
          ],
          undefined,
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
              [2, ['F', 'stub'], ['O', '{special}', 'Date']], ['M', 'koru/test/api'],
            ],[
              [
                'x', true,
                ['M', 'koru/test/api'], // is actually a documented subject
              ]
            ]],
          }
        },
      });
    },
  });
});
