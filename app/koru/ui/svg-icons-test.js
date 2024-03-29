define((require, exports, module) => {
  /**
   * SvgIcons: is a helper for managing svg icons
   *
   * By convention the `document.body` contains an `svg` with a `defs` section which contains the
   * body of a list of icons. Each icon has a id which is prefixed by `"icon-"`; for example
   * `"icon-account"`. These defs are then used by a `use` element with an `xlink:href` to the id of
   * the icon required.
   **/
  'use strict';
  const Dom             = require('koru/dom');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, stubProperty} = TH;

  const SVGIcons = require('./svg-icons');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      document.body.textContent = '';
    });

    test('use', () => {
      /**
       * create a svg use element for an icon
       */
      api.method();
      //[
      const use = SVGIcons.use('hamburger-menu');

      assert.same(use.namespaceURI, Dom.SVGNS);
      assert.same(use.getAttributeNS(Dom.XLINKNS, 'href'), '#icon-hamburger-menu');
      //]
    });

    test('setIcon', () => {
      /**
       * set the icon in a svg use element
       */
      api.method();
      //[
      const use = SVGIcons.use('hamburger-menu');

      SVGIcons.setIcon(use, 'circle');

      assert.same(use.namespaceURI, Dom.SVGNS);
      assert.same(use.getAttributeNS(Dom.XLINKNS, 'href'), '#icon-circle');
      //]
    });

    test('createIcon', () => {
      /**
       * Create an svg element that uses a icon definition.
       *
       * Note: all icons should be drawn for use with a viewBox of "0 0 24 24"

       * @param icon the name of an icon to use. the `use` element `xlink:href` is set to
       * `"#icon-"+icon`.
       * @param [title] adds a title element to the SVG.
       **/
      api.method();
      //[
      document.body.appendChild(Dom.h({
        style: 'display:hidden',
        svg: {defs: {
          id: 'icon-hamburger-menu', viewBox: '0 0 24 24',
          symbol: {
            path: [],
            d: 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z',
          },
        }},
      }));
      const svg = SVGIcons.createIcon('hamburger-menu', 'Main menu');
      assert(svg.classList.contains('icon'));

      assert.same(svg.namespaceURI, Dom.SVGNS);

      assert.equals(svg.querySelector(':scope>title:first-child').textContent, 'Main menu');

      const use = svg.querySelector('use');
      assert.same(use.getAttributeNS(Dom.XLINKNS, 'href'), '#icon-hamburger-menu');
      //]
    });

    test('add', () => {
      /**
       * Add an svg to the asset library under id `"icon-"+id`.
       *
       * Note: all icons should be drawn for use with a viewBox of "0 0 24 24"

       * @param id the id of the icon. It will be prefixed with `"icon-"`.

       * @param symbol An `SVGSymbolElement` or an object to pass to {#koru/dom.html} as the
       * contents of a symbol. `id` will be set on the symbol.
       **/
      api.method();
      //[
      document.body.appendChild(Dom.h({
        id: 'SVGIcons',
        style: 'display:hidden',
        svg: {defs: []},
      }));
      const d = 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z';
      SVGIcons.add('hamburger-menu', {path: [], d});

      assert.dom('#SVGIcons>defs>symbol#icon-hamburger-menu', (sym) => {
        assert.same(sym.getAttribute('viewBox'), '0 0 24 24');
        assert.dom('path[d="' + d + '"]');
      });
      //]
    });

    test('selectMenuDecorator', () => {
      /**
       * selectMenuDecorator can be used as a `decorator` function option to
       * {#../select-menu.popup}. Any list item with a icon attribute will be given a svg icon with
       * a `<use xlink:href="#icon"+item.icon />` body.
       **/
      api.method();
      //[
      const name = document.createTextNode('Close');
      const li = Dom.h({li: [name]});
      const item = {id: 'close', name: 'Close', icon: 'close-outline'};

      SVGIcons.selectMenuDecorator(item, name);

      const svg = name.previousSibling;
      assert.same(svg.querySelector('use').getAttributeNS(Dom.XLINKNS, 'href'),
                  '#icon-close-outline');
      //]
    });

    test('helper svgIcon', () => {
      /**
       * `{{svgIcon "name" attributes...}}` inserts an svg into an html document. The icon is only built
       * once.
       *
       * ### Example
       * ```html
       * <button>{{svgIcon "person_add" class="addUser"}}<span>Add user</span></button>
       * ```

       * @param name the name of the icon to use (See {#.use})

       * @param attributes name/value pairs to set as attributes on the svg
       **/
      api.customIntercept(Dom._helpers, {name: 'svgIcon', sig: 'DomHelper:'});

      let isElement = false;
      const current = {
        isElement: () => isElement,
      };
      stubProperty(Dom, 'current', {value: current});

      document.body.appendChild(Dom._helpers.svgIcon('close', {class: 'svgClose'}));
      assert.dom('svg.svgClose', (svg) => {
        refute.className(svg, 'icon');
        assert.same(svg.querySelector('use').getAttributeNS(Dom.XLINKNS, 'href'), '#icon-close');
      });
    });
  });
});
