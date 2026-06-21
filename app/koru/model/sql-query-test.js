isServer && define((require, exports, module) => {
  'use strict';
  /**
   * An optimized Model query using sql for where statement.
   *
   * Note: all queries must be ran from within a transaction
   */
  const koru            = require('koru');
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const TH              = require('koru/model/test-db-helper');
  const SQLStatement    = require('koru/pg/sql-statement');
  const api             = require('koru/test/api');

  const {stub, spy, util, stubProperty} = TH;

  const SqlQuery = require('./sql-query');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let Book;
    before(async () => {
      await TH.startTransaction();
      Book = class extends BaseModel {
        authorize() {}

        get summary() {
          return `${this.title} by ${this.author}`;
        }
      };
      Book.define({
        name: 'Book',
        inspectField: 'title',
        fields: {title: 'text', author: 'text', pageCount: 'int2', pages: 'jsonb'},
      });

      await Book.docs.autoCreate();

      await Book.create({
        title: 'Pride and Prejudice',
        author: 'Jane Austen',
        pageCount: 432,
        pages: ['It is a truth universally acknowledged...'],
      });

      await Book.create({
        title: 'Oasis',
        author: 'Dima Zales',
        pageCount: 238,
        pages: ['F**k. Vagina. Shit. I pointedly think...'],
      });

      await Book.create({
        title: 'Limbo',
        author: 'Dima Zales',
        pageCount: 222,
        pages: ["I'm walking in the desert, sun beaming down..."],
      });

      await Book.create({
        title: 'The Eye of the World',
        author: 'Robert Jordan',
        pageCount: 782,
        pages: ['The Wheel of Time turns, and Ages come and pass...'],
      });
    });

    after(async () => {
      Model._destroyModel('Book');
      await TH.rollbackTransaction();
    });

    beforeEach(() => TH.startTransaction());
    afterEach(() => TH.rollbackTransaction());

    test('constructor', async () => {
      /**
       * Create a prepared query.
       *
       * Note: The query is lazily prepared including parsing the string and deriving parameter
       * types.
       *
       * Can also be called as `Model#sqlWhere(queryStr)`

       * @param queryStr The sql query string, with symbolic parameters, to prepare

       * @param model models used to resolve symbolic parameter types

       * @param fields the select field expression to use defaults to `"*"`

       */
      const SqlQuery = api.class();
      //[
      const bigBooks = new SqlQuery(Book, `"pageCount" > {$pageCount} ORDER BY "pageCount"`);

      assert.same(
        await bigBooks.fetchOne({pageCount: 300}),
        await Book.findBy('title', 'Pride and Prejudice'),
      );

      const count = new SqlQuery(Book, `author ~ {$author}`, `count(1)`);

      assert.same(await count.value({author: '.*ima.*'}), 2);
      //]
    });

    test('fetchOne', async () => {
      /**
       * Fetch one or zero rows from the query and close the portal.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const whereAuthorSql = new SQLStatement(
        `SELECT * from "Book" where "author" = {$author} ORDER BY "pageCount"`,
      ); // need full SELECT if using SQLStatement
      const byAuthor = Book.sqlWhere(whereAuthorSql);

      assert.equals(
        await byAuthor.fetchOne({author: 'Dima Zales'}),
        await Book.findBy('title', 'Limbo'),
      );
      //]
    });

    test('oids', async () => {
      const foo = Book.sqlWhere(
        new SQLStatement(`SELECT ARRAY[{$foo}, {$bar}]`, {foo: 23, bar: 23}),
      );
      assert.equals(await foo.value({foo: 1234.5, bar: 'bar'}), [1234, 0]);
    });

    test('lazy dynamic init', async () => {
      const countAuthor = Book.sqlWhere(`"author" = {$author}`, 'author');

      assert.equals(await countAuthor.value({author: 'Dima Zales'}), 'Dima Zales');

      const restoreDocs = stubProperty(Book, 'docs', {
        get() {
          return {
            withConn() {
              throw new koru.Error(418, "I'm a teapot");
            },
          };
        },
      });
      await assert.exception(() => countAuthor.value({author: 'Dima Zales'}));

      restoreDocs();
      assert.equals(await countAuthor.value({author: 'Dima Zales'}), 'Dima Zales');
    });

    test('fetch', async () => {
      /**
       * Fetch zero or more rows from the query and close the portal.
       *
       * @param options use `raw: true` to get rows as basic object instead of models.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      assert.equals((await byAuthor.fetch({author: 'Dima Zales'})).map((d) => d.summary), [
        'Limbo by Dima Zales',
        'Oasis by Dima Zales',
      ]);

      const pagesQ = Book.sqlWhere(
        `SELECT "pageCount" FROM "Book" WHERE "pageCount" < {$max} ORDER BY "pageCount"`,
      );
      assert.equals(await pagesQ.fetch({max: 250}, {raw: true}), [{pageCount: 222}, {
        pageCount: 238,
      }]);

      //]
    });

    test('values', async () => {
      /**
       * return an asyncIterator over the rows returned from the query.
       *
       * @param options use `raw: true` to get rows as basic object instead of models.
       * use `bufferSize: n` to specify how many rows are fetched at a time.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const byAuthor = Book.sqlWhere(`author = {$author} ORDER BY "pageCount"`);
      const pagesQ = Book.sqlWhere(
        `SELECT "pageCount" FROM "Book" WHERE "pageCount" > {$pageCount}`,
      );

      const titles = [];

      // --- Nesting ---
      for await (const row of byAuthor.values({author: 'Dima Zales'}, {bufferSize: 1})) {
        titles.push(row.summary);
        let count = 0;
        let sameDoc = 0;

        // can run same query with parent
        for await (const row2 of byAuthor.values(row)) {
          count += row2.pageCount;
          sameDoc += row === row2 ? 10 : 1;
        }
        assert.same(sameDoc, 11);
        assert.same(count, 460);
      }
      assert.equals(titles, ['Limbo by Dima Zales', 'Oasis by Dima Zales']);

      // --- Zipping ---
      const iter1 = byAuthor.values({author: 'Dima Zales'});
      const iter2 = byAuthor.values({author: 'Jane Austen'});

      assert.same((await iter1.next()).value.pageCount, 222);
      assert.same((await iter2.next()).value.pageCount, 432);
      assert.same((await iter1.next()).value.pageCount, 238);

      // --- Raw rows ---
      let pages = 0;
      for await (const row of pagesQ.values({pageCount: 300}, {raw: true})) {
        await 1;
        assert.equals(row, {pageCount: row.pageCount});
        pages += row.pageCount;
      }

      assert.equals(pages, 1214);
      //]
    });

    test('value', async () => {
      /**
       * Fetch the value of the first column retrieved or else defValue if none.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const countAuthor = Book.sqlWhere(`"author" = {$author}`, 'author');

      assert.equals(await countAuthor.value({author: 'Dima Zales'}, 'none'), 'Dima Zales');

      assert.equals(await countAuthor.value({author: 'Andy Weir'}, 'none'), 'none');
      //]
    });

    test('exists', async () => {
      /**
       * Fetch the value of the first column retrieved or else defValue if none.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const authorTest = Book.sqlWhere(`"author" = {$author}`, '1');

      assert.equals(await authorTest.exists({author: 'Dima Zales'}), true);
      assert.equals(await authorTest.exists({author: 'Andy Weir'}), false);
      //]
    });

    test('forEach', async () => {
      /**
       * call callback for each row returned from the query.
       *
       * @param callback a function called for each row found. May not be async.
       */
      api.protoMethod();
      Book.docs._colMap = undefined;
      Book.docs._ready = false;
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      const titles = [];

      await byAuthor.forEach({author: 'Dima Zales'}, (row) => titles.push(row.summary));

      assert.equals(titles, ['Limbo by Dima Zales', 'Oasis by Dima Zales']);
      //]
    });
  });
});
