isServer && define(function (require, exports, module) {
  var test, v;
  const Dom       = require('koru/dom');
  const api       = require('koru/test/api');
  const apiToHtml = require('./api-to-html');
  const TH        = require('./main');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "markdown": {
      // "test simple text"() {
      //   const div = document.createElement('div');
      //   apiToHtml.markdown(div, 'hello');
      //   apiToHtml.markdown(div, 'world');
      //   apiToHtml.markdown(div, ' *bold*');
      //   apiToHtml.markdown(div, '.\n');
      //   apiToHtml.markdown(div, 'nlBefore');
      //   assert.equals(div.outerHTML, '<div>helloworld <em>bold</em>. nlBefore</div>');

      // },

      // "test list"() {
      //   const div = document.createElement('div');
      //   apiToHtml.markdown(div, ' before\n\n* one\n* two');
      //   assert.equals(div.outerHTML, '<div> before\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n</div>');
      // },
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
