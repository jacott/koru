const fs = require('fs');
const path = require('path');

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


      assert.same(v.api.OUT_DIR, path.resolve(module.toUrl('.'), '../../../../doc'));

      v.api.OUT_DIR = 'out_dir';

      test.stub(fs, 'readFileSync').throws(new Error("not found"));
      test.stub(fs, 'writeFileSync');

      v.api._record();

      assert.calledWith(fs.readFileSync, 'out_dir/api.json');

      assert.calledWith(fs.writeFileSync, 'out_dir/api.json', TH.match(out => {
        assert.equals(JSON.parse(out), {
          'koru/test/api-server': {
            subject: {
              ids: ['koru/test/api'],
              name: 'fooBar',
              abstracts: TH.match.any,
            },
            newInstance: undefined,
            properties: undefined,
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
