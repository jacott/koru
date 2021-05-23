isServer && define((require, exports, module)=>{
  'use strict';
  const TH       = require('koru/test-helper');

  const jsParser = require('./js-parser');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      v = {};
    });

    test("extractParams", ()=>{
      assert.equals(jsParser.extractParams('foo({arg1, arg2}={})'), ['{', 'arg1', 'arg2', '}']);
      assert.equals(jsParser.extractParams('constructor({arg1, arg2})'), ['{', 'arg1', 'arg2', '}']);
      assert.equals(jsParser.extractParams('({a: {b: c}}, ...args)'), ['{', '{', 'c', '}', '}', 'args']);

      assert.equals(jsParser.extractParams('x({a: {aa: d=123}}, [b, c=d*2], ...rest)'), ['{', '{', 'd', '}', '}', '{', 'b', 'c', '}', 'rest']);

      assert.equals(jsParser.extractParams('x() {}'), []);

      assert.equals(jsParser.extractParams('(a, b) =>'), ['a', 'b']);
      assert.equals(jsParser.extractParams('(a, b) => {/*...*/}'), ['a', 'b']);
      assert.equals(jsParser.extractParams('x(a, b) {return {a: (a + b)}}'), ['a', 'b']);
      assert.equals(jsParser.extractParams('const x = (a, b) => ({c(d, e) {}})'), ['a', 'b']);
      assert.equals(jsParser.extractParams('const x = function(a, b) {return {c(d, e) {}}}'), ['a', 'b']);
      assert.equals(jsParser.extractParams('function x(a, b)'), ['a', 'b']);
      assert.equals(jsParser.extractParams('function (a, b)'), ['a', 'b']);

      assert.equals(jsParser.extractParams('(...args)'), ['args']);
    });

    test("nested template string", ()=>{
      const ans = markupBody(()=>{
        v.example({
          b(a=`one ${v.inspect({
c(d=`two ${"`${2}`"+3} four`) {/* `not here` */}
})}`) {return v.foo`bar` || String.foo`1${2}3`}
        });
      });
      assert.equals(ans, `
~nx#v#.~na#example#({
  ~nf#b#(~nv#a#~o#=#~s#\`one $\{#~nx#v#.~na#inspect#({
    ~nf#c#(~nv#d#~o#=#~s#\`two $\{#~s#"\`$\{2}\`"#~o#+#~m#3#~s#} four\`#) {~cm#/* \`not here\` */#}
  })~s#}\`#) {~k#return# ~nx#v#.~na#foo#~s#\`bar\`# ~o#||# ~nx#String#.~na#foo#~s#\`1$\{#~m#2#~s#}3\`#}
});`);
    });

    test("AST_Conditional", ()=>{
      // AST_Conditional (condition consequent alternative)
      //   "Conditional expression using the ternary operator, i.e. `a ? b : c`"
      assertMarkup(()=>{
        let x = (a,b,c)=> a ? b : c;
      }, `
~kd#let# ~nv#x# ~o#=# (~nv#a#,~nv#b#,~nv#c#)~o#=&gt;# ~nx#a# ~o#?# ~nx#b# ~o#:# ~nx#c#;`);
    });

    test("async await", ()=>{
      assertMarkup(()=>{
        let x = async (a)=> await a();
        let y = async function(a) {};
      }, `
~kd#let# ~nv#x# ~o#=# ~k#async# (~nv#a#)~o#=&gt;# ~k#await# ~nx#a#();
~kd#let# ~nv#y# ~o#=# ~k#async# ~kd#function#(~nv#a#) {};`);
    });

    test("await", ()=>{
      assertMarkup(async ()=>{
        // lead comment
        let x = await 123;
      }, `
~cs#// lead comment#
~kd#let# ~nv#x# ~o#=# ~k#await# ~m#123#;`);
    });

    test("yield", ()=>{
      assertMarkup(()=>{
        function *x(a) {yield *a()};
      }, `
~kd#function# *~nf#x#(~nv#a#) {~k#yield# *~nx#a#()};`);
    });

    test("switch", ()=>{
      let key;
      assertMarkup(()=>{
        switch(key) {
        case 1:
          key++;
          break;
        case "2": {
          --key;
        } default:
          --key;
        }
      }, `
~k#switch#(~nx#key#) {
  ~k#case# ~m#1#:
  ~nx#key#~o#++#;
  ~k#break#;
  ~k#case# ~s#"2"#: {
    ~o#--#~nx#key#;
  } ~k#default#:
  ~o#--#~nx#key#;
}`);
    });

    test("try-catch", ()=>{
      let state;
      assertMarkup(()=>{
        try {
          state = 1;
        } catch(ex) {
          throw new Error(ex.message);
        }
      }, `
~k#try# {
  ~nx#state# ~o#=# ~m#1#;
  } ~k#catch#(~nv#ex#) {
  ~k#throw# ~k#new# ~nx#Error#(~nx#ex#.~na#message#);
}`);
    });


    test("try-catch-finally", ()=>{
      let state;
      assertMarkup(()=>{
        try {
          state = 1;
          throw new Error;
        } catch(ex) {
          throw new Error(ex.message);
        } finally {
          state = 0;
        }
      }, `
~k#try# {
  ~nx#state# ~o#=# ~m#1#;
  ~k#throw# ~k#new# ~nx#Error#;
  } ~k#catch#(~nv#ex#) {
  ~k#throw# ~k#new# ~nx#Error#(~nx#ex#.~na#message#);
  } ~k#finally# {
  ~nx#state# ~o#=# ~m#0#;
}`);
    });

    test("async loops", ()=>{
      assertMarkup(`\nfor await (const i of a) i();\n`,
                   `\n~k#for# ~k#await# (~kd#const# ~no#i# ~k#of# ~nx#a#) ~nx#i#();`);
    });

    test("loops", ()=>{
      assertMarkup(()=>{
        let a = 0;
        do {
          ++a;
        } while(a < 10)
        label1:
        while(a > 0) {
          a--;
          for(let i = 0; i < 10; ++i) {
            if (i == 4)
              break label1;
          }

          for (const i of a) {
            for (const key in i) {
              if (key == '') continue label1;
              else ++a;
            }
          }
        }
      }, `
~kd#let# ~nv#a# ~o#=# ~m#0#;
~k#do# {
  ~o#++#~nx#a#;
} ~k#while#(~nx#a# ~o#&lt;# ~m#10#)
~nl#label1#:
~k#while#(~nx#a# ~o#&gt;# ~m#0#) {
  ~nx#a#~o#--#;
  ~k#for#(~kd#let# ~nv#i# ~o#=# ~m#0#; ~nx#i# ~o#&lt;# ~m#10#; ~o#++#~nx#i#) {
    ~k#if# (~nx#i# ~o#==# ~m#4#)
    ~k#break# ~nl#label1#;
  }

  ~k#for# (~kd#const# ~no#i# ~k#of# ~nx#a#) {
    ~k#for# (~kd#const# ~no#key# ~k#in# ~nx#i#) {
      ~k#if# (~nx#key# ~o#==# ~s#''#) ~k#continue# ~nl#label1#;
      ~k#else# ~o#++#~nx#a#;
    }
  }
}`);
    });

    test("special literals", ()=>{
      assertMarkup(
        `\n['1quote', "2quote", \`backquote\`, /regex/, -123, 456n, NaN, Infinity, null, undefined, true, false];\n`,
        `\n[~s#'1quote'#, ~s#"2quote"#, ~s#\`backquote\`#, ~sr#/regex/#, ~o#-#~m#123#, ~m#456n#, ~m#NaN#, ~m#Infinity#, ~kc#null#, ~kc#undefined#, ~kc#true#, ~kc#false#];`);
    });

    test("VariableDeclaration", ()=>{
      assertMarkup(()=>{
        const FOO=123;
        let bar=true;
        bar = false;
        var num = Infinity;
        num = NaN;
        num = null;
        num = undefined;
        const re = /a[3-6]{1,3}/gi;
      }, `
~kd#const# ~no#FOO#~o#=#~m#123#;
~kd#let# ~nv#bar#~o#=#~kc#true#;
~nx#bar# ~o#=# ~kc#false#;
~kd#var# ~nv#num# ~o#=# ~m#Infinity#;
~nx#num# ~o#=# ~m#NaN#;
~nx#num# ~o#=# ~kc#null#;
~nx#num# ~o#=# ~kc#undefined#;
~kd#const# ~no#re# ~o#=# ~sr#/a[3-6]{1,3}/gi#;`);
    });


    test("comments", ()=>{
      const ans = markupBody(() => {
        v.example(() => {
          // start-com
          v.define(/*in-com*/'red', '#f00'); // end-and-start-com

          /* middle */
          v.define('blue', '#00f');
          /* end c1
             here */
          // end c2
        }); //last
      });

      assert.equals(ans, `
~nx#v#.~na#example#(() ~o#=&gt;# {
  ~cs#// start-com#
  ~nx#v#.~na#define#(~cm#/*in-com*/#~s#'red'#, ~s#'#f00'#); ~cs#// end-and-start-com#

  ~cm#/* middle */#
  ~nx#v#.~na#define#(~s#'blue'#, ~s#'#00f'#);
  ~cm#/* end c1
  here */#
  ~cs#// end c2#
}); ~cs#//last#`);
    });

    test("AssignmentPattern", ()=>{
      const code = () => {
        var a = '1' + 2; a = 3;
      };

      assert.equals(markupBody(code), `
~kd#var# ~nv#a# ~o#=# ~s#'1'# ~o#+# ~m#2#; ~nx#a# ~o#=# ~m#3#;`);
    });

    test("ExpressionStatement", ()=>{
      const anon = function (a) {
        return typeof a;
      };

      assert.equals(markup(jsParser.highlight('1|'+jsParser.indent(anon.toString()))), `
~m#1#~o#|#~kd#function# (~nv#a#) {
  ~k#return# ~o#typeof# ~nx#a#;
}`);
    });

    test("optional named params", ()=>{
      const anon = function ({a}={}) {
        return typeof a;
      };

      assert.equals(markup(jsParser.highlight('1|'+jsParser.indent(anon.toString()))), `
~m#1#~o#|#~kd#function# ({~nv#a#}~o#=#{}) {
  ~k#return# ~o#typeof# ~nx#a#;
}`);
    });

    test("ArrowFunctionExpression", ()=>{
      assert.equals(markupBody(() => {
        var a = (z) => z[1].d;
      }), `
~kd#var# ~nv#a# ~o#=# (~nv#z#) ~o#=&gt;# ~nx#z#[~m#1#].~na#d#;`);
    });

    test("ClassDeclaration", ()=>{
      assertMarkup(() => {
        class A extends v(5) {
          constructor(a) {
            super(a);
          }
          static cm() {}
          meth(b) {
            super.meth(b);
          }
        }

        class B {
          async m2() {}
          static async s2() {}
        }
      }, `
~k#class# ~nc#A# ~k#extends# ~nx#v#(~m#5#) {
  ~k#constructor#(~nv#a#) {
    ~k#super#(~nx#a#);
  }
  ~kt#static# ~nf#cm#() {}
  ~nf#meth#(~nv#b#) {
    ~k#super#.~na#meth#(~nx#b#);
  }
}

~k#class# ~nc#B# {
  ~k#async# ~nf#m2#() {}
  ~kt#static# ~k#async# ~nf#s2#() {}
}`);

    });

    test("ClassExpression", ()=>{
      assert.equals(markupBody(() => {
        const A = class extends v(5) {
          static cm() {}
        };
      }), `
~kd#const# ~no#A# ~o#=# ~k#class# ~k#extends# ~nx#v#(~m#5#) {
  ~kt#static# ~nf#cm#() {}
};`);

    });

    test("CallExpression, MemberExpression", ()=>{
      assert.equals(markupBody(() => {
        v.foo();
      }), `
~nx#v#.~na#foo#();`);
    });

    test("sig", ()=>{
      const ex = ()=>{
        function foo({
          query,
          foo: bar=123,
          compare=query ? query.compare : bar,
        }) {
        }
      };

      const ans = markupBody(ex);

      assert.equals(ans, `
~kd#function# ~nf#foo#({
  ~nv#query#,
  ~na#foo#: ~nv#bar#~o#=#~m#123#,
  ~nv#compare#~o#=#~nx#query# ~o#?# ~nx#query#.~na#compare# ~o#:# ~nx#bar#,
}) {
}`);
    });

    test("Destructuring", ()=>{
      assert.equals(markupBody(() => {
        var [{ sh, lhs: { op: b=123 }, rhs: c, d: [e, f] }, x] = v, {a2, b2} = v;
      }), `
~kd#var# [{ ~nv#sh#, ~na#lhs#: { ~na#op#: ~nv#b#~o#=#~m#123# }, ~na#rhs#: ~nv#c#, ~na#d#: [~nv#e#, ~nv#f#] }, ~nv#x#] ~o#=# ~nx#v#, {~nv#a2#, ~nv#b2#} ~o#=# ~nx#v#;`);
    });

    test("ObjectExpression", ()=>{
      const vv = 1;
      assert.equals(markupBody(() => {
        v = {
          a: 1,
          vv,
          'str ing': null,
          ['a'+v.x]: "z",
          'me th'([a, b]) {},
          get v() {return this._v},
          set v(value) {this._v =  value},
          foo: function() {}
        };
      }), `
~nx#v# ~o#=# {
  ~na#a#: ~m#1#,
  ~na#vv#,
  ~s#'str ing'#: ~kc#null#,
  [~s#'a'#~o#+#~nx#v#.~na#x#]: ~s#\"z\"#,
  ~s#'me th'#([~nv#a#, ~nv#b#]) {},
  ~k#get# ~nf#v#() {~k#return# ~k#this#.~na#_v#},
  ~k#set# ~nf#v#(~nv#value#) {~k#this#.~na#_v# ~o#=#  ~nx#value#},
  ~na#foo#: ~kd#function#() {}
};`);
    });

    test("AssignmentExpression", ()=>{
      assert.equals(markupBody(() => {
        v.a += 4;
      }), `
~nx#v#.~na#a# ~o#+=# ~m#4#;`);
    });

    test("FunctionDeclaration NewExpression", ()=>{
      const code = () => {
        function Foo(a) {
          return typeof a;
        };
        new Foo(...[1,2]);
      };

      assert.equals(markupBody(code),
                    `
~kd#function# ~nf#Foo#(~nv#a#) {
  ~k#return# ~o#typeof# ~nx#a#;
};
~k#new# ~nx#Foo#(~k#...#[~m#1#,~m#2#]);`);
    });
  });

  const assertMarkup = (func, exp)=>{
    const ans = markupBody(func);
    assert.elide(() => {assert.equals(ans, exp)});
  };

  const markupBody = func => {
    const code = func.toString();
    return markup(jsParser.highlight(jsParser.indent(
      code.slice(code.indexOf('\n')+1, code.lastIndexOf('\n'))
    )));
  };

  const markup = node => '\n'+norm(node.outerHTML).replace(/^<div.*?>/, '').slice(0, -6);

  const norm = text => text.replace(/<span class="(..?)">/g, '~$1#')
      .replace(/<\/span>/g, '#');
});
