define(function (require, exports, module) {
  var test, v;
  const TH   = require('./main');
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

    "test _record"() {
      const fooBar = {
        fnord(a, b) {return API}
      };
      const api = v.api.module(fooBar, 'fooBar', [{id: 'koru/test/api'}]);

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

      test.stub(TH.session, 'sendBinary');

      v.api._record();

      assert.calledWith(TH.session.sendBinary, 'G', [TH.match(out => {
        assert.equals(out, {
          'koru/test/api-client': {
            subject: {
              ids: ['koru/test/api'],
              name: 'fooBar',
              abstracts: TH.match.any,
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
          },
        });
        return true;
      })]);
    },
  });
});
