isServer && define(function (require, exports, module) {
  const TH       = require('koru/test');

  const jsParser = require('./js-parser');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test extractParams"() {
      assert.equals(jsParser.extractParams('x() {}'),
                    []);

      assert.equals(jsParser.extractParams('(...args)'),
                    ['args']);

      assert.equals(jsParser.extractParams('(a, b) => {/*...*/}'),
                    ['a', 'b']);

      assert.equals(jsParser.extractParams('(a, b) =>'),
                    ['a', 'b']);

      assert.equals(jsParser.extractParams('x(a, b) {return {a: (a + b)}}'),
                    ['a', 'b']);

      assert.equals(jsParser.extractParams('function x(a, b)'),
                    ['a', 'b']);

      assert.equals(jsParser.extractParams('function (a, b)'),
                    ['a', 'b']);


      assert.equals(jsParser.extractParams('x({a: {aa: d=123}}, [b, c=d*2], ...rest)'),
                    ['d', 'b', 'c', 'rest']);
    },

    "test comments"() {
      assert.equals(markupBody(() => {
        v.example(() => {
          // start-com
          v.define(/*in-com*/'red', '#f00'); // end-and-start-com
          v.define('blue', '#00f');
        }); //last
      }), `
~nx#v#.~na#example#(() ~o#=&gt;# {
  ~cs#// start-com#
  ~nx#v#.~na#define#( ~cm#/*in-com*/#~s#'red'#, ~s#'#f00'#); ~cs#// end-and-start-com#
  ~nx#v#.~na#define#(~s#'blue'#, ~s#'#00f'#);
}); ~cs#//last#`);
    },

    "test AssignmentPattern"() {
      const code = () => {
        var a = '1' + 2;
      };

      assert.equals(markupBody(code), `
~kd#var# ~nx#a# = ~s#'1'# ~o#+# ~m#2#;`);
    },

    "test ExpressionStatement"() {
      const anon = function (a) {
        return typeof a;
      };

      assert.equals(markup(jsParser.highlight('1|'+anon.toString())), `
~m#1# ~o#|# ~kd#function# (~nx#a#) {
  ~k#return# ~o#typeof# ~nx#a#;
};`);

    },

    "test ArrowFunctionExpression"() {
      assert.equals(markupBody(() => {
        var a = (z) => z[1].d;
      }), `
~kd#var# ~nx#a# = ~nx#z# ~o#=&gt;# ~nx#z#[~m#1#].~na#d#;`);
    },

    "test ClassDeclaration"() {
      assert.equals(markupBody(() => {
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
        }
      }), `
~k#class# ~nx#A# ~k#extends# ~nx#v#(~m#5#) {
  ~k#constructor#(~nx#a#) {
    ~k#super#(~nx#a#);
  }

  ~k#static# ~nf#cm#() {}

  ~nf#meth#(~nx#b#) {
    ~k#super#.~na#meth#(~nx#b#);
  }
}

~k#class# ~nx#B# {}`);

    },

    "test ClassExpression"() {
      assert.equals(markupBody(() => {
        const A = class extends v(5) {
          static cm() {}
        };
      }), `
~kd#const# ~nx#A# = ~k#class# ~k#extends# ~nx#v#(~m#5#) {
  ~k#static# ~nf#cm#() {}
};`);

    },

    "test CallExpression, MemberExpression"() {
      assert.equals(markupBody(() => {
        v.foo();
      }), `
~nx#v#.~na#foo#();`);
    },

    "test Destructuring"() {
      assert.equals(markupBody(() => {
        var { sh, lhs: { op: b }, rhs: c } = v;
      }), `
~kd#var# { ~nx#sh#, ~na#lhs#: { ~na#op#: ~nx#b# }, ~na#rhs#: ~nx#c# } = ~nx#v#;`);
    },

    "test ObjectExpression"() {
      assert.equals(markupBody(() => {
        v = {
          a: 1,
          v,
          'string': null,
          ['a'+v.x]: "z",
          'meth'([a, b]) {},
          get v() {return this._v},
          set v(value) {this._v =  value},
          foo: function() {}
        };
      }), `
~nx#v# ~o#=# {
  ~na#a#: ~m#1#,
  ~nx#v#,
  ~na#'string'#: ~kc#null#,
  [~s#'a'# ~o#+# ~nx#v#.~na#x#]: ~s#\"z\"#,
  ~nf#'meth'#([~nx#a#, ~nx#b#]) {},
  ~k#get# ~nf#v#() {
    ~k#return# ~k#this#.~na#_v#;
  },
  ~k#set# ~nf#v#(~nx#value#) {
    ~k#this#.~na#_v# ~o#=# ~nx#value#;
  },
  ~na#foo#: ~kd#function# () {}
};`);
    },

    "test AssignmentExpression"() {
      assert.equals(markupBody(() => {
        v.a += 4;
      }), `
~nx#v#.~na#a# ~o#+=# ~m#4#;`);
    },

    "test FunctionDeclaration NewExpression"() {
      const code = () => {
        function Foo(a) {
          return typeof a;
        };
        new Foo(...[1,2]);
      };

      assert.equals(markupBody(code),
                    `
~kd#function# ~nx#Foo#(~nx#a#) {
  ~k#return# ~o#typeof# ~nx#a#;
};
~k#new# ~nx#Foo#(~k#...#[~m#1#, ~m#2#]);`);
    },
  });

  function markupBody(func) {
    return markup(jsParser.highlight(jsParser.funcBody(func)));
  }

  function markup(node) {
    return '\n'+norm(node.outerHTML).replace(/^<div[^>]*>/, '').slice(0, -6);
  }

  function norm(text) {
    return text.replace(/<span class="(..?)">/g, '~$1#')
      .replace(/<\/span>/g, '#');
  }
});
