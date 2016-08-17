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
        assert.className(ex, 'highlight jsdoc-init');
        assert.equals(ex.textContent, 'const myM1 = MyMod.Foo();');

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

      "test @module link"() {
        function abstract() {
          /**
           * Abstract
           *
           * See {@module my/module}
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
            {p: ['See ', {a: 'my/module', class: 'jsdoc-idLink', $href: '#my/module'}]},
            '\n'
          ]});
      },

      "test <param>"() {
        function abstract() {
          /**
           * I handle <params> too.
           **/
        }
        const div = apiToHtml.jsdocToHtml(
          {id: 'this/module'},
          api._docComment(abstract),
          {}
        );

        assert.equals(Dom.htmlToJson(div), {
          div: [
            {p: ['I handle ', {span: 'params', class: 'jsdoc-param'}, ' too.']},
            '\n'
          ]});
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
