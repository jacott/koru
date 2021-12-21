isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const {reformat} = require('./code-formatter');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let text;
    group('format', () => {
      test('indent', () => {
        assert.equals(reformat('if (\n1 +\n2 +\n3\) ++b;\n'), 'if (\n  1 +\n  2 +\n  3) ++b;\n');
        assert.equals(reformat('a &&\nb\n&& c'), 'a &&\n  b &&\n  c');

        assert.equals(reformat('if (a) {\n} else if (x) {\n  {\n++c;\n}\n}\n'),
                      'if (a) {\n} else if (x) {\n  {\n    ++c;\n  }\n}\n');

        assert.equals(reformat('if (a) {\nb();\n} else if (x &&\ny) {\nc();\n}\n'),
                      'if (a) {\n  b();\n} else if (x &&\n           y) {\n  c();\n}\n');

        assert.equals(reformat('if (\n(2*\n 3)) {\nt()\n}'),
                      'if (\n  (2 *\n   3)) {\n  t();\n}');

        assert.equals(reformat('if (1234 + ( 34 * \n 1)) {\nt()\n}'),
                      'if (1234 + (34 *\n            1)) {\n  t();\n}');

        text =
          '        () => {\n' +
          '          test(\n' +
          '            [1, [[2, 3,\n' +
          '                  4, [[\n' +
          '                    5, 6,\n' +
          '                    7, 8,\n' +
          '                  ]], [[\n' +
          '                    0,\n' +
          '                  ]], [\n' +
          '                    123,\n' +
          '                  ], [\n' +
          '                    456,\n' +
          '             ]]],\n' +
          '            ],\n' +
          '          );\n' +
          '        }';

        assert.equals(reformat(text), text);

        assert.equals(reformat('{\na();\nb();\n}'), '{\n  a();\n  b();\n}');
        assert.equals(reformat('const a = b();\n\ndef(() => {\nc();\n});\n'),
                      'const a = b();\n\ndef(() => {\n  c();\n});\n');

        text = `
if (a ||
    b) {
  c();
} else {
  d();
}
x()`;
        assert.equals(reformat(text), text);
      });

      test('labels', () => {
        const text = `foo :
 while(true) {
  break    foo;
}`;
        assert.equals(reformat(text), 'foo: while (true) {\n  break foo;\n}');
        assert.equals(reformat(text.replace(/break/, 'continue')), 'foo: while (true) {\n  continue foo;\n}');
      });

      test('comments', () => {
        assert.equals(reformat(`(/*(*/1,/*<*/2/*>*/,3/*)*/)`), `(/*(*/1,/*<*/2/*>*/,3/*)*/)`);
        assert.equals(reformat('a = {\n  b,\n\n // c1\n  c\n}'), 'a = {\n  b,\n\n  // c1\n  c,\n}');
        assert.equals(reformat('a = {\n  b,\n\n // c1\n}'), 'a = {\n  b,\n\n  // c1\n}');
        assert.equals(reformat('{\na(); // c1\n}'), '{\n  a(); // c1\n}');
        assert.equals(reformat('{\na();   // c1\nb();// c2\n}'), '{\n  a();   // c1\n  b();// c2\n}');
        assert.equals(reformat('if (a) return\n// x\na.b()'), 'if (a) return;\n// x\na.b()');
        assert.equals(reformat('a = 1\n// x\nb()'), 'a = 1;\n// x\nb()');
        assert.equals(reformat('((((/*(*/1,2,3/*)*/))))'), '(/*(*/1, 2, 3/*)*/)');
      });

      test('keywords', () => {
        assert.equals(reformat('const a =   new   Error , b = new String  ()'),
                      'const a = new Error(), b = new String()');
        assert.equals(reformat('throw  new   Error ()'), 'throw new Error()');
        assert.equals(reformat('function *a() {yield   * b()}'), 'function *a() {yield* b()}');
        assert.equals(reformat('return    a'), 'return a');
      });

      test('lists', () => {
        assert.equals(reformat('(1,2,3)'), '(1, 2, 3)');
      });

      test('spread and default assignments', () => {
        assert.equals(reformat('let {x: y=123}={}'), 'let {x: y=123} = {}');
        assert.equals(reformat('let {["x"+"x"]: b} = {xx: 123};'), "let {['x' + 'x']: b} = {xx: 123};");
        assert.equals(reformat('let    a  ;'), 'let a;');
        assert.equals(reformat('const    a=123;'), 'const a = 123;');
        assert.equals(reformat('const a\n\n =\n\n123;'), 'const a = 123;');
        assert.equals(reformat('let {  a  =   b(1,2),c:d,e:{f = 5}, g: [h,i],j} = {e:{f:0}, g:[1,2]}'),
                      'let {a=b(1, 2), c: d, e: {f=5}, g: [h, i], j} = {e: {f: 0}, g: [1, 2]}');
        assert.equals(reformat('let [a,b] = [1,2];'), 'let [a, b] = [1, 2];');
      });

      test('string quotes', () => {
        assert.equals(reformat('foo(\n"string");'), `foo(\n  'string')`);
        assert.equals(reformat('foo( "\x0b");'), `foo("\\u000b")`);
      });

      test('UnaryExpression', () => {
        assert.equals(reformat('typeof a'), 'typeof a');
        assert.equals(reformat('-   [a].toString()'), '-[a].toString()');
        assert.equals(reformat('-   a()'), '-a()');
        assert.equals(reformat('-   (i+1)'), '-(i + 1)');
        assert.equals(reformat('+   (i+1)'), '+(i + 1)');
        assert.equals(reformat('-   i'), '-i');
        assert.equals(reformat('-++i'), '- ++i');
        assert.equals(reformat('-i++'), '- i++');
        assert.equals(reformat('void    123'), `void 123`);
        assert.equals(reformat('- 123'), `-123`);
        assert.equals(reformat('+ 123'), `+123`);
        assert.equals(reformat('!   (   12,true   )'), `! (12, true)`);
        assert.equals(reformat('!a'), `! a`);
        assert.equals(reformat('!  !a'), `!! a`);
        assert.equals(reformat('!   \na'), `! a`);
      });

      test('LogicalExpression', () => {
        assert.equals(reformat('a &&\n  b'), `a &&\n  b`);
        assert.equals(reformat('a&&   b'), `a && b`);
      });

      test('BinaryExpression', () => {
        assert.equals(reformat('2 + 4 + 5 + 6 + 7'), '2+4+5+6+7');
        assert.equals(reformat('3 * 2 + 4 + 5*5 + 6 * 7'), '3*2 + 4 + 5*5 + 6*7');
        assert.equals(reformat('3 * (2 + 4)'), `3 * (2+4)`);
        assert.equals(reformat('3 *   2   +4'), `3*2 + 4`);
        assert.equals(reformat('a&   b'), `a & b`);
        assert.equals(reformat('a\n &  b'), `a &\n  b`);
      });

      test('AssignmentExpression', () => {
        assert.equals(reformat('a =   (( //a\n  1,2));'), `a = ( //a\n  1, 2)`);
        assert.equals(reformat('a =\n 1 +\n2 +\n3;'), 'a =\n  1 +\n  2 +\n  3');
        assert.equals(reformat('a =   {b: 1};'), `a = {b: 1}`);
        assert.equals(reformat('a\n =  b'), `a =\n  b`);
        assert.equals(reformat('a=   b'), `a = b`);
      });

      test('ConditionalExpression', () => {
        assert.equals(reformat('a?b:c'), `a ? b : c`);
        assert.equals(reformat('a?\nb:c'), `a\n? b\n: c`);
      });

      test('array', () => {
        assert.equals(reformat('a = [1,2,3,4]'), `a = [1, 2, 3, 4]`);
        assert.equals(reformat('const [a,b,c] = d;'), 'const [a, b, c] = d;');
      });

      test('for of', () => {
        assert.equals(reformat('for (const   a   of   b  ) c\n'), `for (const a of b) c;\n`);
        assert.equals(reformat('for (b of c) {\n  d\n};\n'), `for (b of c) {\n  d;\n}\n`);
      });

      test('for in', () => {
        assert.equals(reformat('for (const   a   in   b  ) c;'), `for (const a in b) c`);
        assert.equals(reformat('for (b in c) {\n  d\n};\n'), `for (b in c) {\n  d;\n}\n`);
      });

      test('for i', () => {
        assert.equals(reformat('for(;a;) break\n'), 'for (;a;) break;\n');
        assert.equals(reformat('for(a;;) break\n'), 'for (a;;) break;\n');
        assert.equals(reformat('for(;;) break\n'), 'for (;;) break;\n');
        assert.equals(reformat('for(let i = 0;i < 4;++i) {\n i++\n};\n'),
                      'for (let i = 0; i < 4; ++i) {\n  i++;\n}\n');
      });

      test('TryStatement', () => {
        assert.equals(reformat('try {a()}\n\n    finally {\na\n}'),
                      'try {a()} finally {\n  a;\n}');
        assert.equals(reformat('try {\na;b; c\nd\n}\n\n   catch(err){\na\n}'),
                      'try {\n  a; b; c;\n  d;\n} catch (err) {\n  a;\n}');
        assert.equals(reformat('try {\na;b; c\nd\n} catch(err){\na;b\nc\n}   finally{\na;c\nd}'),
                      'try {\n' +
                      '  a; b; c;\n' +
                      '  d;\n' +
                      '} catch (err) {\n' +
                      '  a; b;\n' +
                      '  c;\n' +
                      '} finally {\n' +
                      '  a; c;\n' +
                      '  d}');
      });

      test('SwitchStatement', () => {
        assert.equals(
          reformat('switch (a) {\n' +
                   'case 1:\n' +
                   ' a\n' +
                   ' b\n' +
                   ' break;\n' +
                   'default:\n' +
                   ' x()\n' +
                   ' return 4\n' +
                   '};\n' +
                   'a()',
                  ), 'switch (a) {\n' +
            'case 1:\n' +
            '  a;\n' +
            '  b;\n' +
            '  break;\n' +
            'default:\n' +
            '  x();\n' +
            '  return 4;\n' +
            '}\n' +
            'a()',
        );
        assert.equals(reformat('switch(a) {case 1: case 2:}'), 'switch (a) {case 1: case 2:}');
      });

      test('WhileStatement', () => {
        assert.equals(reformat('while (b) {\na();\n}\n'), 'while (b) {\n  a();\n}\n');
        assert.equals(reformat('  while(  abc  )\n  yin();'), '  while (abc) {\n    yin();\n  }');
        assert.equals(reformat('while(\n  abc ||\ndef  )    {}'), 'while (\n  abc ||\n  def) {}');
        assert.equals(reformat('while(  abc  )    {}'), 'while (abc) {}');
        assert.equals(reformat('while(  abc  )  yin()'), 'while (abc) yin()');
        assert.equals(reformat('while(  abc  )  yin();\n'), 'while (abc) yin();\n');
      });

      test('IfStatement', () => {
        assert.equals(reformat('{\nif(a) b.c() ;\n}'), '{\n  if (a) b.c();\n}');
        let text = 'if (o) {\n' +
            '  if (i) {\n' +
            '    i.toString();\n' +
            '  }\n' +
            '}\n';

        assert.equals(reformat(text), text);

        text = `
      if (input.lockedIn === !! input.lockedIn)
        locked |= 1;
      else if (input.lockedIn === 'downstream')
        locked |= 4;
      else
        valid = false;
`;
        assert.equals(reformat(text), '\n' +
                      'if (input.lockedIn === !! input.lockedIn) {\n' +
                      '  locked |= 1;\n' +
                      "} else if (input.lockedIn === 'downstream') {\n" +
                      '  locked |= 4;\n' +
                      '} else {\n' +
                      '  valid = false;\n' +
                      '}\n');
        assert.equals(reformat('if (a) {\nreturn;\n}'), 'if (a) {\n  return;\n}');
        assert.equals(reformat('if(\n  abc || def  )    {}'), 'if (\n  abc || def) {}');
        assert.equals(reformat('if(  abc  )    {}'), 'if (abc) {}');
        assert.equals(reformat('if(  abc  )  yin()\n'), 'if (abc) yin();\n');
        assert.equals(reformat('if(  abc  )  yin()'), 'if (abc) yin()');
        assert.equals(reformat('if(  abc  )\n  yin();'), 'if (abc) {\n  yin();\n}');
        assert.equals(reformat('if (abc) {\n  yin();\n} else\n  yang();'), 'if (abc) {\n  yin();\n} else {\n  yang();\n}');
      });

      test('Method defs', () => {
        assert.equals(reformat('class A {set [x](v) {}}'), 'class A {set [x](v) {}}');
        assert.equals(reformat('class A {\n  a(x, y) {\n  }\n}'), 'class A {\n  a(x, y) {}\n}');
        assert.equals(reformat('a = function   *   ( a, b,c) {}'), 'a = function *(a, b, c) {}');
        assert.equals(reformat('function   *  a   ( a, b,c)\n {}'), 'function *a(a, b, c) {}');
        assert.equals(reformat('class A {constructor   ( v ) {}}'), 'class A {constructor(v) {}}');
        assert.equals(reformat('class A {[   foo  ] ( v ) {}}'), 'class A {[foo](v) {}}');
        assert.equals(reformat('class A {get a (   ) {}}'), 'class A {get a() {}}');
        assert.equals(reformat('class A {\n  static  async   a (a,b  ) {}}'),
                      'class A {\n  static async a(a, b) {}}');
        assert.equals(reformat('class A {\nstatic  * a (a,b  ) {}}'), 'class A {\n  static *a(a, b) {}}');
        assert.equals(reformat('class A {\nstatic  a (a,b  ) {}}'), 'class A {\n  static a(a, b) {}}');
        assert.equals(reformat('x = {a  ( a, b,c) {}}'), 'x = {a(a, b, c) {}}');
      });

      test('CallExpression', () => {
        assert.equals(reformat('a\n  (\n\n\n  b,c,d)'), `a(\n  b, c, d)`);
        assert.equals(reformat('(a)\n.toString()'), `(a)\n.toString()`);
        assert.equals(reformat('( a)()'), `(a)()`);
        assert.equals(reformat('a  (  b,c,d)'), `a(b, c, d)`);
      });

      test('objects', () => {
        assert.equals(reformat(`let a = { '999999999999999': 1, '9999999999999999': 2  };`), "let a = {999999999999999: 1, '9999999999999999': 2};");
        assert.equals(reformat(`let a = { 'abc': 1, '345': 2, '2ad': 3, '#$%': 4  };`), `let a = {abc: 1, 345: 2, '2ad': 3, '#$%': 4};`);
        assert.equals(reformat('a({\n  a: c,d2,  \n\n \n \n  d, e:\n f  \n  });'),
                      'a({\n  a: c, d2,\n\n  d, e: f,\n})');
        assert.equals(reformat('const {  a,b: c,\n\n\n } = d;'), 'const {a, b: c,\n} = d;');
        assert.equals(reformat('define(() => {\n return {\n reformat: {},\n}\n})'),
                      'define(() => {\n  return {\n    reformat: {},\n  };\n})');
        assert.equals(reformat('({ a = 123,b  }) => 456'), '({a=123, b}) => 456');
        assert.equals(reformat('a(  { b:   c,   d,e:e,  });'), 'a({b: c, d, e})');
        assert.equals(reformat('a({ [b]: 123 })'), 'a({[b]: 123})');
        assert.equals(reformat('a({ [b]: c })'), 'a({[b]: c})');

        assert.equals(reformat('return { a,b  }'), 'return {a, b}');
        assert.equals(reformat('const {  a,  b: c, } = d;'), 'const {a, b: c} = d;');
      });

      test('parenthesis', () => {
        assert.equals(reformat('a = (1,2,\n3\n)'), 'a = (1, 2,\n     3\n)');
      });

      test('params', () => {
        assert.equals(reformat('var a = [,]'), 'var a = [,]');
        assert.equals(reformat('var a = [,,1]'), 'var a = [, , 1]');
        assert.equals(reformat('var  a1,b,c  ; const  a = 123;'), `var a1, b, c; const a = 123;`);
        assert.equals(reformat('foo  (  a, \n    b,c,  );'), `foo(a,\n    b, c)`);
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

      test('one line block', () => {
        assert.equals(reformat('{a();b();}'), '{a(); b()}');
      });

      test('nested blocks', () => {
        assert.equals(reformat('{\n{\nlet a = 1\n}\n{\nlet b = 1\n}\n\n}'),
                      '{\n  {\n    let a = 1;\n  }\n  {\n    let b = 1;\n  }\n}');
      });

      test('TemplateElement', () => {
        assert.equals(reformat('a = `\n\n\n\n`;'), 'a = `\n\n\n\n`');
      });

      test('TemplateLiteral', () => {
        assert.equals(reformat('{\na = `\n${\nx\n}${y+1}`;}'), '{\n  a = `\n${\n  x}${y + 1}`}');
        assert.equals(reformat('`${f})${i})`'), '`${f})${i})`');
        assert.equals(reformat("d = `${a}a${b}b${c||''}`;"), "d = `${a}a${b}b${c || ''}`");
        assert.equals(reformat('``'), '``');
      });

      test('adjusts semicolons', () => {
        assert.equals(reformat('()=>{foo();;;\n\n\n  ;;; bar()\n}'), `() => {foo();\n\n       bar();\n}`);
        assert.equals(reformat('()=>{foo();;;\n  ;;; bar();}'), `() => {foo();\n       bar()}`);
        assert.equals(reformat('let a\nlet b;\n'), `let a;\nlet b;\n`);
        assert.equals(reformat('{a = (1,2);  }'), `{a = (1, 2)}`);
        assert.equals(reformat('{\n  a = (1,2);\n}'), `{\n  a = (1, 2);\n}`);
        assert.equals(reformat('{output += token}'), `{output += token}`);
        assert.equals(reformat('class A {\nfoo = 123\n}'), 'class A {\n  foo = 123;\n}');
      });

      test('complex', () => {
        const a = `
switch (options) {
case 'object':
  if (options != null) {
    if (info === 'x') {
    } else {
      info = info.toString();
    }
  }
}
a();
`;

        assert.equals(reformat(a), a);
      });

      test('expressions', () => {
        const text = 'if (\n' +
              '  u === (5 * (3+7) *\n' +
              '         4 * 3)) {\n' +
              '  (t === void 0 ? x : t)[key] = undo;\n' +
              '}';

        assert.equals(reformat(text), text);
      });

      test('test arrow functions', () => {
        assert.equals(reformat('arg1=>{arg1("bar")}'), "(arg1) => {arg1('bar')}");
        assert.equals(reformat("(_, m1) => (addresses.push(m1), '')"), "(_, m1) => (addresses.push(m1), '')");
        assert.equals(reformat('async ()=>{arg1()}'), 'async () => {arg1()}');
      });

      test('complex 1', () => {
        let e;
        const text = '        ' + (() => {
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
        const text = '        ' + (() => {
          class g extends TH(() => {
            const a = 123;
          }) {
            m = () => {function foo() {}};
          }
        }).toString();

        assert.equals(reformat(text), text);
      });
    });
  });
});
