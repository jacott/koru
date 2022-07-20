isServer && define((require, exports, module) => {
  'use strict';
  /**
   * A Prepared query that is automatticaly named for reused on DB connections.
   *
   */
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const TH              = require('koru/model/test-db-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const PsSql = require('./ps-sql');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let Book;
    before(async () => {
      await TH.startTransaction();
      Book = class extends BaseModel {
        authorize() {}
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
       * Note: The query is lazily prepared including parsing the string and deriving parameter types.

       * @param queryStr The sql query string, with symbolic parameters, to prepare

       * @param model models used to resolve symbolic parameter types

       */
      const PsSql = api.class();
      //[
      const bigBooks = new PsSql(`SELECT sum("pageCount") FROM "Book" WHERE "pageCount" > {$pageCount}`, Book);

      assert.equals(await bigBooks.fetchOne({pageCount: 300}), {sum: 1214});
      //]
    });

    test('fetchOne', async () => {
      /**
       * Fetch one or zero rows from the query and close the portal.
       */
      api.protoMethod();
      //[
      const byAuthor = new PsSql(`SELECT title FROM "Book" WHERE "author" = {$author} order by "pageCount"`, Book);

      assert.equals(await byAuthor.fetchOne({author: 'Dima Zales'}), {title: 'Limbo'});
      //]
    });

    test('fetch', async () => {
      /**
       * Fetch zero or more rows from the query and close the portal.
       */
      api.protoMethod();
      //[
      const byAuthor = new PsSql(`SELECT title FROM "Book" WHERE "author" = {$author} order by "pageCount"`, Book);

      assert.equals(await byAuthor.fetch({author: 'Dima Zales'}), [{title: 'Limbo'}, {title: 'Oasis'}]);
      //]
    });

    test('value', async () => {
      /**
       * Convience wrapper around {##fetchOne} which returns one value from the row if found else the default value
       */
      api.protoMethod();
      //[
      const countByAuthor = new PsSql(`SELECT count(1) FROM "Book" WHERE "author" = {$author}`, Book);

      assert.equals(await countByAuthor.value({author: 'Dima Zales'}), 2);

      const bigBooks = new PsSql(
        `SELECT title FROM "Book" WHERE "pageCount" > {$pageCount} ORDER BY "pageCount" DESC`, Book);

      assert.equals(await bigBooks.value({pageCount: 3000}, 'No book is that big'), 'No book is that big');
      assert.equals(await bigBooks.value({pageCount: 300}, 'No book is that big'), 'The Eye of the World');

      //]
    });
  });
});
