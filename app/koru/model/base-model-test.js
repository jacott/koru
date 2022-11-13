//;no-client-async
define((require, exports, module) => {
  'use strict';
  /**
   * The base class for all models
   **/
  const koru            = require('koru');
  const Changes         = require('koru/changes');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
  const RequiredValidator = require('koru/model/validators/required-validator');
  const TextValidator   = require('koru/model/validators/text-validator');
  const ValidateValidator = require('koru/model/validators/validate-validator');
  const ValidatorHelper = require('koru/model/validators/validator-helper');
  const session         = require('koru/session');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');
  const Val             = require('./validation');

  const {inspect$, error$, original$} = require('koru/symbols');

  const Module = module.constructor;

  const {stub, spy, util, intercept, match: m} = TH;

  const BaseModel = require('./base-model');

  const newBookModule = () => {
    const bm = new Module(undefined, 'book');
    module.onUnload = () => {};
    return bm;
  };

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      Val.register({onUnload: after}, {
        RequiredValidator,
        TextValidator,
        ValidateValidator,
      });
    });

    afterEach(async () => {
      await Model._destroyModel('Book', 'drop');
      v = {};
    });

    test('define', () => {
      /**
       * Define and register a model.
       *

       * @param {Module} [module] needed to auto unload module when file changed

       * @param {string} [name] name of model. Defaults to derived from module name.

       * @param {object} [fields] call {#.defineFields} with fields

       * @returns the model
       **/
      api.method();

      const module = newBookModule();
      //[
      class Book extends BaseModel {}
      Book.define({module, fields: {
        title: 'text',
        pages: {type: 'number', number: {'>': 0}},
      }});
      assert.same(Model.Book, Book);

      const book = new Book();

      book.title = 'The Hedge Knight';
      assert.equals(book.changes, {title: 'The Hedge Knight'});

      book.pages = -1;
      refute(book.$isValid());
      assert.equals(book[error$], {pages: [['must_be_greater_than', 0]]});
      //]
    });

    test('defineFields', () => {
      /**
       * Define the types and {#../validators/main;;validators} of the fields in a model. Usually
       * called with {#.define}
       *
       * Valid types are:
       *
       * |type            |javascript type |DB type          | |
       * |:---            |:-----------    |:------          |:----- |
       * |any             |object          |                 | |
       * |auto_timestamp  |Date            |timestamp        |Set the timestamp on create; if field name contains `/create/i`; otherwise on update.|
       * |baseObject      |object          |jsonb            | |
       * |belongs_to_dbId |string          |text             |{{topic:belongs_to_dbId}} |
       * |belongs_to      |string          |text             |Associate this model belonging to another model. A getter is defined to retrieve the associated model using this fields name less the `_id` suffix.|
       * |boolean         |boolean         |boolean          | |
       * |color           |string          |text             | |
       * |date            |Date            |date             | |
       * |has_many        |Array           |text[]           |Used with the {#../validators/associated-validator} to map to many ids.|
       * |id              |string          |text             | |
       * |integer         |number          |integer          | |
       * |jsonb           |object          |jsonb            | |
       * |number          |number          |double precision | |
       * |object          |object          |jsonb            | |
       * |string          |string          |text             | |
       * |text            |string          |text             | |
       * |user_id_on_create |string        |text             |Like `belongs_to` but also sets the field on create to the logged in `user_id`.|

       * @param fields an key-value object with keys naming the fields and values defining the field
       * `type`, the {#../validators/main;;validators} and any of the following generic options:
       *
       * |option |usage |
       * |:----- |:---- |
       * |default |The field's default value to assign in a new document |
       * |pseudo_field |The field does not have accessors and is not set in `<Model>.$fields` property |
       * |accessor |Use `accessor.get` and `accessor.set` for this field.<br>An accessor of `false` means no accessors |
       * |readOnly |Saving a change to the field should not be allowed|
       * |changesOnly |{{topic:changesOnly}}|
       * |model |An associated model for the field|
       *
       * Types and validators may also make use of other specific options.
       *
       * The field `_id` is added by default with a type of `id`. It can be given an option of
       * `auto` to specify that the DB will generate an id for this field if none is supplied.
       *
       * @returns the model
       **/
      api.method();

      const module = newBookModule();
      //[
      class Book extends BaseModel {}
      Book.define({module});

      Book.defineFields({
        title: 'text',
        pages: {type: 'number', number: {'>': 0}},
      });

      const book = new Book();

      book.title = 'The Hedge Knight';
      assert.equals(book.changes, {title: 'The Hedge Knight'});

      book.pages = -1;
      refute(book.$isValid());
      assert.equals(book[error$], {pages: [['must_be_greater_than', 0]]});
      //]
    });

    test('assertFound', () => {
      /**
       * Assert model instance is found

       * @throws koru.Error 404
       */
      api.method();

      const module = newBookModule();
      //[
      class Book extends BaseModel {}
      Book.define({module});
      assert.exception(() => {
        Book.assertFound(null);
      }, {error: 404, message: 'Book Not found'});

      refute.exception(() => {
        const book = Book.build();
        Book.assertFound(book);
      });
      //]
    });

    test('$isValid async', async () => {
      /**
       * Check if a document is valid
       */
      api.protoMethod();
      const module = newBookModule();
      //[
      class Book extends BaseModel {}
      Book.define({
        module,
        fields: {
          pages: {type: 'number', async validate(field) {
            await 1;
            return 'is_invalid';
          }, changesOnly: true},
        },
      });
      const book = new Book();
      book.attributes.pages = -1;

      // original$ exists
      book[original$] = undefined;
      refute(await book.$isValid());
      assert.equals(book[error$], {pages: [['is_invalid']]});
      //]
    });

    group('validation', () => {
      class Book extends ValidatorHelper.ModelStub {}
      Book.modelName = 'Book';

      Book.registerValidator(TextValidator);

      test('changesOnly', () => {
        /**
         * Only changes to the field are validated
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        Book.defineFields({
          pages: {type: 'number', number: {'>': 0}, changesOnly: true},
        });
        const book = Book.build();
        book.attributes.pages = -1;

        assert(book.$isValid()); // wrong but no change

        book.pages = 'alsoWrong';
        refute(book.$isValid()); // wrong and changed
        assert.equals(book[error$], {pages: [['not_a_number']]});

        book.pages = 2;
        assert(book.$isValid()); // changed and okay
        //]
      });

      test('changesOnly original$', () => {
        Book.defineFields({
          pages: {type: 'number', number: {'>': 0}, changesOnly: true},
        });
        const book = new Book();
        book.attributes.pages = -1;

        // original$ exists
        book[original$] = undefined;
        refute(book.$isValid());

        book[original$] = {pages: -2};
        book.pages = 'alsoWrong';
        refute(book.$isValid()); // wrong and changed

        book.pages = -2;
        assert(book.$isValid()); // wrong but no change
      });
    });

    group('with Model', () => {
      beforeEach(() => {
        class Book extends BaseModel {
          authorize() {}
        }
        Book.define({
          name: 'Book',
          inspectField: 'title',
          fields: {title: 'text', pages: 'jsonb', pageCount: 'number'},
        });
        v.Book = Book;
      });

      test('lockId', async () => {
        /**
         * Wait for a lock on an id in this model using a {#koru/mutex}. Must be used in a
         * {#../trans-queue}. Locks until the transaction is finished.
         *
         * @param id usally the id of a DB record.
         */
        api.method();
        const {Book} = v;
        //[
        await TransQueue.transaction(async () => {
          await Book.lockId('bookid123');
          assert.isTrue(Book.isIdLocked('bookid123'));
          await Book.lockId('bookid123'); // does nothing if called more than once
        });
        assert.isFalse(Book.isIdLocked('bookid123'));

        await assert.exception(
          () => Book.lockId('bookid123'),
          {message: 'Attempt to lock while not in a transaction'},
        );
        //]
      });

      test('isIdLocked', async () => {
        /**
         * Test if an id is locked.
         *
         * @param id usally the id of a DB record.
         */
        api.method();
        const {Book} = v;
        //[
        await TransQueue.transaction(async () => {
          await Book.lockId('bookid123');
          assert.isTrue(Book.isIdLocked('bookid123'));
          assert.isFalse(Book.isIdLocked('bookid456'));
        });
        assert.isFalse(Book.isIdLocked('bookid123'));
        //]
      });

      test('nullToUndef', () => {
        const book = new v.Book();
        book.title = null;
        assert.same(book.title, undefined);
        assert.same(book.attributes.title, undefined);

        book.changes.title = null;
        assert.same(book.title, undefined);
      });

      test('onChange', async () => {
        /**
         * Observe changes to model records.
         *
         * @param callback is called with a {#koru/model/doc-change} instance.
         * @return contains a stop method to stop observering
         **/
        const {Book} = v;
        intercept(Book, 'onChange', api.custom(Book.onChange));

        //[
        const observer = stub();
        after(Book.onChange(observer));

        const Oasis = await Book.create({_id: 'm123', title: 'Oasis', pageCount: 425});
        const matchOasis = m.field('_id', Oasis._id);
        assert.calledWith(observer, DocChange.add(Oasis));

        await Oasis.$update('pageCount', 420);
        assert.calledWith(observer, DocChange.change(matchOasis, {pageCount: 425}));

        await Oasis.$remove();
        assert.calledWith(observer, DocChange.delete(matchOasis));
        //]
      });

      test('remote', () => {
        /**
         * Define multiple Remote updating Procedure calls prefixed by model's
         * name.
         **/
        const {Book} = v;
        api.method();
        //[
        Book.remote({
          read() {},
          catalog() {},
        });

        assert(session.isRpc('Book.read'));
        refute(session.isRpcGet('Book.read'));

        assert(session.isRpc('Book.catalog'));
        //]
      });

      test('remoteGet', () => {
        /**
         * Define multiple Remote inquiry Procedure calls prefixed by
         * model's name.
         **/
        const {Book} = v;
        api.method();
        //[
        Book.remoteGet({
          list() {},
          about() {},
        });

        assert(session.isRpc('Book.list'));
        assert(session.isRpcGet('Book.list'));

        assert(session.isRpcGet('Book.about'));
        //]
      });

      test('accessor', () => {
        const {Book} = v;
        Book.defineFields({
          starSign: {type: 'text', accessor: {get() {
            const ans = Book.getField(this, 'starSign');
            return ans === 'Gemini' ? 'Virgo' : ans;
          }}},
          luckyNumber: ({type: 'number', accessor: {set(value) {
            Book.setField(this, 'luckyNumber', value === 13 ? 7 : value);
          }}}),
        });

        const sut = Book.build();
        sut.starSign = 'Gemini';
        assert.same(sut.changes.starSign, 'Gemini');
        assert.same(sut.starSign, 'Virgo');
        sut.starSign = 'Taurus';
        assert.same(sut.starSign, 'Taurus');

        sut.luckyNumber = 13;
        assert.same(sut.luckyNumber, 7);
        sut.luckyNumber = 3;
        assert.same(sut.luckyNumber, 3);
        Book.setField(sut, 'luckyNumber', 42);
        assert.same(sut.changes.luckyNumber, 42);
        assert.same(Book.getField(sut, 'luckyNumber'), 42);
      });

      test('classMethods', () => {
        const {Book} = v;
        const doc = Book.build();
        assert.same(doc.constructor, doc.classMethods);
      });

      test('_id', () => {
        const {Book} = v;
        assert.equals(Book.$fields._id, {type: 'id'});

        const doc = new Book({_id: 'attrId'});

        assert.same(doc._id, 'attrId');

        doc.changes._id = 'chgId';
        assert.same(doc._id, 'attrId');

        doc.attributes._id = null;
        assert.same(doc._id, 'chgId');
      });

      test('exists', async () => {
        const {Book} = v;
        const doc = await Book.create({title: 'foo'});

        assert.isTrue(await Book.exists(doc._id));

        assert.isFalse(await Book.exists('bad'));
      });

      test('query', () => {
        const {Book} = v;
        const query = Book.query;

        assert.same(query.model, Book);
      });

      test('$onThis', async () => {
        const {Book} = v;
        const sut = await Book.create();

        const query = sut.$onThis;

        assert.same(query.model, Book);
        assert.same(query.singleId, sut._id);
      });

      test('where', () => {
        const {Book} = v;
        const query = Book.where('t1', 123);

        assert.same(query.model, Book);
        assert.equals(query._wheres, {t1: 123});
      });

      test('findById', async () => {
        /**
         * Find a document by its `_id`. Returns the same document each time if called from same
         * thread.
         **/
        const {Book} = v;
        api.method();
        //[
        const doc = await Book.create({title: 'Emma', pageCount: 342});

        assert.same(await Book.findById(doc._id), doc);
        //]
      });

      test('findBy', async () => {
        const {Book} = v;
        const doc = await Book.create({
          title: 'Pride and Prejudice', pages: ['It is a truth universally acknowledged...']});

        assert.same((await Book.findBy('title', {$regex: 'Pr'})).attributes, doc.attributes);
      });

      test('$withChanges', () => {
        /**
         * Return a doc representing this doc with the supplied changes staged against it such that
         * calling {##$save} will apply the changes.
         *
         * If this method is called again with the same changes object
         * then a cached version of the before doc is returned.

         * @param changes defaults to `this.changes`
         */
        api.protoMethod();

        const {Book} = v;
        Book.defineFields({author: 'text'});
        //[
        const doc = new Book({
          _id: '123', pages: {bar: {baz: 'new val', buzz: 5}, fnord: {a: 1}}});

        assert.same(doc.$withChanges('add'), doc);
        assert.same(doc.$withChanges('del'), null);

        let undo = {$partial: {
          pages: [
            'bar.baz.$partial', ['$match', 'new val', '$patch', [0, 3, 'orig']],
            'bar.buzz', 2,
            'fnord.a', 2],
          author: ['$replace', 'H. G. Wells'],
        }};
        let old = doc.$withChanges(undo);

        assert.same(old.pages.bar.baz, 'orig val');
        assert.same(old.pages.bar.buzz, 2);
        assert.same(old.author, 'H. G. Wells');

        assert.same(doc.pages.bar.baz, 'new val');
        assert.same(doc.pages.bar.buzz, 5);
        assert.same(doc.pages.fnord.a, 1);

        assert.same(doc.$withChanges(undo), old);

        old = doc.$withChanges({$partial: {
          pages: [
            'bar.baz', null,
            'bar.buzz', 2,
            'fnord.a', 2],
          author: ['$replace', null],
        }});

        assert.same(old.pages.bar.baz, undefined);
        assert.same(old.pages.bar.buzz, 2);
        assert.same(old.author, undefined);
        //]

        doc.changes.author = 'a2';
        assert.same(doc.$withChanges(), doc.$withChanges());
        assert.same(doc.$withChanges().author, 'a2');
      });

      test('$invertChanges', () => {
        /**
         * Use the {beforeChange} keys to extract the new values. See {#koru/changes.extractChangeKeys}
         *
         * @returns new hash of extracted values.
         */
        const {Book} = v;
        const beforeChange = {a: 1, b: 2, c: 3, $partial: {e: ['1.f', 42]}};
        const doc = new Book({_id: '1', a: 2, b: undefined, d: 4, e: [1, {f: 69}]});

        const changes = doc.$invertChanges(beforeChange);

        assert.equals(changes, {a: 2, b: null, c: null, e: [1, {f: 69}]});

        // should not alter passed in arguments
        assert.equals(beforeChange, {a: 1, b: 2, c: 3, $partial: {e: ['1.f', 42]}});
        assert.equals(doc.attributes, {_id: '1', a: 2, b: undefined, d: 4, e: [1, {f: 69}]});
      });

      test('change', async () => {
        const {Book} = v;
        const doc = await Book.create({pages: {bar: {baz: 'orig'}}});

        doc.$change('pages').bar.baz = 'new';

        const bar = doc.pages.bar;

        assert.equals(doc.changes, {pages: {bar: {baz: 'new'}}});
        assert.equals(doc.attributes.pages, {bar: {baz: 'orig'}});

        doc.$change('pages').fnord = 123;
        doc.$change('pages').bar.boo = 'me too';

        assert.equals(bar, {baz: 'new', boo: 'me too'});

        assert.equals(doc.changes, {pages: {bar: {baz: 'new', boo: 'me too'}, fnord: 123}});
        assert.equals(doc.attributes.pages, {bar: {baz: 'orig'}});
      });

      test('$assertValid', async () => {
        /**
         * Validate the document and throw an error if invalid
         **/
        api.protoMethod();
        const {Book} = v;
        //[
        Book.defineFields({author: {
          type: 'text',
          async validate(field) {
            if (! this[field]) return 'is_required'}}});
        const book = Book.build();

        try {
          await book.$assertValid();
          assert.fail('Should not have succeeded');
        } catch (err) {
          assert.same(err.constructor, koru.Error);
          assert.equals(err.error, 400);
          assert.equals(err.reason, {author: [['is_required']]});
        }

        book.author = 'T & T';
        await book.$assertValid();
        assert.same(book[error$], undefined);
        //]
      });

      group('$save', () => {
        /**
         * Validate the document and persist to server DB. Runs `before`, `after` and {##onChange}
         * hooks.

         * @param mode If `"assert"` calls {##$assertValid} otherwise calls {##$isValid}. If
         * `"force"` will save even if validation fails.
         **/

        beforeEach(() => {
          api.protoMethod();
        });

        test('normal mode', async () => {
          const {Book} = v;
          //[
          // normal (undefined) mode
          Book.defineFields({author: {type: 'text', required: true}});
          const book = Book.build();

          assert.isFalse(await book.$save());
          assert.equals(book[error$], {author: [['is_required']]});

          book.author = 'T & T';
          assert.isTrue(await book.$save());
          assert.same(book[error$], undefined);

          assert.same((await book.$reload(true)).author, 'T & T');
          //]
        });

        test("mode 'force'", async () => {
          const {Book} = v;
          //[
          // "force" mode
          Book.defineFields({author: {type: 'text', required: true}});
          const book = Book.build({author: null});

          spy(book, '$isValid');

          await book.$save('force');

          assert.called(book.$isValid); // assert validation methods were run

          assert(await Book.findById(book._id));
          //]
        });

        test('mode assert', async () => {
          TH.noInfo();
          const {Book} = v;
          //[
          // "assert" mode
          Book.defineFields({author: {type: 'text', required: true}});
          const book = Book.build();

          try {
            await book.$save('assert');
            assert.fail('Should not have saved');
          } catch (err) {
            assert.same(err.constructor, koru.Error);
            assert.equals(err.error, 400);
            assert.equals(err.reason, {author: [['is_required']]});
          }

          book.author = 'T & T';
          await book.$save('assert');
          assert.same(book[error$], undefined);

          assert.same((await book.$reload(true)).author, 'T & T');
          //]
        });
      });

      test('$$save', async () => {
        /**
         * Is shorthand for {##$save;("assert")}
         **/
        TH.noInfo();
        const {Book} = v;
        api.protoMethod();
        //[
        Book.defineFields({author: {type: 'text', required: true}});
        const book = Book.build();

        try {
          await book.$$save();
          assert.fail('expect throw');
        } catch (err) {
          assert.equals(err.error, 400);
          assert.equals(err.reason, {author: [['is_required']]});
        }

        book.author = 'T & T';
        await book.$$save();

        assert.same((await book.$reload(true)).author, 'T & T');
        //]
      });

      test('timestamps', async () => {
        const {Book} = v;
        Book.defineFields({createdAt: 'auto_timestamp', updatedAt: 'auto_timestamp'});

        assert.equals(Book.createTimestamps, {createdAt: true});
        assert.equals(Book.updateTimestamps, {updatedAt: true});

        v.now = Date.now() + 1234;
        intercept(util, 'dateNow', () => v.now);

        const doc = await Book.create({title: 'testing'});

        assert(doc._id);

        assert.same(+ doc.createdAt, v.now);

        const oldCreatedAt = v.now - 2000;

        doc.createdAt = oldCreatedAt;
        doc.updatedAt = oldCreatedAt;
        await doc.$$save();

        doc.$reload();

        doc.title = 'changed';
        await doc.$save();

        doc.$reload();

        assert.same(+ doc.createdAt, +oldCreatedAt);
        refute.same(+ doc.updatedAt, +oldCreatedAt);

        v.now += 4000;
        await doc.$update({title: 'changed again'});

        await doc.$reload(true);

        assert.same(+ doc.createdAt, +oldCreatedAt);
        assert.same(+ doc.updatedAt, v.now);
      });

      group('belongs_to', () => {
        let Publisher;
        beforeEach(() => {
          Publisher = Model.define('Publisher').defineFields({name: 'text'});
        });

        afterEach(() => Model._destroyModel('Publisher', 'drop'));

        test('belongs_to_dbId', async () => {
          /**
           * A `pseudo_field` synced to the {#../db-broker;.dbId}. It defines a model getter like
           * `belongs_to` does. It can only be defined once per model.
           *
           * {{example:0}}
           **/
          const {Book} = v;
          api.topic();
          //[
          Book.defineFields({
            publisher_id: {type: 'belongs_to_dbId'},
            title: 'text',
          });

          const book = await Book.create({title: 'White Fang'});
          assert.equals((await book.$reload(true)).attributes, {title: 'White Fang', _id: m.id});
          assert.same(book.publisher_id, dbBroker.dbId);

          await Publisher.create({name: 'Macmillan', _id: 'default'});

          assert.same(book.publisher.name, 'Macmillan');
          //]
        });

        test('accessor', () => {
          const {Book} = v;
          Book.defineFields({publisher_id: {type: 'belongs_to'}});

          const sut = Book.build();
          sut.publisher_id = null;
          assert.same(sut.changes.publisher_id, undefined);
        });

        test('belongs_to auto', async () => {
          const {Book} = v;
          Book.defineFields({publisher_id: {type: 'belongs_to'}});

          const publisher = await Publisher.create({name: 'Macmillan'});
          const sut = Book.build({publisher_id: publisher._id});

          const cached = sut.publisher;
          assert.same(sut.publisher, cached);
          assert.same(sut.publisher.name, 'Macmillan');
          assert.same(Book.$fields.publisher_id.model, Publisher);
        });

        test('belongs_to manual name', async () => {
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', modelName: 'Publisher'}});

          const publisher = await Publisher.create({name: 'Macmillan'});
          const sut = Book.build({baz_id: publisher._id});

          assert.same(sut.baz.name, 'Macmillan');
        });

        test('belongs_to manual model', async () => {
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', model: Publisher}});

          const publisher = await Publisher.create({name: 'Macmillan'});
          const sut = Book.build({baz_id: publisher._id});

          assert.same(sut.baz.name, 'Macmillan');
        });
      });

      test('hasMany', () => {
        function fooFinder(query) {
          v.doc = this;
          v.query = query;
        }

        // exercise
        const {Book} = v;
        Book.hasMany('foos', {query: v.expectQuery = {where: stub()}}, fooFinder);

        const sut = new Book({_id: 'sut123'});

        assert.same(sut.foos, v.query);
        assert.same(v.query, v.expectQuery);
        assert.same(v.doc, sut);
      });

      test('user_id_on_create', async () => {
        const {Book} = v;
        v.User = Model.define('User');
        after(() => Model._destroyModel('User', 'drop'));
        Book.defineFields({user_id: 'user_id_on_create'});

        assert.equals(Book.userIds, {user_id: 'create'});

        TH.login('u1234');
        const doc = await Book.create({title: 'testing'});

        assert(doc._id);

        assert.same(doc.user_id, util.thread.userId);

        let id;
        await session.rpc('save', 'Book', null, {_id: id = '123456', title: 'testing'});
        assert.same((await Book.findById(id)).user_id, util.thread.userId);

        assert.same((await Book.create({user_id: 'override'})).$reload().user_id, 'override');
      });

      test('field accessor false', () => {
        const {Book} = v;
        Book.defineFields({fuzz: {type: 'text', accessor: false}});
        const doc = Book.build({fuzz: 'bar'});

        assert.same(doc.fuzz, undefined);
        assert.same(doc.changes.fuzz, 'bar');
        assert.same(Book.$fields.fuzz.accessor, false);
      });

      test('equality', () => {
        const {Book} = v;
        const OtherClass = Model.define('OtherClass'),
              a = new Book(),
              b = new Book(),
              c = new OtherClass();

        after(() => Model._destroyModel('OtherClass', 'drop'));

        refute.isTrue(a.$equals(b));

        a.attributes._id = 'hello';

        refute.isTrue(a.$equals(b));

        b.attributes._id = a._id;
        c.attributes._id = a._id;

        assert.isTrue(a.$equals(b));
        refute.isTrue(a.$equals(c));
        refute.isTrue(a.$equals(null));
      });

      test('create', async () => {
        const {Book} = v;
        const attrs = {title: 'testing'};

        const doc = await Book.create(attrs);
        refute.same(doc.changes, doc.attributes);
        assert.equals(doc.changes, {});

        attrs._id = doc._id;

        assert.same(doc.attributes,
                    await Book.findById(doc._id).attributes);
      });

      test('$partial in $isValid', async () => {
        const {Book} = v;
        const doc = await Book.create({_id: '123', title: 'testing'});
        doc.validate = async function () {
          await 1;
          v.changes = this.changes;
          v.original = Changes.original(v.changes);

          this.pages.baz = 1;
          this[error$] = v.errors;
        }
        doc.changes = {$partial: {title: ['$append', '.sfx'], pages: ['bar', 'abc']}};
        assert.isTrue(await doc.$isValid());

        assert.equals(doc.changes, {
          pages: {bar: 'abc', baz: 1}, $partial: {title: ['$append', '.sfx']}});

        assert.equals(v.changes, {title: 'testing.sfx', pages: {bar: 'abc', baz: 1}});
        assert.same(v.original, doc.changes);

        v.errors = {};
        doc.changes = {$partial: {title: ['$append', '.sfx'], pages: ['bar', 'abc']}};
        assert.isFalse(await doc.$isValid());

        assert.equals(doc.changes, {$partial: {title: ['$append', '.sfx'], pages: ['bar', 'abc']}});
      });

      test('$save with partial', async () => {
        const {Book} = v;
        const doc = await Book.create({_id: '123', title: 'testing'});

        doc.changes.$partial = {title: ['$append', ' 123']};
        await doc.$$save();

        assert.equals(doc.title, 'testing 123');
        assert.equals((await doc.$reload(true)).title, 'testing 123');
      });

      //;client-async
      test('$savePartial calls save', async () => {
        const {Book} = v;
        const doc = await Book.create({_id: '123', title: 'testing'});
        stub(doc, '$save').returns(Promise.resolve('answer'));
        const ans = await doc.$savePartial('title', ['$append', '.sfx'], 'pages', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {title: ['$append', '.sfx'], pages: ['bar', 'abc']}});
      });
      //;no-client-async

      test('$$savePartial calls save', async () => {
        const {Book} = v;
        const doc = await Book.create({_id: '123', title: 'testing'});
        const assertSave = stub(doc, '$save').withArgs('assert').returns(Promise.resolve(true));
        const ans = doc.$$savePartial('title', ['$append', '.sfx'], 'pages', ['bar', 'abc']);
        assert.isPromise(ans);
        assert.isTrue(await ans);

        assert.equals(doc.changes, {$partial: {title: ['$append', '.sfx'], pages: ['bar', 'abc']}});

        assert.calledOnce(assertSave);
        assert.same(assertSave.firstCall.thisValue, doc);
      });

      test('$hasChanged', () => {
        const {Book} = v;
        const doc = new Book({_id: 't123', pages: {one: 123, two: 'a string', three: true}});
        doc.changes = {$partial: {pages: [
          'two.$partial', ['$append', '.sfx'], 'one', null, 'four', [1, 2, 3]]}};

        assert.isTrue(doc.$hasChanged('pages'));
        assert.isFalse(doc.$hasChanged('bar'));

        assert.isTrue(doc.$hasChanged('pages', 'del'));
        assert.isFalse(doc.$hasChanged('bar', 'del'));

        assert.isTrue(doc.$hasChanged('pages', 'add'));
        assert.isFalse(doc.$hasChanged('bar', 'add'));

        assert.isTrue(doc.$hasChanged('bar', {bar: 123}));
        assert.isFalse(doc.$hasChanged('bar', {foo: 123}));
      });

      test('$fieldDiff', () => {
        const {Book} = v;
        const doc = new Book({_id: 't123', pages: {one: 123, two: 'a string', three: true}});
        doc.changes = {$partial: {pages: [
          'two.$partial', ['$append', '.sfx'], 'one', null, 'four', [1, 2, 3]]}};

        doc.validate = function () {
          assert.equals(doc.changes.pages, {
            two: 'a string.sfx', three: true, four: [1, 2, 3]});
          assert.equals(doc.$fieldDiff('pages'), {
            one: null,
            two: 'a string.sfx',
            four: [1, 2, 3],
          });
        }
        doc.$isValid();
      });

      test('duplicate id', async () => {
        const {Book} = v;
        const doc = await Book.create({_id: '123', title: 'testing'});

        try {
          await Book.create({_id: '123', title: 'testing2'});
          assert.fail('throw err');
        } catch (err) {
          if (isClient) {
            assert.equals(err.error, 400);
            assert.equals(err.reason, {_id: [['not_unique']]});
          } else {
            assert.equals(err.error, 409);
            assert.equals(err.message, m(/duplicate key/));
          }
        }
      });

      test('$reload on removed doc', async () => {
        const {Book} = v;
        const doc = await Book.create({title: 'old'});

        await doc.$remove();

        assert.same(await doc.$reload(true), doc);

        assert.equals(doc.attributes, {});
      });

      test('$clearChanges', () => {
        const {Book} = v;
        const doc = new Book({_id: 't1', title: 'foo'});

        const changes = doc.changes;
        doc.$clearChanges();

        assert.same(doc.changes, changes);

        doc.changes.title = 'bar';

        doc.$clearChanges();

        refute.same(doc.changes, changes);

        assert(util.isObjEmpty(doc.changes));
      });

      test('update', async () => {
        const {Book} = v;
        const doc = await Book.create({title: 'old'});

        isClient && spy(session, 'rpc');

        doc.title = 'new';
        await doc.$save();
        assert.same(doc.title, 'new');

        doc.$reload();
        assert.same(doc.title, 'new');
        assert.equals(doc.changes, {});

        assert.same(doc.attributes, await Book
                    .findById(doc._id).attributes);

        if (isClient) {
          assert.calledOnceWith(session.rpc, 'save', 'Book', doc._id, {title: 'new'});
        }
      });

      test('build', async () => {
        /**
         * Build a new model. Does not copy _id from attributes.
         */
        api.method();
        const {Book} = v;
        //[
        const doc = await Book.create();
        const copy = Book.build(doc.attributes);

        refute.same(doc.attributes, copy.changes);
        assert.same(doc.title, copy.title);

        assert.equals(copy._id, null);
        assert.equals(copy.changes._id, null);
        //]
      });

      test('setFields', () => {
        const {Book} = v;
        Book.defineFields({a: 'text', d: 'text', notme: 'text', _version: 'number'});
        const sut = new Book();

        const result = sut.$setFields(['a', 'd', 'notdefined', '_id', '_version'], {
          a: 'aa', d: 'dd', notdefined: 'set', notme: 'nm', _id: 'noset', _version: 5,
        });

        assert.same(result, sut);

        assert.equals(sut.changes, {a: 'aa', d: 'dd'});

        assert.same(sut.notdefined, 'set');
      });

      test('inspect$', () => {
        const {Book} = v;
        const doc = new Book({_id: 'id123', title: 'Oasis'});
        assert.equals(doc[inspect$](), 'Model.Book("id123", "Oasis")');
      });

      test('toId', () => {
        const {Book} = v;
        const doc = new Book({_id: 'theId'});

        assert.same(Book.toId(doc), 'theId');
        assert.same(Book.toId('astring'), 'astring');
      });

      test('toDoc', () => {
        const {Book} = v;
        const doc = new Book({_id: 'theId'});

        stub(Book, 'findById', function (id) {
          return 'found ' + id;
        });

        assert.same(Book.toDoc(doc)._id, 'theId');
        assert.same(Book.toDoc('astring'), 'found astring');
      });
    });
  });
});
