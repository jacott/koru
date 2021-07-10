isClient && define((require, exports, module) => {
  'use strict';
  /**
   * Automatically manage a list of Elements matching a {#koru/model/query}.

   * The list observers changes in the query model and updates the list accordingly.
   **/
  const Dom             = require('koru/dom');
  const Ctx             = require('koru/dom/ctx');
  const Template        = require('koru/dom/template');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const Model           = require('koru/model');
  const TH              = require('koru/model/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, match: m} = TH;
  const {endMarker$, private$} = require('koru/symbols');

  const AutoList = require('./auto-list');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    class Book extends Model.BaseModel {
    }
    const createBook = (i, opts) =>
          Book.create(Object.assign({_id: 'b'+i, title: 'b'+i, pageCount: i*100}, opts));

    const createBooks = (...args) => args.map((i) => createBook(i));

    const Row = Dom.newTemplate(TemplateCompiler.toJavascript(
      `<div>{{title}}</div>`, 'Book').toJson());

    before(() => {
      Book.define({
        name: 'Book',
        fields: {title: 'text', pageCount: 'number'}
      });
    });

    after(() => {
      Model._destroyModel('Book', 'drop');
    });

    beforeEach(() => {
    });

    afterEach(() => {
      Book.docs = void 0;
      Dom.removeChildren(document.body);
      Dom.tpl.Book = void 0;
    });

    test('constructor', () => {
      /**
       * Build a new AutoList
       *
       * @param template to render each row

       * @param container to render into. Can be a start `Comment` node with symbol `endMarker$`
       * (see {#koru/symbols}) pointing to end `Comment` in which case the rows will be rendered
       * between the comments.

       * @param [query] A {#koru/model/query} or at least has methods `compare` and `forEach`. The
       * method `onChange` will be used to auto-update the list if present.

       * @param [limit] maximum number of elements to show. (see `limit` property)

       * @param [compare] function to order data. Defaults to `query.compare` or if no query then
       * order items are added

       * @param [compareKeys] Array of keys used for ordering data. Defaults to
       * `compare.compareKeys`

       * @param [observeUpdates] The list can be monitored for changes by passing an
       * `observeUpdates` function which is called for each change with the arguments `(list, doc,
       * action)` where:

       * @param [removeElement] Method used to remove an element. Defaults to
       * {#koru/dom-client.remove}

       * @param [parentCtx] The {#koru/dom/ctx} to use for rendering elements. Defaults to the
       * current context.

       * * `list` is this `AutoList`

       * * `doc` is the document being added, changed, or removed

       * * `action` is `added`, `changed` or `removed`

       **/
      const AutoList = api.class();

      //[
      const book1 = Book.create({title: 'The Eye of the World'});
      const book2 = Book.create({title: 'The Great Hunt'});

      const container = Dom.h({});
      const list = new AutoList({query: Book.query.sort('title'), template: Row, container});

      assert.dom(container, () => {
        assert.dom(':first-child', 'The Eye of the World');
        assert.dom(':last-child', 'The Great Hunt');
      });
      //]
    });

    test('no query and addOrder', () => {
      const container = document.body;
      const list = new AutoList({
        template: {$autoRender(data) {
          const elm = Dom.h({div: [''+data.n, {input: []}]});
          Dom.setCtx(elm);
          return elm;
        }},
        container,
      });

      const doc1 = {n: 'doc1'};
      const doc2 = {n: 'doc2'};

      assert.dom(container, () => {
        refute.dom(':first-child');
        list.updateEntry(doc2);
        list.updateEntry(doc1);
        assert.same(list.thisNode(doc1).value, 2);
        assert.same(list.thisNode(doc2).value, 1);
        assert.dom(':last-child', 'doc1');

        const doc2Elm = list.elm(doc2);
        assert.dom(':first-child', 'doc2', (elm) => {
          assert.same(elm, doc2Elm);
          elm.lastChild.focus();
          assert.same(document.activeElement, elm.lastChild);
        });
        doc2.n = 'doc2.change';
        list.updateEntry(doc2);
        assert.dom(':first-child', 'doc2', (elm) => {
          assert.same(elm, doc2Elm);
          assert.same(document.activeElement, elm.lastChild);
        });

        list.updateEntry(doc2, 'remove');
        assert.dom('div', {count: 1});

        list.updateEntry(doc2);
        assert.dom(':last-child', 'doc2.change');
        assert.same(list.thisNode(doc2).value, 3);
      });
    });

    test('basic arguments', () => {
      const container = Dom.h({});
      new AutoList({
        query: {forEach(func) {func({n: 2}), func({n: 1})}},
        template: {$autoRender(data) {return Dom.h({div: ''+data.n})}},
        container,
        compare({n:a},{n:b}) {return a == b ? 0 : a < b ? -1 : 1},
        compareKeys: ['n']
      });

      assert.dom(container, () => {
        assert.dom(':first-child', '1');
        assert.dom(':last-child', '2');
      });
    });

    test('observeUpdates', () => {
      const container = Dom.h({});

      const observeUpdates = stub();

      createBook(2); createBook(3);

      const list = new AutoList({
        query: Book.where((b) => b.title < 'b7').sort('title'), template: Row, container,
        observeUpdates,
      });

      const book1 = createBook(1);

      assert.calledOnceWith(observeUpdates, list, book1, 'added');
      observeUpdates.reset();

      book1.$update('pageCount', 700);

      assert.calledWith(observeUpdates, list, book1, 'changed');
      observeUpdates.reset();

      book1.$update('title', 'b9');

      assert.calledWith(observeUpdates, list, m.model(book1), 'removed');
    });

    test('changeOptions', () => {
      /**
       * Rebuild list based on a different options. It trys to preserve DOM elements where possible.

       * @param updateAllTags call updateAllTags on each element that is already rendered. Defaults
       * to `false`
       **/
      api.protoMethod('changeOptions');

      //[
      const book1 = Book.create({title: 'The Eye of the World', pageCount: 782});
      const book2 = Book.create({title: 'The Great Hunt', pageCount: 681});

      const container = Dom.h({});
      let query = Book.query.sort('title');
      const list = new AutoList({query, template: Row, container});

      assert.equals(list.query, query);

      assert.dom(container, () => {
        let book1Elm;
        assert.dom(':first-child', {data: m.model(book1)}, (elm) => {
          book1Elm = elm;
        });

        list.changeOptions({query: Book.where((d) => ! /Shadow/.test(d.title)).sort('pageCount')});

        assert.dom(':first-child', 'The Great Hunt');
        assert.dom(':last-child', 'The Eye of the World', (elm) => {
          assert.same(elm, book1Elm);
        });

        Book.create({title: 'The Fires of Heaven', pageCount: 963});
        assert.dom(':last-child', 'The Fires of Heaven'); // reverse sort

        const b4 = Book.create({title: 'The Shadow Rising', pageCount: 1001});
        refute(list.elm(b4)); // filtered out
      });
      //]
    });

    test('updateEntry', () => {
      /**
       * Explicitly update an entry in the list. This method is called automatically when the
       * query.onChange callback is is used; i.e. when an entry is changed.
       *
       * If `observeUpdates` is set then it is called after the update.

       * @param doc the entry to update

       * @param action if value is `"remove"` then remove entry

       **/
      api.protoMethod('updateEntry');

      //[
      const container = Dom.h({});

      const observeUpdates = stub();
      const list = new AutoList({
        template: Row, container,
        query: {
          forEach() {},
        },
        compare: util.compareByField('title'),
        observeUpdates,
      });
      assert.dom(container, () => {
        const b1 = {_id: 'b1', title: 'Book 1'}, b2 = {_id: 'b1', title: 'Book 2'};
        list.updateEntry(b1);
        list.updateEntry(b2);
        assert.dom('div:last-child', 'Book 2');
        b2.title = 'A book 2';
        list.updateEntry(b2);
        assert.dom('div:first-child', 'A book 2');

        assert.calledWith(observeUpdates, list, b1, 'added');
        assert.calledWith(observeUpdates, list, b2, 'added');
        assert.calledWith(observeUpdates, list, b2, 'changed');

        list.updateEntry(b1, 'remove');
        assert.dom('div', {count: 1});
        assert.calledWith(observeUpdates, list, b1, 'removed');
      });
      //]
    });

    test('nodeElm', () => {
      /**
       * Return the elm for a node.

       * @param [force] if set to `"render"` then raise the limit in order for node to be visible
       **/
      api.protoMethod();

      const container = Dom.h({});
      const parentCtx = Dom.setCtx(container, new Dom.Ctx());
      const list = new AutoList({
        query: Book.where((n) => n.title !== 'b2').sort('title'),
        template: Row, container, limit: 1, parentCtx});

      createBook(1);
      createBook(2);
      createBook(3);

      const {entries} = list;

      assert.same(list.nodeElm(entries.firstNode), container.firstChild);
      assert.same(list.nodeElm(entries.lastNode), null);
      assert.same(list.nodeElm(entries.lastNode, 'render'), container.lastChild);
    });

    test('elm', () => {
      /**
       * Return the elm for a document.

       * @param [force] if set to `"render"` then raise the limit in order for node to be visible
       **/
      api.protoMethod();
      const container = Dom.h({});
      const parentCtx = Dom.setCtx(container, new Dom.Ctx());
      //[
      const list = new AutoList({
        query: Book.where((n) => n.title !== 'b2').sort('title'),
        template: Row, container, limit: 1, parentCtx});

      const [book1, book2, book3] = createBooks(1,2,3);

      assert.same(list.elm(book1), container.firstChild);
      assert.same(Dom.myCtx(list.elm(book1)).parentCtx, parentCtx);
      assert.same(list.elm(book2), null);
      assert.same(list.elm(book3), null);
      assert.same(list.elm(null), null);
      book1.$remove();

      assert(list.elm(book3));
      book3.title = 'b2'; // we haved taged this doc so we know we have it
      assert(list.elm({title: 'b3', _id: book3._id}));
      refute(list.elm({title: 'b2', _id: book3._id}));
      assert(list.elm(book3));
      //]

      const [book4, book5] = createBooks(4,5);

      assert.same(list.elm(book5), null);
      assert.same(list.elm(book5, 'render'), container.lastChild);
      assert.same(list.limit, 3);
    });

    test('thisNode', () => {
      /**
       * Return the {#koru/btree} node associated with this instance of `doc`

       * @param doc a document that might be in the list

       * @returns the node associated with this list and document; otherwise undefined
       **/
      api.protoMethod();
      const container = Dom.h({});
      const parentCtx = Dom.setCtx(container, new Dom.Ctx());
      //[
      const list = new AutoList({
        query: Book.where((n) => n.title !== 'b2').sort('title'),
        template: Row, container, limit: 1, parentCtx});

      const [book1, book2] = createBooks(1,2);

      assert.equals(list.thisNode(book1).value, {title: 'b1', _id: 'b1'});
      assert.same(list.thisNode(new Book()), void 0);
      //]
    });

    test('thisElm', () => {
      /**
       * Return element associated with this instance of `doc`

       * @param doc a document that might be in the list

       * @returns the element associated with this list and document; otherwise null
       **/
      api.protoMethod();
      const container = Dom.h({});
      const parentCtx = Dom.setCtx(container, new Dom.Ctx());
      //[
      const list = new AutoList({
        query: Book.where((n) => n.title !== 'b2').sort('title'),
        template: Row, container, limit: 1, parentCtx});

      const [book1, book2] = createBooks(1,2);

      assert.equals(list.thisElm(book1).textContent, 'b1');
      assert.same(list.thisElm(book2), null);
      //]
    });

    test('limit', () => {
      /**
       * A limit of `n` can be given to only display the first (ordered) `n` entries.
       *
       * When visible entries are removed non-visible entries are added to keep list length at `n`
       * when `n` or more rows still match the query. Defaults to `Infinity`
       **/
      api.protoProperty('limit');

      const container = Dom.h({});

      createBook(1); createBook(2); createBook(3);

      const list = new AutoList({
        query: Book.query.sort('title'), template: Row, container, limit: 2});

      assert.same(container.children.length, 2);

      list.limit = 3;
      assert.equals(list.limit, 3);
      assert.same(container.children.length, 3);

      list.limit = 2;
      assert.equals(list.limit, 2);
      assert.same(container.children.length, 2);
    });

    group('limits', () => {
      let newList, overLimit;

      const assertVisible = (list, shown, hidden=[]) => {assert.elide(() => {
        let bad = 0, elm;
        let exp = (n) => n;

        const {container} = list[private$];

        const check = (n) => (
          bad = n,
          elm = list.elm(Book.findById('b'+n)),
          exp(elm) && (elm == null || elm.parentNode == container)
        );
        assert(shown.every(check), `book b${bad} not shown`);
        exp = (n) => ! n;
        assert(hidden.every(check), `book b${bad} not hidden`);
        assert.equals(Array.from(list.entries).map(
          (n) => +n.title.slice(1)), shown.concat(hidden));
      })};

      beforeEach(() => {
        for(let i = 1; i < 6; ++i) createBook(i);

        const container = Dom.h({});
        newList = (limit) => {
          return new AutoList({
            query: Book.query.sort('pageCount', 'title'), template: Row, container, limit,
            overLimit: overLimit = stub(),
          });
        };
      });

      test('elm not rendered', () => {
        const list = newList(2);

        const book1 = Book.findById('b1');
        const book4 = Book.findById('b4');

        assert.same(list.elm(book4), null);

        assertVisible(list, [1,2], [3,4,5]);

        assert.dom(list.elm(book4, 'render'));
        assertVisible(list, [1,2,3,4], [5]);

        assert.same(list.limit, 4);
      });

      test('increase limit', () => {
        createBook(6);
        const list = newList(3);
        list.limit = 5;
        assertVisible(list, [1,2,3,4,5], [6]);

        list.limit = 10;
        assertVisible(list, [1,2,3,4,5,6]);
      });

      test('decrease limit', () => {
        const list = newList(3);
        assert.same(list.limit, 3);

        /** initial **/
        assertVisible(list, [1,2,3], [4,5]);

        assert.same(overLimit.callCount, 2);

        /** insert **/

        overLimit.reset();
        createBook(6, {pageCount: 150});
        assert.calledOnce(overLimit);

        assertVisible(list, [1,6,2], [3,4,5]);

        /** remove **/
        Book.findById('b1').$remove();
        assertVisible(list, [6,2,3], [4,5]);
        assert.calledOnce(overLimit);
      });

      test('remove last visible', () => {
        const list = newList(3);
        Book.findById('b3').$remove();
        assertVisible(list, [1,2,4], [5]);
      });

      test('remove all visible', () => {
        const list = newList(4);
        Book.findById('b3').$remove();
        Book.findById('b1').$remove();
        assertVisible(list, [2,4,5]);
      });

      test('remove invisible', () => {
        const list = newList(3);
        const book6 = createBook(6);
        const book7 = createBook(7);
        assertVisible(list, [1,2,3], [4,5,6,7]);

        book6.$remove();
        book7.$remove();
        createBook(2.5);

        assertVisible(list, [1,2,2.5], [3,4,5]);
      });

      test('last visible ticket value not important', () => {
        const list = newList(3);
        const book1 = Book.findById('b1');
        const book3 = Book.findById('b3');
        book3.pageCount = 50;
        createBook(6, {pageCount: book1.pageCount+5});

        book3.$reload();
        assertVisible(list, [1,6,2], [3,4,5]);
      });

      test('move up', () => {
        const list = newList(3);
        const book1 = Book.findById('b1');
        Book.findById('b5').$update('pageCount', book1.pageCount+5);
        assertVisible(list, [1,5,2], [3,4]);

        Book.findById('b2').$remove(); // check lastVis
        assertVisible(list, [1,5,3], [4]);
      });

      test('move down', () => {
        const list = newList(3);
        const book4 = Book.findById('b4');
        Book.findById('b2').$update('pageCount', book4.pageCount+7);
        assertVisible(list, [1,3,4], [2,5]);

        const book3 = Book.findById('b3');
        book3.$update('pageCount', book4.pageCount+3);
        assertVisible(list, [1,4,3], [2,5]);

        book3.$remove(); // check lastVis
        assertVisible(list, [1,4,2], [5]);
      });

      test('move within visible to visible', () => {
        const list = newList(3);
        const book1 = Book.findById('b1');
        const book2 = Book.findById('b2');
        const book3 = Book.findById('b3');
        book1.$update('pageCount', book2.pageCount+5);
        book2.$update('pageCount', book3.pageCount+5);
        assertVisible(list, [1,3,2], [4,5]);

        book2.$remove(); // check lastVis
        assertVisible(list, [1,3,4], [5]);
      });

      test('move lastVis to lastVis', () => {
        const list = newList(3);
        const book3 = Book.findById('b3');
        book3.$update('pageCount', book3.pageCount+.5);
        assertVisible(list, [1,2,3], [4,5]);
      });

      test('move within hidden to hidden', () => {
        const list = newList(2);
        assertVisible(list, [1,2], [3,4,5]);
        const book2 = Book.findById('b2'), book3 = Book.findById('b3');
        const book4 = Book.findById('b4'), book5 = Book.findById('b5');
        book4.$update('pageCount', book5.pageCount+10);
        book3.$update('pageCount', book5.pageCount+5);
        assertVisible(list, [1,2], [5,3,4]);

        book2.$remove(); // check lastVis
        assertVisible(list, [1,5], [3,4]);
      });

      test('move last visible up', () => {
        const list = newList(3);
        const book1 = Book.findById('b1');
        Book.findById('b3').$update('pageCount', book1.pageCount-5); // move away from t2
        assertVisible(list, [3,1,2], [4,5]);

        Book.findById('b2').$remove(); // check lastVis
        assertVisible(list, [3,1,4], [5]);
      });

      test('move last visible, last node up', () => {
        const list = newList(5);
        const book1 = Book.findById('b1');
        const book3 = Book.findById('b3');
        Book.findById('b5').$update('pageCount', book3.pageCount-5); // move away from t2
        assertVisible(list, [1,2,5,3,4]);

        createBook(6, {pageCount: book1.pageCount+5});
        assertVisible(list, [1,6,2,5,3], [4]);
      });

      test('move last visible to last', () => {
        const list = newList(3);
        Book.findById('b3').$update('pageCount', Book.findById('b5').pageCount+5);
        assertVisible(list, [1,2,4], [5,3]);

        Book.findById('b4').$remove(); // check lastVis
        assertVisible(list, [1,2,5], [3]);
      });

      test('move last visible down', () => {
        const list = newList(3);
        const book4 = Book.findById('b4');
        Book.findById('b3').$update('pageCount', book4.pageCount+5);
        assertVisible(list, [1,2,4], [3,5]);

        book4.$remove(); // check lastVis
        assertVisible(list, [1,2,3], [5]);
      });

      test('append', () => {
        const list = newList(3);
        createBook(6);
        assertVisible(list, [1,2,3], [4,5,6]);
      });

      test('delete last visible', () => {
        const list = newList(5);
        Book.findById('b5').$remove();
        assertVisible(list, [1,2,3,4]);
      });
    });

    test('comment with changeOptions', () => {
      const container = Dom.h({div: [
        'before', {$comment$: 'start'}, {$comment$: 'end'}, 'after',
      ]});

      const startComment = container.childNodes[1];
      startComment[endMarker$] = container.childNodes[2];

      createBook(1); createBook(2, {pageCount: 1000}); createBook(3);

      const list = new AutoList({
        query: Book.query.sort('title'), template: Row, container: startComment});

      assert.equals(util.map(
        container.childNodes, (n) => `${n.nodeType}:${n.data || n.textContent}`),
                    ['3:before', '8:start', '1:b1', '1:b2', '1:b3', '8:end', '3:after']);

      list.changeOptions({query: Book.where('pageCount', 1000).sort('title')});

      assert.equals(util.map(
        container.childNodes, (n) => `${n.nodeType}:${n.data || n.textContent}`),
                    ['3:before', '8:start', '1:b2', '8:end', '3:after']);
    });

    test('updateAllTags with changeOptions', () => {
      api.protoMethod('changeOptions');

      const book1 = createBook(1, {pageCount: 1000}), book2 = createBook(2);

      assert.dom(Dom.h({ul: ''}), (pn) => {
        const list = new AutoList({
          container: pn,
          template: Row,
          query: {
            forEach: (body) => {body(book1), body(book2)},
          },
          compare: util.compareByField('pageCount')
        });

        book1.title = 'b4';

        list.changeOptions({
          query: {
            forEach: (body) => {body(book1), body(book2)},
          },
          compare: util.compareByField('title')
        });

        assert.dom('div+div', 'b1');

        list.changeOptions({
          query: {
            forEach: (body) => {body(book1), body(book2)},
          },
          updateAllTags: true,
        });

        assert.dom('div+div', 'b4');
      });
    });

    test('start, end comment', () => {
      const AutoList = api.class();

      //[
      /** Using comment delimeters */

      const container = Dom.h({div: [
        'before', {$comment$: 'start'}, {$comment$: 'end'}, 'after',
      ]});

      const startComment = container.childNodes[1];
      startComment[endMarker$] = container.childNodes[2];

      const list = new AutoList({
        query: Book.query.sort('title'), template: Row, container: startComment});

      assert.dom(container, (pn) => {
        createBook(4);
        createBook(1);
        createBook(5);

        assert.equals(util.map(
          pn.childNodes, (n) => `${n.nodeType}:${n.data || n.textContent}`),
                      ['3:before', '8:start', '1:b1', '1:b4', '1:b5', '8:end', '3:after']);
      });
      //]
    });

    test('observing', () => {
      const [book1, book2, book3] = [1,2,3].map((i) => createBook(i));

      let query = Book.query.where((d) => d.title[0]==='b').sort('pageCount');
      const container = Dom.h({});
      const list = new AutoList({query, template: Row, container});

      const mapEntries = (_) => Array.from(list.entries).map((n) => Book.findById(n._id).title);

      assert.dom(container, (pn) => {
        assert.equals(mapEntries(), ['b1', 'b2', 'b3']);

        const book4 = createBook(4, {pageCount: 50});

        assert.dom(':first-child', 'b4');
        assert.dom(':nth-child(2)', 'b1');

        assert.equals(mapEntries(), ['b4', 'b1', 'b2', 'b3']);

        book2.$update('title', 'a2');
        refute.dom('div', 'a2');
        refute(list.elm(book2));
        assert.equals(mapEntries(), ['b4', 'b1', 'b3']);
        assert.dom(':nth-child(3)', 'b3');

        book4.$remove();
        refute.dom('div', 'b4');
        assert.dom(':first-child', 'b1');
        assert.equals(mapEntries(), ['b1', 'b3']);

        book2.$update({title: 'b2', pageCount: 150});
        assert.equals(mapEntries(), ['b1', 'b2', 'b3']);

        book3.$update('pageCount', 20);
        assert.equals(mapEntries(), ['b3', 'b1', 'b2']);

        assert.equals(util.map(pn.children, (n) => Dom.ctx(n).data.title),
                      ['b3', 'b1', 'b2']);

        book3.$update('title', 'b300');
        assert.dom(':first-child', 'b300');
      });
    });

    test('stop', () => {
      /**
       * Stop observing model changes.

       * Removing the container via {#koru/dom.remove} also stops observering model
       **/

      api.protoMethod('stop');
      const container = Dom.h({});
      Dom.setCtx(container, new Dom.Ctx());

      const person = {name: 'Frank', _id: 'a123'};

      const stop = stub();
      const list = new AutoList({query: {
        compare: util.compareByName,
        onChange: (_) => ({stop}),
        forEach: (body) => {body(person)},
      }, template: Row, container});

      spy(list, 'stop');

      const sym = Object.getOwnPropertySymbols(person)[0];
      assert.equals(person[sym].value, person);

      assert(stop);

      Dom.remove(container);
      assert.msg('should delete symbol').equals(Object.getOwnPropertySymbols(person), []);
      assert.same(container.firstChild, null);

      assert.called(stop);
      assert.called(list.stop);
      list.stop(); // should be harmless to call again
    });

    test('copyKeys', () => {
      /**
       * should copy key values; not assign
       **/
      const a = {key: [1,2,3]};
      const compare = (a,b) => -1;
      const compareKeys = ['key'];
      const list = new AutoList({
        container: Dom.h({}),
        template: Row,
        query: {
          forEach: (body) => {body(a)},
          compare,
          compareKeys,
        }
      });

      const {value} = list.entries.firstNode;

      assert.equals(value.key, a.key);
      refute.same(value.key, a.key);
    });
  });
});
