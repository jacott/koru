isServer && define(function (require, exports, module) {
  var test, v;
  const Dom       = require('koru/dom');
  const api       = require('koru/test/api');
  const apiToHtml = require('./api-to-html');
  const TH        = require('./main');

  const sourceHtml = Dom.h({div: [{'$data-api': 'header'},
                                  {'$data-api': 'links'},
                                  {'$data-api': 'pages'}]}).outerHTML;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test properties"() {
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
      const properties = Dom.html(html).getElementsByClassName('jsdoc-properties');

      assert.equals(Dom.htmlToJson(properties[0]).div, [
        {h5: 'Properties'},
        {table: {tbody: [
          {tr: [
            {td: '_id'},
            {td: {a: 'string', $href: TH.match(/mozilla.*String/)}},
            {class: 'jsdoc-info', '$data-env': 'server',
             td: {class: 'jsdoc-value', code: '"id-value"'}},
          ]},
          {tr: [
            {td: 'singleton'},
            {td: {a: 'mod', $href: '#my/mod'}},
            {class: 'jsdoc-info', '$data-env': 'server', td: {div: [
              {p: [
                'prints ',
                {class: 'jsdoc-value', code: '{my:singleton}'},
              ]},
              '\n'
            ]}},
          ]},
        ]}},
      ]);
    },

    "requireLine": {
      "test simple"() {
        const json = {
          'my/mod': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);
        const result = Dom.html(html).getElementsByClassName('jsdoc-require')[0].textContent;

        assert.equals(result, 'const MyMod = require('+
                      '"my/mod");'); // stop yaajs thinking it's a require
      },

      "test property subject"() {
        const json = {
          'my/mod.m1': {
            subject: {name: 'MyMod', ids: [], abstracts: [],},
            methods: {m1: {sig: 'm1(a)', calls: [[[1]]],}},
          }
        };

        const html = apiToHtml('Foo', json, sourceHtml);
        const result = Dom.html(html).getElementsByClassName('jsdoc-require')[0];

        assert.equals(result.textContent, 'const MyMod = require('+
                      '"my/mod").m1;');

        assert.equals(Dom.htmlToJson(result).div.length, 12);
      },

      "test :: subject no initExample"() {
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

        let meth = Dom.html(html).getElementsByClassName('jsdoc-example')[0];
        let req = meth.childNodes[0];

        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);

        let pmeth = Dom.html(html).getElementsByClassName('jsdoc-inst-init')[0];
        assert.equals(pmeth.textContent, 'const m1 = new M1();');

        req = pmeth.parentNode.childNodes[0];

        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);
      },

      "test :: subject with initExample"() {
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

        let meth = Dom.html(html).getElementsByClassName('jsdoc-example')[0];

        let req = meth.childNodes[0];
        assert.equals(req.textContent, 'const MyMod = req'+'uire("my/mod");');
        assert.equals(Dom.htmlToJson(req).div.length, 10);

        let ex = meth.childNodes[1];
        assert.equals(ex.textContent, 'const myM1 = MyMod.Foo();');
        assert.className(ex, 'highlight jsdoc-init');

        let pmeth = Dom.html(html).getElementsByClassName('jsdoc-inst-init')[0];
        assert.equals(pmeth.textContent, 'const m1Inst = myM1.instance();');

      },
    },

    "jsdocToHtml": {
      "test list"() {
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
      },

      "test {#module/link}"() {
        function abstract() {
          /**
           * Abstract
           *
           * See {#my/module} {#my/module.method}
           * {#my/mod#protoMethod} {#.thisModMethod}
           * {##thisModeProtoMethod}
           **/
        }

        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module', parent: {
            'my/module': {subject: {name: 'Module'}}
          }},
          api._docComment(abstract),
          {}
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: 'Abstract'}, '\n',
            {p: [
              'See ',
              {a: 'Module', class: 'jsdoc-link', $href: '#my/module'},
              ' ',
              {a: 'Module.method', class: 'jsdoc-link', $href: '#my/module.method'},
              '\n', {a: 'mod#protoMethod', class: 'jsdoc-link',
                     $href: '#my/mod#protoMethod'}
              , ' ',
              {a: '.thisModMethod', class: 'jsdoc-link',
               $href: '#this/module.thisModMethod'},
              '\n',
              {a: '#thisModeProtoMethod', class: 'jsdoc-link',
               $href: '#this/module#thisModeProtoMethod'}]},
            '\n'
          ]});
      },

      "test config"() {
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
                {a: 'module', class: 'jsdoc-link', $href: '#this/module'}
              ]}, '\n',
            ]});
            return true;
          })}
        });

      },

      "test normal link"() {
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
            {p: ['A ', {a: 'normal', $href: '#link'}, ' link']},
            '\n'
          ]});
      },
    },
  });
});
