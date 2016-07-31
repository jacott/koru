const fs = require('fs');

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

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns API',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', test.stub, 'stub'], ['O', Date, '{special}']], ['M', API]
        ]]
      };

      test.stub(fs, 'writeFileSync');

      v.api._record();

      assert.calledWith(fs.writeFileSync, '/home/geoffj/src/koru/doc/api.json', TH.match(out => {
        assert.equals(JSON.parse(out), {
          'koru/test/api-server': {
            subject: {
              ids: ['koru/test/api'],
              name: 'fooBar',
              abstracts: TH.match.any,
            },
            methods: {
              fnord: {
                test: 'koru/test/api-server test _record',
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
      }));
    },
  });
});
