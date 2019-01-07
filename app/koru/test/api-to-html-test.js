isServer && define((require, exports, module)=>{
  const Dom             = require('koru/dom');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./main');

  const {private$} = require('koru/symbols');

  const apiToHtml = require('./api-to-html');

  const {stub, spy, onEnd, match: m} = TH;

  const sourceHtml = Dom.h({div: [{'$data-api': 'header'},
                                  {'$data-api': 'links'},
                                  {'$data-api': 'pages'}]}).outerHTML;

  const {parent$} = apiToHtml[private$];

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("P Value", ()=>{
      const json = {
        'my/mod': {
          subject: {name: 'MyMod', ids: [], abstracts: [],},
          methods: {
            m1: {
              sig: 'm1(options)',
              intro: `
m1 intro
@param options.a opta doc,
`,
              calls: [[[["P", {b: 123}]
                       ]],
                      [[["P", {a: ["M", 'koru/test/api'], b: ['U', 'undefined']}]
                       ]]],
            }
          }
        }
      };

      const html = apiToHtml('Foo', json, sourceHtml);
      const result = Dom.htmlToJson(Dom.textToHtml(html).getElementsByClassName('jsdoc-arg')[0]).tr;

      assert.equals(result, [
        {td: 'options.a'},
        {td: {href: '#koru/test/api', a: ['api']}},
        {class: 'jsdoc-info', td: m(o => /opta doc/.test(util.inspect(o)))}
      ]);

    });

    test("properties", ()=>{
      const json = {
        'my/mod': {
          subject: {name: 'MyMod', ids: [], abstracts: [],},
          properties: {
            singleton: {
              value: ["Oi", "{my:singleton}", 'my/mod'],
              "info": "prints ${value}"
            },
            _id: {value: 'id-value'},
          }
        }
      };

      const html = apiToHtml('Foo', json, sourceHtml);
      const properties = Dom.textToHtml(html).getElementsByClassName('jsdoc-properties');

      assert.equals(Dom.htmlToJson(properties[0]).div, [
        {h1: 'Properties'},
        {table: {tbody: [
          {tr: [
            {class: "searchable", td: '_id'},
            {td: {a: ['string'], href: TH.match(/mozilla.*String/), target: '_blank'}},
            {class: 'jsdoc-info', 'data-env': 'server',
             td: {class: 'jsdoc-value', code: '"id-value"'}},
          ]},
          {tr: [
            {class: "searchable", td: 'singleton'},
            {td: {a: ['mod'], href: '#my/mod'}},
            {class: 'jsdoc-info', 'data-env': 'server', td: {div: [
              {p: [
                'prints ',
                {class: 'jsdoc-value', code: '{my:singleton}'},
              ]},
              '\n'
            ]}},
          ]},
        ]}},
      ]);
    });

    group("requireLine", ()=>{
      test("simple", ()=>{
        const json = {
          'my/mod': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);
        const result = Dom.textToHtml(html).getElementsByClassName('jsdoc-require')[0].textContent;

        assert.equals(result, 'const MyMod = require('+
                      '"my/mod");'); // stop yaajs thinking it's a require
      });

      test("property subject", ()=>{
        const json = {
          'my/mod.m1': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);
        const result = Dom.textToHtml(html).getElementsByClassName('jsdoc-require')[0];

        assert.equals(result.textContent, 'const MyMod = require('+
                      '"my/mod").m1;');

        assert.equals(Dom.htmlToJson(result).div.length, 12);
      });

      test(":: subject no initExample", ()=>{
        const json = {
          'my/mod': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
          },
          'my/mod::m1': {
            subject: {name: 'M1', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
            protoMethods: {i1: {sig: 'i1()', calls: [[[]]]}}
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);

        let meth = Dom.textToHtml(html).getElementsByClassName('jsdoc-example')[0];
        let req = meth.childNodes[0];

        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);

        let pmeth = Dom.textToHtml(html).getElementsByClassName('jsdoc-inst-init')[0];
        assert.equals(pmeth.textContent, 'const m1 = new M1();');

        req = pmeth.parentNode.childNodes[0];

        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);
      });

      test(":: subject with initExample", ()=>{
        const json = {
          'my/mod': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
          },
          'my/mod::m1': {
            initExample: 'const myM1 = MyMod.Foo();',
            initInstExample: 'const m1Inst = myM1.instance();',
            subject: {name: 'M1', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
            protoMethods: {i1: {sig: 'i1()', calls: [[[]]]}}
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);

        let meth = Dom.textToHtml(html).getElementsByClassName('jsdoc-example')[0];

        let req = meth.childNodes[0];
        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);

        let ex = meth.childNodes[1];
        assert.equals(ex.textContent, 'const myM1 = MyMod.Foo();');
        assert.className(ex, 'highlight jsdoc-init');

        let pmeth = Dom.textToHtml(html).getElementsByClassName('jsdoc-inst-init')[0];
        assert.equals(pmeth.textContent, 'const m1Inst = myM1.instance();');

      });
    });

    group("jsdocToHtml", ()=>{
      test("list", ()=>{
        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          ' before\n\n* one\n* two',
          {});

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: ' before'}, '\n',
            {ul: ['\n', {li: 'one'}, '\n', {li: 'two'}, '\n']},
            '\n'
          ]});
      });

      test("escape {{", ()=>{
        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          '{{{topic:hello}}',
          {});

        assert.equals(Dom.htmlToJson(div), {div: [{p: '{{topic:hello}}'}, '\n']});
      });

      test("{{topic:name}}", ()=>{
        const json = {
          "koru/pubsub/main": {
            "id": "koru/pubsub/overview",
            "subject": {
              "name": "Overview",
              "abstract": "Some text\n{{topic:../publication:publishing a model}}\n"+
                "An external example {{example:../publication:publishing a model:2}}"
            },
          },
          "koru/pubsub/publication": {
            "id": "koru/pubsub/publication",
            "subject": {
              "name": "Publication",
              "abstract": ""
            },
            "methods": {},
            "protoMethods": {},
            "customMethods": {},
            "topics": {
              "publishing a model": {
                "test": "koru/pubsub/publication test publishing a model.",
                "intro": "text begin {{example:0}} more text {{example:1}} end text",
                "calls": [
                  {
                    "body": "class Book extends Publication {\n}\n",
                    "calls": []
                  },
                  {
                    "body": "Book.Union = class extends Publication.Union {}",
                    "calls": []
                  },
                  {
                    "body": "ExampleThree()",
                    "calls": []
                  },
                ]
              }
            },
          }
        };

        apiToHtml.makeTree(json);

        const api = json["koru/pubsub/main"];

        const abstractMap = {};
        const abstract = apiToHtml.jsdocToHtml(
          api, api.subject.abstract, abstractMap
        );

        assert.equals(Dom.htmlToJson(abstract), {
          div: [
            {p: 'Some text\n'},
            {p: [
              'text begin ', {
                class: 'jsdoc-example highlight',
                pre: {
                  class: 'highlight',
                  div: [
                    {class: 'k', span: 'class'}, ' ',
                    {class: 'nc', span: 'Book'}, ' ',
                    {class: 'k', span: 'extends'}, ' ', {class: 'nx', span: 'Publication'},
                    ' {\n}']}
              },
              ' more text ',
              {class: 'jsdoc-example highlight',
               pre: {
                 class: 'highlight', div: [
                   {class: 'nx', span: 'Book'}, '.',
                   {class: 'na', span: 'Union'}, ' ',
                   {class: 'o', span: '='}, ' ',
                   {class: 'k', span: 'class'}, ' ',
                   {class: 'k', span: 'extends'}, ' ',
                   {class: 'nx', span: 'Publication'}, '.',
                   {class: 'na', span: 'Union'}, ' {}'
                 ]}}, ' end text'
            ]},
            '\n\nAn external example ',
            {
              class: 'jsdoc-example highlight',
              pre: {
                class: 'highlight', div: [
                  {class: 'nx', span: 'ExampleThree'}, '()']
              }
            },
            {p: ''}, '\n'
          ]
        });
      });

      test("{#module/link}", ()=>{
        function abstract() {
          /**
           * Abstract
           *
           * See {#my/module} {#my/module.method}
           * {#my/mod#protoMethod} {#.thisModMethod}
           * {##thisModeProtoMethod}
           * {#../../thing}
           * {#./child}
           **/
        }

        const json = {
          'my/module': {subject: {name: 'Module'}},
          'this/start/module': {subject: {name: 'Other'}},
          'this/start/module/child': {subject: {name: 'Child'}},
          'this/thing': {subject: {name: 'Thing'}},
        };

        const tree = apiToHtml.makeTree(json);

        const div = apiToHtml.jsdocToHtml(
          json['this/start/module'],
          api._docComment(abstract),
          {}
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: 'Abstract'}, '\n',
            {p: [
              'See ',
              {a: ['Module'], class: 'jsdoc-link', href: '#my/module'},
              ' ',
              {a: ['Module.method'], class: 'jsdoc-link', href: '#my/module.method'},
              '\n', {a: ['mod#protoMethod'], class: 'jsdoc-link',
                     href: '#my/mod#protoMethod'}
              , ' ',
              {a: ['thisModMethod'], class: 'jsdoc-link',
               href: '#this/start/module.thisModMethod'},
              '\n',
              {a: ['thisModeProtoMethod'], class: 'jsdoc-link',
               href: '#this/start/module#thisModeProtoMethod'},
              '\n',
              {a: ['Thing'], class: 'jsdoc-link',
               href: '#this/thing'},
              '\n',
              {a: ['Child'], class: 'jsdoc-link',
               href: '#this/start/module/child'}]},
            '\n'
          ]});
      });

      test("@param", ()=>{
        const json = {
          "koru/test/api": {
            "id": "koru/test/api",
            "subject": {
              "name": "API",
              "abstract": "topAbstracr"
            },
            "methods": {
              "class": {
                "test": "koru/test/api test class.",
                "sig": "class(options)",
                "intro": "myAbs\n"+
                  "@param {string} [options.sig] sigParam\n"+
                  "@param {function|string} [options.intro] introParam\n"+
                  "@returns returnParam",
                "calls": [
                  {
                    "body": "theBody",
                    "calls": [
                      [[], ["O", "Book"]],
                      [[["P", {
                        "sig": "function Hobbit({name}) {}",
                        "intro": "It is a dangerous thing Frodo"}]],
                       ["O", "Book"]]
                    ]
                  }
                ]
              }
            },
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);
        const result = Dom.textToHtml(html);

        let found;
        Dom.walkNode(result, node =>{
          if (node.tagName === 'H1' && /Parameters/.test(node.textContent)) {
            Dom.walkNode(node.parentNode, node =>{
              if (node.tagName === 'TBODY') {
                found = node;
                return true;
              }
            });
            return true;
          }
        });

        const params = Dom.htmlToJson(found).tbody;

        const mozType = (type)=>({
          href: m(new RegExp("mozilla.*Global_Objects.*"+type)),
          target: '_blank', a: [type.toLowerCase()]});

        const aString = mozType('String');

        assert.equals(params[0], {
          class: 'jsdoc-arg',
          tr: [
            {td: '[options.sig]'},
            {td: aString},
            {class: 'jsdoc-info', td: {div: [{p: 'sigParam'}, '\n']}}
          ]});

        assert.equals(params[1], {
          class: 'jsdoc-arg',
          tr: [
            {td: '[options.intro]'},
            {td: [
              mozType("Function"),
              '\u200a/\u200a',
              aString,
            ]},
            {class: 'jsdoc-info', td: {div: [{p: 'introParam'}, '\n']}}
          ]});

        assert.equals(params[2], {
          class: 'jsdoc-method-returns',
          tr: [
            {td: {h1: 'Returns'}},
            {td: mozType("Object")},
            {class: 'jsdoc-info', td: {div: [{p: 'returnParam'}, '\n']}}
          ]});
      });

      test("@config", ()=>{
        function abstract() {
          /**
           * Abstract
           *
           * @config cfg1 markup {#this/module}
           **/
        }

        const apiMap = {};

        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          api._docComment(abstract),
          apiMap
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: 'Abstract'}, '\n',
          ]
        });

        assert.equals(apiMap, {
          ':config:': {cfg1: TH.match(html => {
            assert.equals(Dom.htmlToJson(html), {div: [
              {p: [
                'markup ',
                {a: ['module'], class: 'jsdoc-link', href: '#this/module'}
              ]}, '\n',
            ]});
            return true;
          })}
        });

      });

      test("@deprecated", ()=>{
        function abstract() {
          /**
           * Abstract
           *
           * @deprecated use {#this/module} instead
           **/
        }

        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          api._docComment(abstract),
          {}
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: 'Abstract'}, '\n',
            {class: 'jsdoc-deprecated', div: [
              {h1: 'Deprecated'},
              {p: ['use ', {class: 'jsdoc-link', href: '#this/module', a: ['module']}, ' instead']},
              "\n",
            ]},
          ]
        });
      });

      test("normal link", ()=>{
        function abstract() {
          /**
           * A [normal](#link) link
           **/
        }
        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          api._docComment(abstract),
          {}
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: ['A ', {a: ['normal'], href: '#link'}, ' link']},
            '\n'
          ]});
      });
    });
  });
});
