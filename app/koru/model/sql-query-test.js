isServer && define((require, exports, module) => {
  'use strict';
  /**
   * An optimized Model query using sql for where statement.
   *
   * Note: all queries must be ran from withing a transaction
   */
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const TH              = require('koru/model/test-db-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const SqlQuery = require('./sql-query');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let Book;
    before(async () => {
      await TH.startTransaction();
      Book = class extends BaseModel {
        authorize() {}

        get summary() {return `${this.title} by ${this.author}`}
      };
      Book.define({
        name: 'Book',
        inspectField: 'title',
        fields: {
          title: 'text',
          author: 'text',
          pageCount: 'int2',
          pages: 'jsonb',
        },
      });

      await Book.docs.autoCreate();

      await Book.create({
        title: 'Pride and Prejudice',
        author: 'Jane Austin',
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

       */
      const SqlQuery = api.class();
      //[
      const bigBooks = new SqlQuery(Book, `"pageCount" > {$pageCount} ORDER BY "pageCount"`);

      assert.same(await bigBooks.fetchOne({pageCount: 300}), await Book.findBy('title', 'Pride and Prejudice'));
      //]
    });

    test('fetchOne', async () => {
      /**
       * Fetch one or zero rows from the query and close the portal.
       */
      api.protoMethod();
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      assert.equals(await byAuthor.fetchOne({author: 'Dima Zales'}), await Book.findBy('title', 'Limbo'));
      //]
    });

    test('fetch', async () => {
      /**
       * Fetch zero or more rows from the query and close the portal.
       */
      api.protoMethod();
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      assert.equals((await byAuthor.fetch({author: 'Dima Zales'})).map((d) => d.summary),
                    ['Limbo by Dima Zales', 'Oasis by Dima Zales']);
      //]
    });

    test('values', async () => {
      /**
       * return an asyncIterator over the rows returned from the query.
       */
      api.protoMethod();
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      const titles = [];

      for await (const row of byAuthor.values({author: 'Dima Zales'})) {
        titles.push(row.summary);
      }

      assert.equals(titles, ['Limbo by Dima Zales', 'Oasis by Dima Zales']);
      //]
    });

    test('forEach', async () => {
      /**
       * call callback for each row returned from the query.
       */
      api.protoMethod();
      //[
      const byAuthor = Book.sqlWhere(`"author" = {$author} ORDER BY "pageCount"`);

      const titles = [];

      await byAuthor.forEach({author: 'Dima Zales'}, (row) => titles.push(row.summary));

      assert.equals(titles, ['Limbo by Dima Zales', 'Oasis by Dima Zales']);
      //]
    });
  });
});
