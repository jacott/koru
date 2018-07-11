define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const API             = require('./api');

  const {stub, spy, onEnd} = TH;

  const ctx = module.ctx;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let v = {};
    beforeEach(()=>{
      test = TH.test;
      v.api = class extends API {};
      v.api.isRecord = true;
      v.api.reset();
      test.stub(ctx, 'exportsModule').withArgs(API).returns([ctx.modules['koru/test/api']]);
    });

    afterEach(()=>{
      v = {};
    });

    test("_record", ()=>{
      const fooBar = {
        fnord(a, b) {return API}
      };
      const fooBarMod = {id: 'koru/test/api', exports: fooBar};
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

      stub(TH.session, 'sendBinary');

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
                test: 'koru/test/api-client test _record.',
                sigPrefix: undefined,
                sig: 'fnord(a, b)',
                intro: 'Fnord ignores args; returns API',
                calls: [[
                  [2, ['F', 'stub'], ['O', '{special}']], ['M', 'koru/test/api']
                ]],
              }
            },
            protoMethods: {
              zord: {
                test: 'koru/test/api-client test _record.',
                sigPrefix: undefined,
                sig: 'zord(a)',
                intro: 'introducing zord',
                calls: [[
                  [false]
                ]],
              }
            },
            customMethods: {
              sentai: {
                test: 'koru/test/api-client test _record.',
                sigPrefix: undefined,
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
    });
  });
});
