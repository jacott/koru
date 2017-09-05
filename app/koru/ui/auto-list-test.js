isClient && define(function (require, exports, module) {
  /**
   * Automatically manage a list of Elements matching a {#koru/model/query}.

   * The list observers changes in the query model and updates the list accordingly.
   **/
  const Dom         = require('koru/dom');
  const DomTemplate = require('koru/dom/template');
  const Model       = require('koru/model');
  const TH          = require('koru/model/test-helper');
  const api         = require('koru/test/api');
  const util        = require('koru/util');

  const {endMarker$} = require('koru/symbols');

  const AutoList = require('./auto-list');
  let v = null;

  const createBook = (i, opts)=>v[`b${i}`] =
          v.Book.create(Object.assign({title: `b${i}`, pageCount: i*100}, opts));

  TH.testCase(module, {
    setUp() {
      api.module();
      v = {};
      class Book extends Model.BaseModel {
      }
      v.Book = Book;
      Book.define({
        name: 'Book',
        fields: {title: 'text', pageCount: 'number'}
      });
      v.row = DomTemplate.newTemplate({
        name: "Book",
        nodes: [{
          name: "div",
          children: [["", "title"]]
        }]
      });
    },

    tearDown() {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      Model._destroyModel('Book', 'drop');
      v = null;
    },

    "test new"() {
      /**
       * Build a new AutoList
       *
       * @param query A {#koru/model/query} or at least has methods `compare` and `forEach`. The
       * method `onChange` will be used to auto-update the list if present.

       * @param template to render each row

       * @param container to render into. Can be a start `Comment` node with symbol `endMarker$`
       * (see {#koru/symbols}) pointing to end `Comment` in which case the rows will be rendered
       * between the comments.

       * @param limit maximum number of elements to show. (see `limit` property)

       * @param compare function to order data. Defaults to `query.compare`

       * @param compareKeys Array of keys used for ordering data. Defaults to `compare.compareKeys`

       * @param observeUpdates The list can be monitored for changes by passing an `observeUpdates`
       * function which is called for each change with the arguments `(list, doc, action)`
       * where:

       * * `list` is this `AutoList`

       * * `doc` is the document being added, changed, or removed

       * * `action` is `added`, `changed` or `removed`

       **/

      const new_AutoList = api.new(AutoList);

      const {Book, row} = v;

      const book1 = Book.create({title: "The Eye of the World"});
      const book2 = Book.create({title: "The Great Hunt"});

      api.example(_=>{
        const container = Dom.h({});
        const list = new_AutoList({query: Book.query.sort('title'), template: row, container});

        assert.dom(container, ()=>{
          assert.dom(':first-child', 'The Eye of the World');
          assert.dom(':last-child', 'The Great Hunt');
        });
      });
    },

    "test basic arguments"() {
      const container = Dom.h({});
      new AutoList({
        query: {forEach(func) {func({n: 2}), func({n: 1})}},
        template: {$autoRender(data) {return Dom.h({div: ''+data.n})}},
        container,
        compare({n:a},{n:b}) {return a == b ? 0 : a < b ? -1 : 1},
        compareKeys: ['n']
      });

      assert.dom(container, ()=>{
        assert.dom(':first-child', '1');
        assert.dom(':last-child', '2');
      });
    },

    "test observeUpdates"() {
      const {Book, row} = v;

      const container = Dom.h({});

      const observeUpdates = this.stub();

      createBook(2); createBook(3);

      const list = new AutoList({
        query: Book.where(b => b.title < 'b7').sort('title'), template: row, container,
        observeUpdates,
      });

      createBook(1);

      assert.calledOnceWith(observeUpdates, list, v.b1, 'added');
      observeUpdates.reset();

      v.b1.$update('pageCount', 700);

      assert.calledWith(observeUpdates, list, v.b1, 'changed');
      observeUpdates.reset();

      v.b1.$update('title', 'b9');

      assert.calledWith(observeUpdates, list, TH.matchModel(v.b1), 'removed');
    },


    "test changeOptions"() {
      /**
       * Rebuild list based on a different options. It trys to preserve DOM elements where possible.

       * @param updateAllTags call updateAllTags on each element that is already rendered. Defaults
       * to `false`
       **/

      const {Book, row} = v;

      const book1 = Book.create({title: "The Eye of the World", pageCount: 782});
      const book2 = Book.create({title: "The Great Hunt", pageCount: 681});

      const container = Dom.h({});
      let query = Book.query.sort('title');
      const list = new AutoList({query, template: row, container});

      api.protoMethod('changeOptions');
      assert.equals(list.query, query);

      api.example(_=>{
        assert.dom(container, ()=>{
          assert.dom(':first-child', {data: TH.matchModel(book1)}, elm =>{
            v.book1Elm = elm;
          });

          list.changeOptions({query: Book.where(d=> ! /Shadow/.test(d.title)).sort('pageCount')});

          assert.dom(':first-child', 'The Great Hunt');
          assert.dom(':last-child', 'The Eye of the World', elm =>{
            assert.same(elm, v.book1Elm);
          });

          Book.create({title: "The Fires of Heaven", pageCount: 963});
          assert.dom(':last-child', 'The Fires of Heaven'); // reverse sort

          const b4 = Book.create({title: "The Shadow Rising", pageCount: 1001});
          refute(list.elm(b4)); // filtered out
        });
      });
    },

    "test updateEntry"() {
      /**
       * Explicitly update an entry in the list. This method is called automatically when the
       * query.onChange callback is is used; i.e. when an entry is changed.
       *
       * If `observeUpdates` is set then it is called after the update.

       * @param doc the entry to update

       * @param action if value is `"remove"` then remove entry

       **/
      api.protoMethod("updateEntry");

      const {row} = v;

      const container = Dom.h({});

      api.example(_=>{
        const observeUpdates = TH.test.stub();
        const list = new AutoList({
          template: row, container,
          query: {
            forEach() {},
          },
          compare: util.compareByField('title'),
          observeUpdates,
        });
        assert.dom(container, ()=>{
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
      });
    },

    "test elm"() {
      /**
       * Return the elm for a document.

       * @param [force] if set to render then raise the limit in order for node to be visible
       **/

      api.protoMethod('elm');

      const {Book, row} = v;
      const container = Dom.h({});
      const parentCtx = Dom.setCtx(container, new Dom.Ctx());
      const list = new AutoList({
        query: Book.where(n=>n.title !== 'b2').sort('title'),
        template: row, container, limit: 1, parentCtx});

      createBook(1);
      createBook(2);
      createBook(3);

      assert.same(list.elm(v.b1), container.firstChild);
      assert.same(Dom.myCtx(list.elm(v.b1)).parentCtx, parentCtx);
      assert.same(list.elm(v.b2), null);
      assert.same(list.elm(v.b3), null);
      assert.same(list.elm(null), null);
      v.b1.$remove();

      assert(list.elm(v.b3));
      v.b3.title = 'b2'; // we haved taged this doc so we know we have it
      assert(list.elm({title: 'b3', _id: v.b3._id}));
      refute(list.elm({title: 'b2', _id: v.b3._id}));
      assert(list.elm(v.b3));

      createBook(4);
      createBook(5);

      assert.same(list.elm(v.b5), null);
      assert.same(list.elm(v.b5, 'render'), container.lastChild);
      assert.same(list.limit, 3);
    },

    "test limit"() {
      /**
       * A limit of `n` can be given to only display the first (ordered) `n` entries.
       *
       * When visible entries are removed non-visible entries are added to keep list length at `n`
       * when `n` or more rows still match the query. Defaults to `Infinity`
       **/
      api.protoProperty('limit');

      const {Book, row} = v;
      const container = Dom.h({});

      createBook(1); createBook(2); createBook(3);

      const list = new AutoList({
        query: Book.query.sort('title'), template: row, container, limit: 2});

      assert.same(container.children.length, 2);

      list.limit = 3;
      assert.equals(list.limit, 3);
      assert.same(container.children.length, 3);

      list.limit = 2;
      assert.equals(list.limit, 2);
      assert.same(container.children.length, 2);
    },

    "limits": {
      setUp() {
        for(let i = 1; i < 6; ++i) {
          createBook(i);
        }
        const {Book, row} = v;
        const container = Dom.h({});
        v.newList = limit =>{
          return new AutoList({
            query: Book.query.sort('pageCount', 'title'), template: row, container, limit});
        };
      },

      "test elm not rendered"() {
        const list = v.newList(2);
        assert.same(list.elm(v.b4), null);

        assertVisible(list, [1,2], [3,4,5]);

        assert.dom(list.elm(v.b4, 'render'));
        assertVisible(list, [1,2,3,4], [5]);

        assert.same(list.limit, 4);
      },

      "test increase limit"() {
        createBook(6);
        const list = v.newList(3);
        list.limit = 5;
        assertVisible(list, [1,2,3,4,5], [6]);

        list.limit = 10;
        assertVisible(list, [1,2,3,4,5,6]);
      },

      "test decrease limit"() {
        const list = v.newList(3);
        assert.same(list.limit, 3);

        /** initial **/
        assertVisible(list, [1,2,3], [4,5]);

        /** insert **/

        createBook(6, {pageCount: 150});

        assertVisible(list, [1,6,2], [3,4,5]);

        /** remove **/
        v.b1.$remove();
        assertVisible(list, [6,2,3], [4,5]);
      },

      "test remove last visible"() {
        const list = v.newList(3);
        v.b3.$remove();
        assertVisible(list, [1,2,4], [5]);
      },

      "test remove all invisible"() {
        const list = v.newList(4);
        v.b3.$remove();
        v.b1.$remove();
        assertVisible(list, [2,4,5]);
      },

      "test last visible ticket value not important"() {
        const list = v.newList(3);
        v.b3.pageCount = 50;
        createBook(6, {pageCount: v.b1.pageCount+5});

        v.b3.$reload();
        assertVisible(list, [1,6,2], [3,4,5]);
      },

      "test move up"() {
        const list = v.newList(3);
        v.b5.$update('pageCount', v.b1.pageCount+5);
        assertVisible(list, [1,5,2], [3,4]);

        v.b2.$remove(); // check lastVis
        assertVisible(list, [1,5,3], [4]);
      },

      "test move down"() {
        const list = v.newList(3);
        v.b2.$update('pageCount', v.b4.pageCount+7);
        assertVisible(list, [1,3,4], [2,5]);

        v.b3.$update('pageCount', v.b4.pageCount+3);
        assertVisible(list, [1,4,3], [2,5]);

        v.b3.$remove(); // check lastVis
        assertVisible(list, [1,4,2], [5]);
      },

      "test move within visible to visible"() {
        const list = v.newList(3);
        v.b1.$update('pageCount', v.b2.pageCount+5);
        v.b2.$update('pageCount', v.b3.pageCount+5);
        assertVisible(list, [1,3,2], [4,5]);

        v.b2.$remove(); // check lastVis
        assertVisible(list, [1,3,4], [5]);
      },

      "test move within hidden to hidden"() {
        const list = v.newList(2);
        assertVisible(list, [1,2], [3,4,5]);
        v.b4.$update('pageCount', v.b5.pageCount+10);
        v.b3.$update('pageCount', v.b5.pageCount+5);
        assertVisible(list, [1,2], [5,3,4]);

        v.b2.$remove(); // check lastVis
        assertVisible(list, [1,5], [3,4]);
      },

      "test move last visible up"() {
        const list = v.newList(3);
        v.b3.$update('pageCount', v.b1.pageCount-5); // move away from t2
        assertVisible(list, [3,1,2], [4,5]);

        v.b2.$remove(); // check lastVis
        assertVisible(list, [3,1,4], [5]);
      },

      "test move last visible, last node up"() {
        const list = v.newList(5);
        v.b5.$update('pageCount', v.b3.pageCount-5); // move away from t2
        assertVisible(list, [1,2,5,3,4]);

        createBook(6, {pageCount: v.b1.pageCount+5});
        assertVisible(list, [1,6,2,5,3], [4]);
      },

      "test move last visible to last"() {
        const list = v.newList(3);
        v.b3.$update('pageCount', v.b5.pageCount+5);
        assertVisible(list, [1,2,4], [5,3]);

        v.b4.$remove(); // check lastVis
        assertVisible(list, [1,2,5], [3]);
      },

      "test move last visible down"() {
        const list = v.newList(3);
        v.b3.$update('pageCount', v.b4.pageCount+5);
        assertVisible(list, [1,2,4], [3,5]);

        v.b4.$remove(); // check lastVis
        assertVisible(list, [1,2,3], [5]);
      },

      "test append"() {
        const list = v.newList(3);
        createBook(6);
        assertVisible(list, [1,2,3], [4,5,6]);
      },

      "test delete last visible"() {
        const list = v.newList(5);
        v.b5.$remove();
        assertVisible(list, [1,2,3,4]);
      },
    },

    "test comment with changeOptions"() {
      const container = Dom.h({div: [
        'before', {$comment$: 'start'}, {$comment$: 'end'}, 'after',
      ]});

      const startComment = container.childNodes[1];
      startComment[endMarker$] = container.childNodes[2];

      const {Book, row} = v;

      createBook(1); createBook(2, {pageCount: 1000}); createBook(3);

      const list = new AutoList({
        query: Book.query.sort('title'), template: row, container: startComment});

      assert.equals(util.map(
        container.childNodes, n => `${n.nodeType}:${n.data || n.textContent}`),
                    ['3:before', '8:start', '1:b1', '1:b2', '1:b3', '8:end', '3:after']);

      list.changeOptions({query: Book.where('pageCount', 1000).sort('title')});

      assert.equals(util.map(
        container.childNodes, n => `${n.nodeType}:${n.data || n.textContent}`),
                    ['3:before', '8:start', '1:b2', '8:end', '3:after']);
    },

    "test updateAllTags with changeOptions"() {
      api.protoMethod('changeOptions');

      const {row} = v;

      createBook(1, {pageCount: 1000}); createBook(2);

      assert.dom(Dom.h({ul: ''}), pn => {
        const list = new AutoList({
          container: pn,
          template: row,
          query: {
            forEach: body => {body(v.b1), body(v.b2)},
          },
          compare: util.compareByField('pageCount')
        });

        v.b1.title = 'b4';

        list.changeOptions({
          query: {
            forEach: body => {body(v.b1), body(v.b2)},
          },
          compare: util.compareByField('title')
        });

        assert.dom('div+div', 'b1');

        list.changeOptions({
          query: {
            forEach: body => {body(v.b1), body(v.b2)},
          },
          updateAllTags: true,
        });

        assert.dom('div+div', 'b4');
      });
    },

    "test start, end comment"() {
      const new_AutoList = api.new(AutoList);

      const {Book, row} = v;

      api.example(_=>{
        // Using comment delimeters

        const container = Dom.h({div: [
          'before', {$comment$: 'start'}, {$comment$: 'end'}, 'after',
        ]});

        const startComment = container.childNodes[1];
        startComment[endMarker$] = container.childNodes[2];

        const list = new_AutoList({
          query: Book.query.sort('title'), template: row, container: startComment});

        assert.dom(container, pn =>{
          createBook(4);
          createBook(1);
          createBook(5);

          assert.equals(util.map(
            pn.childNodes, n => `${n.nodeType}:${n.data || n.textContent}`),
                        ['3:before', '8:start', '1:b1', '1:b4', '1:b5', '8:end', '3:after']);
        });
      });
    },

    "test observing"() {
      const {Book, row} = v;

      [1,2,3].forEach(i => {createBook(i)});

      let query = Book.query.where(d=>d.title[0]==='b').sort('pageCount');
      const container = Dom.h({});
      const list = new AutoList({query, template: row, container});

      const mapEntries = _=> Array.from(list.entries).map(n => Book.findById(n._id).title);


      assert.dom(container, pn =>{
        assert.equals(mapEntries(), ['b1', 'b2', 'b3']);

        v.b4 = createBook(4, {pageCount: 50});

        assert.dom(':first-child', 'b4');
        assert.dom(':nth-child(2)', 'b1');

        assert.equals(mapEntries(), ['b4', 'b1', 'b2', 'b3']);

        v.b2.$update('title', 'a2');
        refute.dom('div', 'a2');
        refute(list.elm(v.b2));
        assert.equals(mapEntries(), ['b4', 'b1', 'b3']);
        assert.dom(':nth-child(3', 'b3');

        v.b4.$remove();
        refute.dom('div', 'b4');
        assert.dom(':first-child', 'b1');
        assert.equals(mapEntries(), ['b1', 'b3']);

        v.b2.$update({title: 'b2', pageCount: 150});
        assert.equals(mapEntries(), ['b1', 'b2', 'b3']);

        v.b3.$update('pageCount', 20);
        assert.equals(mapEntries(), ['b3', 'b1', 'b2']);

        assert.equals(util.map(pn.children, n => Dom.ctx(n).data.title),
                      ['b3', 'b1', 'b2']);

        v.b3.$update('title', 'b300');
        assert.dom(':first-child', 'b300');
      });
    },

    "test stop"() {
      /**
       * Stop observing model changes.

       * Removing the container via {#koru/dom.remove} also stops observering model
       **/

      api.protoMethod('stop');
      const {row} = v;
      const container = Dom.h({});
      Dom.setCtx(container, new Dom.Ctx());

      const person = {name: 'Frank', _id: 'a123'};

      const list = new AutoList({query: {
        compare: util.compareByName,
        onChange: _=> ({stop: v.stop = this.stub()}),
        forEach: body =>{body(person)},
      }, template: row, container});

      this.spy(list, 'stop');

      const sym = Object.getOwnPropertySymbols(person)[0];
      assert.equals(person[sym].value, person);

      assert(v.stop);

      Dom.remove(container);
      assert.msg('should delete symbol').equals(Object.getOwnPropertySymbols(person), []);
      assert.called(v.stop);
      assert.called(list.stop);
      list.stop(); // should be harmless to call again
    },
  });

  const assertVisible = (list, shown, hidden=[]) => {
    let bad = 0;
    let exp = n => n;
    const check = n => (bad = n, exp(list.elm(v[`b${n}`])));
    assert.elideFromStack(shown.every(check), `doc b${bad} not shown`);
    exp = n => ! n;
    assert.elideFromStack(hidden.every(check), `doc b${bad} not hidden`);
    assert.elideFromStack.equals(Array.from(list.entries).map(
      n => +n.title.slice(1)), shown.concat(hidden));

  };
});
