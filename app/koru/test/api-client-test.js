define(function (require, exports, module) {
  var test, v;
  const TH   = require('./main');
  const API  = require('./api');

  const ctx = module.ctx;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.api = class extends API {};
      v.api.isRecord = true;
      v.api.reset();
      test.stub(ctx, 'exportsModule').withArgs(API).returns([ctx.modules['koru/test/api']]);
    },

    tearDown() {
      v = null;
    },

    "test _record"() {
      const fooBar = {
        fnord(a, b) {return API}
      };
      const fooBarMod = {id: 'koru/test/api', exports: fooBar};
      const api = v.api.module(null, 'fooBar', [fooBarMod]);

      const Special = {};

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns API',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', test.stub, 'stub'], ['O', Special, '{special}']], ['M', API]
        ]]
      };

      api.protoMethods.zord = {
        test,
        sig: 'zord(a)',
        intro: 'introducing zord',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [false], undefined
        ]]
      };

      api.customMethods.sentai = {
        test,
        sig: 'sentai(a)',
        intro: 'introducing sentai',
        calls: [[
          [1], 2
        ]]
      };

      test.stub(TH.session, 'sendBinary');

      v.api._record();

      assert.calledWith(TH.session.sendBinary, 'G', [TH.match(out => {
        assert.equals(out, {
          'koru/test/api-client': {
            id: 'koru/test/api-client',
            subject: {
              name: 'fooBar',
              abstract: TH.match.any,
            },
            methods: {
              fnord: {
                test: 'koru/test/api-client test _record',
                sig: 'fnord(a, b)',
                intro: 'Fnord ignores args; returns API',
                calls: [[
                  [2, ['F', 'stub'], ['O', '{special}']], ['M', 'koru/test/api']
                ]],
              }
            },
            protoMethods: {
              zord: {
                test: 'koru/test/api-client test _record',
                sig: 'zord(a)',
                intro: 'introducing zord',
                calls: [[
                  [false]
                ]],
              }
            },
            customMethods: {
              sentai: {
                test: 'koru/test/api-client test _record',
                sig: 'sentai(a)',
                intro: 'introducing sentai',
                calls: [[
                  [1], 2
                ]],
              }
            },
            requires: ['koru/test/main', 'koru/util'],
          },
        });
        return true;
      })]);
    },
  });
});
