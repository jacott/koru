define((require, exports, module)=>{
  const TH       = require('koru/test');

  const jsParser = require('./js-parser');
  var test, v;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      test = this;
      v = {};
    });

    afterEach(()=>{
      v = null;
    });

    group("extractCallSignature", ()=>{
      test("simple", ()=>{
        function sig(a, b, c) {}
        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(a, b, c)');
      });

      test("arrow function", ()=>{
        const sig = foo => foo*2;

        assert.equals(jsParser.extractCallSignature(sig),
                      'foo => {/*...*/}');
      });

      test("class", ()=>{
        class Sig {
          // comment
          constructor(a, b=") {}") {
          }

          foo() {
            this.constructor.foo();
          }
        }

        assert.equals(jsParser.extractCallSignature(Sig),
                      'constructor(a, b=") {}")');
      });

      test("no constructor", ()=>{
        class Sig {}

        assert.equals(jsParser.extractCallSignature(Sig),
                      'constructor()');
      });

      test("defaults", ()=>{
        const obj = {
          bar({a: foo}={a: foo=() => {return "foo"}}, b=foo()) {}
        };

        assert.equals(jsParser.extractCallSignature(obj.bar),
                      'bar({a: foo}={a: foo=() => {return \"foo\"}}, b=foo())');
      });

      test("multi-line", ()=>{
        const sig = "foo(a,\nb=a.foo()) {\n}";

        assert.equals(jsParser.extractCallSignature(sig),
                      'foo(a,\nb=a.foo())');
      });

      test("quoted", ()=>{
        function sig(a=")") {}
        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(a=")")');
      });

      test("escaped quote", ()=>{
        function sig(a="\"\\") {}
        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(a="\\"\\\\")');
      });

      test("comment//", ()=>{
        function sig(a= // ignore this 12) {}
                     "he") {}

        assert.match(jsParser.extractCallSignature(sig),
                     /^sig\(a= \/\/ ignore this 12\) \{\}\n\s+"he"\)$/);
      });

      test("/* comment */", ()=>{
        function sig(a= /* ignore this 12) {} */ "he") {}

        assert.equals(jsParser.extractCallSignature(sig),
                      'sig(a= /* ignore this 12) {} */ "he")');
      });

      test("full monty", ()=>{
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
