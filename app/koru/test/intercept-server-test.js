define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

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

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    group('breakPoint', () => {
      const mod = new Module(void 0, 'foo/bar');

      afterEach(Intercept.finishIntercept);

      test('after optional chaining', () => {
        const fooBar = function fooBar() {fooBar?.toString();};
        const source = fooBar.toString();
        const epos = source.indexOf('.')+3;
        Intercept.breakPoint(mod.id, epos, 'to', source);
        assert.equals(ipv.repSrc, 'function fooBar() {fooBar?.[_ko'+'ru_.__INTERCEPT$__]("to")._toString();}');
      });

      test('within member word', () => {
        const fooBar = function fooBar() {fooBar.toString();};
        const source = fooBar.toString();
        const epos = source.indexOf('.')+3;
        Intercept.breakPoint(mod.id, epos, 'to', source);
        assert.equals(ipv.repSrc, 'function fooBar() {fooBar[_ko'+'ru_.__INTERCEPT$__]("to")._toString();}');
      });


      test('member at end of body', () => {
        const fooBar = function fooBar() {fooBar.toString()};
        const source = fooBar.toString().slice(0, -1);
        const epos = source.length+1;
        Intercept.breakPoint(mod.id, epos, '', source+'.}');
        assert.equals(ipv.repSrc, 'function fooBar() {fooBar.toString()[_ko'+'ru_.__INTERCEPT$__]("")._}');
      });

      test('scope var complete', () => {
        const fooBar = function fooBar() {
          {const x1 = 1;}
          const ab = 123;
          function abb() {
            const x3 = 3;
          };
          function abc(p1) {
            const ac = 456;
            abb();
            assert();
            const de = 789;
            {const x4 = 4;}
          }
          {const x2 = 1;}
        };

        let fbSource = fooBar.toString();
        const epos = fbSource.indexOf('assert');
        const source = fbSource.replace(/assert\(\);/, 'a');

        Intercept.breakPoint(mod.id, epos, '', source);

        const exp = 'globalThis[_ko'+'ru_.__INTERCEPT$__](\"\",{ac,abc,p1,ab,abb,fooBar,})._a';

        assert.equals(ipv.repSrc, fbSource.replace(/assert\(\);/, exp));
      });

      test('scope in assignment', () => {
        function code() {const ErrOther = 123;class ErrMine extends Error {x() {new ErrMine()}}}

        let source = code.toString();
        let epos = source.indexOf('Error') + 3;
        Intercept.breakPoint(mod.id, epos, 'Err', source);

        assert.same(ipv.repSrc.slice(epos - 3, - 21),
                    'globalThis[_ko'+'ru_.__INTERCEPT$__]("Err",{ErrOther,})._Error {');


        epos = source.indexOf('new', epos) + 7;
        Intercept.breakPoint(mod.id, epos, 'Err', source);

        assert.same(ipv.repSrc.slice(epos - 3, - 3),
                    'globalThis[_ko'+'ru_.__INTERCEPT$__]("Err",{ErrOther,ErrMine,})._ErrMine()');


      });
    });
  });
});
