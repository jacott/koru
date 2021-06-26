isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const { stub, spy, util } = TH;

  const { reformat } = require('./code-formatter');

  TH.testCase(module, ({ before, after, beforeEach, afterEach, group, test }) => {
    group('format', () => {
      test('string quotes', () => {
        assert.equals(reformat('foo("string");'), `foo('string');`);
        assert.equals(reformat('foo("\x0d");'), `foo("\x0d");`);
      });

      test('blank lines', () => {
        assert.equals(reformat(`{
  foo();
\t\r
\n  \f\v\r
;;;;;
;;;;;
;;;;;


  bar();
}`), `{\n  foo();\n\n  bar();\n}`);
      });

      test('blank lines at end of block', () => {
        assert.equals(reformat(`{
  foo();
  bar();


}`), `{\n  foo();\n  bar();\n}`);
      });

      test('TemplateElement', () => {
        assert.equals(reformat('a = `\n\n\n\n`;'), 'a = `\n\n\n\n`;');
      });

      test('adjusts semicolons', () => {
        assert.equals(reformat('()=>{foo();;;\n;;; bar();}'), `() => {foo();\n bar()}`);
        assert.equals(reformat('{a = (1,2);  }'), `{a = (1,2)}`);
        assert.equals(reformat('{output += token}'), `{output += token}`);
        assert.equals(reformat('let a\nlet b;'), `let a;\nlet b;`);
        assert.equals(reformat('class A {\nfoo = 123\n}'), 'class A {\nfoo = 123;\n}');
      });

      test('complex', () => {
        const a = `
switch (options) {
case 'object':
  if (options != null) {
    if (info === 'x') {
    } else
      info = info.toString();
  }
}
`;

        assert.equals(reformat(a), a);
      });

      test('expressions', () => {
        const text =
              'if (\n' +
              '    u === (5 * ( 3 + 7)\n' +
              '    * 4 * 3)) {\n' +
              '  (t === void 0\n' +
              '  ? x : t)[key] = undo;\n' +
              '}';

        assert.equals(reformat(text), text);
      });

      test('test arrow functions', () => {
        assert.equals(reformat("(_, m1) => (addresses.push(m1), '')"), "(_, m1) => (addresses.push(m1), '')");
        assert.equals(reformat('arg1=>{arg1("bar")}'), "(arg1) => {arg1('bar')}");
        assert.equals(reformat('async ()=>{arg1()}'), 'async () => {arg1()}');
      });

      test('complex 1', () => {
        let e;
        const text = (() => {
          const a = 1;
          let c = (() => {
            let cc = () => cc;
            if (++d < 5) e(c);
          })();
          function f() {}
          class g extends f(() => {}) {
            m() {return () => {}}
          }
          var d = 1;
          let e = () => {
            const b = 2;
            return c;
          };
          e();
        }).toString();

        assert.equals(reformat(text), text);
      });

      test('complex 2', () => {
        const text = (() => {
          class g extends f(() => {
            const a = 123;
          }) {
            m = () => {function foo() {}}
          }
        }).toString();

        assert.equals(reformat(text), text);

      });
    });
  });
});
