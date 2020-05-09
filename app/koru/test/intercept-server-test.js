define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test');
  const terser          = requirejs.nodeRequire('terser');

  const {stub, spy, util} = TH;

  const Module = module.constructor;
  const Intercept = require('./intercept');

  const parseOpts = {module: true, bare_returns: true};

  const ipv = Intercept[isTest];

  const SCOPE_DELIM = {
    SymbolDefun: true,
    BlockStatement: true,
    Defun: true,
  };

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    group("breakPoint", ()=>{
      const mod = new Module(void 0, "foo/bar");

      afterEach(Intercept.finishIntercept);

      test("within member word", ()=>{
        const fooBar = function fooBar() {fooBar.toString();};
        const source = fooBar.toString();
        const epos = source.indexOf(".")+3;
        Intercept.breakPoint(mod.id, epos, "to", source);
        assert.equals(ipv.repSrc, 'function fooBar() {fooBar[_koru_.__INTERCEPT$__]("to").toString();}');
      });


      test("member at end of body", ()=>{
        const fooBar = function fooBar() {fooBar.toString()};
        const source = fooBar.toString().slice(0, -1);
        const epos = source.length+1;
        Intercept.breakPoint(mod.id, epos, "", source+".}");
        assert.equals(ipv.repSrc, 'function fooBar() {fooBar.toString()[_koru_.__INTERCEPT$__]("")}');
      });

      test("scope var complete", ()=>{
        const fooBar = function fooBar() {
          {const x1 = 1;}
          const ab = 123;
          function abb() {
            const x3 = 3;
          };
          function abc() {
            const ac = 456;
            abb();
            assert();
            const de = 789;
            {const x4 = 4;}
          }
          {const x2 = 1;}
        };

        let fbSource = fooBar.toString();
        const epos = fbSource.indexOf("ssert");
        const source = fbSource.replace(/ssert\(\);/, '');

        Intercept.breakPoint(mod.id, epos, "a", source);

        const exp = 'globalThis[_koru_.__INTERCEPT$__](\"a\",{fooBar, arguments, ab, abb, abc, ac})';

        assert.equals(ipv.repSrc, fbSource.replace(/assert\(\);/, exp));
      });
    });
  });
});
