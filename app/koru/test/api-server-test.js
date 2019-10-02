const fs = require('fs');
const path = require('path');

define((require, exports, module)=>{
  'use strict';
  const API             = require('./api');
  const TH              = require('./main');

  const {stub, spy} = TH;

  const ctx = module.ctx;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let v = {};
    beforeEach(()=>{
      test = TH.test;
      v.api = class extends API {};
      v.api.isRecord = true;
      v.api.reset();
      stub(ctx, 'exportsModule').withArgs(API).returns([ctx.modules['koru/test/api']]);
    });

    afterEach(()=>{
      v = {};
    });

    test("_record", ()=>{
      const fooBar = {
        fnord(a, b) {return API}
      };
      const api = v.api.module({subjectName: 'fooBar'});

      const Special = {};

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns API',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', stub, 'stub'], ['O', Special, '{special}']], ['M', API]
        ]]
      };

      assert.same(v.api.OUT_DIR, path.resolve(module.toUrl('.'), '../../../../doc'));

      v.api.OUT_DIR = 'out_dir';

      stub(fs, 'readFileSync').throws(new Error("not found"));
      stub(fs, 'writeFileSync');

      v.api._record();

      assert.calledWith(fs.readFileSync, 'out_dir/api-server.json');

      assert.calledWith(fs.writeFileSync, 'out_dir/api-server.json', TH.match(out => {
        assert.equals(JSON.parse(out), {
          'koru/test/api-server': {
            id: 'koru/test/api-server',
            requires: ['koru/session/main', 'koru/util'],
            subject: {
              name: 'fooBar',
            },
            methods: {
              fnord: {
                test: 'koru/test/api-server test _record.',
                sig: 'fnord(a, b)',
                intro: 'Fnord ignores args; returns API',
                calls: [[
                  [2, ['F', 'stub'], ['O', '{special}']], ['M', 'koru/test/api']
                ]],
              }
            },
            protoMethods: {},
            customMethods: {},
          },
        });
        return true;
      }));
    });
  });
});
