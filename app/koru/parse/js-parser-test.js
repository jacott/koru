define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy} = TH;

  const jsParser = require('./js-parser');
  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    group('findMatch', () => {
      test('simple string', () => {
        const ex = ((b) => {return '`a"${`${b}`+c}d`e\'f' + '3' + b}).toString();
        assert.equals(jsParser.findMatch(ex, "'"), 37);
        assert.equals(jsParser.findMatch(`"a\\"'bc"def`, '"'), 8);
      });

      test('nested template string', () => {
        let ex = ((b) => {return `a${`${b}` + 'c'}d$\{b` + `123`}).toString();
        assert.equals(jsParser.findMatch(ex, '`'), 38);
      });
    });

    test('lineNestLevel', () => {
      let v = {};
      const ex = ((b) => {
        while (v.a == v.b) {v.c({foo: {
          bar(a, b) {
            if (a == b) {
              a(b.foo(
                1,
                2,
              ));
            }
          },
        }})}
      }).toString();

      const cb = stub();

      jsParser.lineNestLevel(ex, cb);
      assert.equals(cb.calls.map((c) => c.args), [
        [1, 9], [5, 49], [6, 71], [7, 97], [9, 120], [9, 139],
        [9, 158], [7, 176], [6, 190], [5, 203], [1, 216]]);

      cb.reset();
      jsParser.lineNestLevel(ex.slice(0, -25), cb);
      assert.equals(cb.calls.map((c) => c.args), [
        [1, 9], [5, 49], [6, 71], [7, 97], [9, 120], [9, 139], [9, 158], [7, 176], [6, 190]]);
    });

    test('shiftIndent', () => {
      const ex = `

    let a = 1;

    if (a == 2)
      a = 3;

 else
   a = 4;
`;
      assert.equals(jsParser.shiftIndent(ex), `

let a = 1;

if (a == 2)
  a = 3;

else
  a = 4;
`);
    });

    test('indent', () => {
      const ex = `((b)=>{
while(v.a == v.b) {v.c({foo: {
bar(a, b) {

                                 if (a == b) {
a(b.foo(
1,
2
));
}
}
}});}
})`;

      assert.equals(jsParser.indent(ex), `((b)=>{
  while(v.a == v.b) {v.c({foo: {
    bar(a, b) {

      if (a == b) {
        a(b.foo(
          1,
          2
        ));
      }
    }
  }});}
})`);
    });

    group('extractCallSignature', () => {
      test('simple', () => {
        function sig(a, b, c) {}
        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(a, b, c)');
      });

      test('native', () => {
        assert.equals(jsParser.extractCallSignature(Array.prototype.copyWithin),
                      'copyWithin(arg0, arg1)');
        assert.equals(jsParser.extractCallSignature(Array.prototype.copyWithin.toString()),
                      'copyWithin()');
      });

      test('arrow function', () => {
        const sig = (foo) => foo * 2;

        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(foo)');

        const sig2 = (foo, bar) => {
          return (bar, foo) => {};
        };
        assert.equals(jsParser.extractCallSignature(sig2),
                      'sig2(foo, bar)');
      });

      test('nameless arrow function', () => {
        assert.equals(jsParser.extractCallSignature((foo) => foo * 2, 'myname'),
                      'myname(foo)');
      });

      test('function expression', () => {
        assert.equals(jsParser.extractCallSignature(function (foo) {}),
                      '(foo)');
        assert.equals(jsParser.extractCallSignature(function read(foo) {}),
                      'read(foo)');

        assert.equals(jsParser.extractCallSignature({
          a: {
            read: (foo) => {},
          }}.a.read), 'read(foo)');

        const named = function (a, b) {}
        assert.equals(jsParser.extractCallSignature(named),
                      'named(a, b)');
      });

      test('unamed class', () => {
        const Book = {};
        Book.unamed = class {
          constructor(startPage) {this.page = startPage}
          goto() {return this.page;}
        };

        assert.equals(jsParser.extractCallSignature(Book.unamed),
                      "new [Anonymous](startPage)");
      });

      test('class', () => {
        class Sig {
          // comment
          constructor(a, b=') {}') {}

          foo() {
            this.constructor.foo();
          }
        }

        assert.equals(jsParser.extractCallSignature(Sig),
                      "new Sig(a, b=') {}')");

        assert.equals(jsParser.extractCallSignature('class()'), 'class()');
      });

      test('super constructor', () => {
        class SuperSig {
          constructor(a, b) {}
        }
        class Sig extends SuperSig {
        }

        assert.equals(jsParser.extractCallSignature(Sig),
                      'new Sig(a, b)');
      });

      test('no constructor', () => {
        class Sig {}

        assert.equals(jsParser.extractCallSignature(Sig),
                      'new Sig()');
      });

      test('defaults', () => {
        const obj = {
          bar({a: foo}={a: foo = () => {return 'foo'}}, b=foo()) {},
        };

        assert.equals(jsParser.extractCallSignature(obj.bar),
                      "bar({a: foo}={a: foo = () => {return 'foo'}}, b=foo())");
      });

      test('multi-line', () => {
        const sig = 'foo(a,\nb=a.foo()) {\n}';

        assert.equals(jsParser.extractCallSignature(sig),
                      'foo(a,\nb=a.foo())');
      });

      test('quoted', () => {
        function sig(a=')') {}
        assert.equals(jsParser.extractCallSignature(sig),
                      "sig(a=')')");
      });

      test('escaped quote', () => {
        function sig(a='"\\') {}
        assert.equals(jsParser.extractCallSignature(sig),
                      "sig(a='\"\\\\')");
      });

      test('comment//', () => {
        function sig(a= // ignore this 12) {}
                     'he') {}

        assert.match(jsParser.extractCallSignature(sig),
                     /^sig\(a= \/\/ ignore this 12\) \{\}\n\s+'he'\)$/);
      });

      test('/* comment */', () => {
        function sig(a= /* ignore this 12) {} */ 'he') {}

        assert.equals(jsParser.extractCallSignature(sig),
                      "sig(a= /* ignore this 12) {} */ 'he')");
      });

      test('full monty', () => {
        function sig({a: {b: [c,d,e]}}=(function () {
        })() /* ignore this 12) {} */, x=`${d+
e // in string comment
}`) {
          return c+d+e+x;
        }

        assert.match(jsParser.extractCallSignature(sig),
                     /^sig\({a: {b: \[c,[\s\S]*in string[^`]*`\)$/);
      });
    });
  });
});
