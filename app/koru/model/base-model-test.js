define((require, exports, module)=>{
  /**
   * The base class for all models
   **/
  const koru            = require('koru');
  const Changes         = require('koru/changes');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const session         = require('koru/session');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');
  const val             = require('./validation');

  const {inspect$, error$} = require('koru/symbols');


  const {stub, spy, onEnd, util, intercept} = TH;

  const BaseModel = require('./base-model');

  val.register(module, {required: require('./validators/required-validator')});

  let v = {};


  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module();
    });

    afterEach(()=>{
      Model._destroyModel('Book', 'drop');
      v = {};
    });

    group("with Model", ()=>{
      beforeEach(()=>{
        class Book extends BaseModel {
          authorize() {}
        }
        Book.define({
          name: 'Book',
          fields: {name: 'text', foo: 'jsonb', pages: 'number'}
        });
        v.Book = Book;
        v.exampleWithBook = func => {
          api.example("class Book extends BaseModel {}\n\n");
          api.exampleCont(func);
        };
      });

      group("model lock", ()=>{
        test("nesting", ()=>{
          try {
            v.Book.lock("a", ()=>{
              try {
                v.Book.lock("a", ()=>{
                  assert.isTrue(v.Book.isLocked("a"));
                  throw new Error("catch me");
                });
              } catch(ex) {
                assert.isTrue(v.Book.isLocked("a"));
                throw ex;
              }
              assert.fail("should not reach here");
            });
          } catch (ex) {
            if (ex.message !== "catch me")
              throw ex;
          }

          assert.isFalse(v.Book.isLocked("a"));
        });

        test("Exception unlocks", ()=>{
          try {
            v.Book.lock("a", ()=>{
              assert.isTrue(v.Book.isLocked("a"));
              throw new Error("catch me");
            });
          } catch (ex) {
            if (ex.message !== "catch me")
              throw ex;
          }

          assert.isFalse(v.Book.isLocked("a"));
        });

        test("isLocked", ()=>{
          v.Book.lock("a", ()=>{
            v.isLocked_a = v.Book.isLocked("a");
            v.isLocked_b = v.Book.isLocked("b");
          });

          assert.isTrue(v.isLocked_a);
          assert.isFalse(v.isLocked_b);
          assert.isFalse(v.Book.isLocked("a"));
        });
      });

      test("nullToUndef", ()=>{
        const book = new v.Book();
        book.name = null;
        assert.same(book.name, undefined);
        assert.same(book.attributes.name, undefined);

        book.changes.name = null;
        assert.same(book.name, undefined);
      });

      test("onChange", ()=>{
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
        onEnd(Book.onChange(observer));

        const Oasis = Book.create({_id: 'm123', name: 'Oasis', pages: 425});
        const matchOasis = TH.match.field('_id', Oasis._id);
        assert.calledWith(observer, DocChange.add(Oasis));

        Oasis.$update('pages', 420);
        assert.calledWith(observer, DocChange.change(matchOasis, {pages: 425}));

        Oasis.$remove();
        assert.calledWith(observer, DocChange.delete(matchOasis));
        //]
      });

      test("remote", ()=>{
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

      test("remoteGet", ()=>{
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

      test("accessor", ()=>{
        const {Book} = v;
        Book.defineFields({
          starSign: {type: 'text', accessor: {get() {
            const ans = Book.getField(this, 'starSign');
            return ans === 'Gemini' ? 'Virgo' : ans;
          }}},
          luckyNumber: ({type: 'number', accessor: {set(value) {
            Book.setField(this, 'luckyNumber', value === 13 ? 7 : value);
          }}})
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

      test("classMethods", ()=>{
        const {Book} = v;
        const doc = Book.build();
        assert.same(doc.constructor, doc.classMethods);
      });

      test("_id", ()=>{
        const {Book} = v;
        assert.equals(Book.$fields._id, {type: 'id'});

        const doc = new Book({_id: "attrId"});

        assert.same(doc._id, "attrId");

        doc.changes._id = "chgId";
        assert.same(doc._id, "attrId");


        doc.attributes._id = null;
        assert.same(doc._id, "chgId");
      });

      test("exists", ()=>{
        const {Book} = v;
        const doc = Book.create({name: 'foo'});

        assert.isTrue(Book.exists(doc._id));

        assert.isFalse(Book.exists('bad'));
      });

      test("query", ()=>{
        const {Book} = v;
        const query = Book.query;

        assert.same(query.model, Book);
      });

      test("$onThis", ()=>{
        const {Book} = v;
        const sut = Book.create();

        const query = sut.$onThis;

        assert.same(query.model, Book);
        assert.same(query.singleId, sut._id);
      });

      test("where", ()=>{
        const {Book} = v;
        const query = Book.where('t1', 123);

        assert.same(query.model, Book);
        assert.equals(query._wheres, {t1: 123});
      });

      test("findById", ()=>{
        /**
         * Find a document by its `_id`. Returns the same document each time if called from same
         * thread.
         **/
        const {Book} = v;
        api.method();
        //[
        const doc = Book.create({name: 'Emma', pages: 342});

        assert.same(Book.findById(doc._id), doc);
        //]
      });

      test("findBy.", ()=>{
        const {Book} = v;
        const doc = Book.create({name: 'Sam', foo: 'bar'});

        assert.same(Book.findBy('foo', 'bar').attributes, doc.attributes);
      });

      test("validator passing function", ()=>{
        const {Book} = v;
        Book.defineFields({baz: {type: 'text', required(field, options) {
          assert.same(this, doc);
          assert.same(field, 'baz');
          assert.same(options.type, 'text');
          return v.answer;
        }}});

        const doc = Book.build({baz: ''});

        v.answer = false;
        assert(doc.$isValid());

        v.answer = true;
        refute(doc.$isValid());
      });

      test("$withChanges", ()=>{
        /**
         * Return a doc representing this doc with the supplied changes
         * staged against it such that calling doc.$save will apply the changes.
         *
         * If this method is called again with the same changes object
         * then a cached version of the before doc is returned.
         */
        api.protoMethod();

        const {Book} = v;
        Book.defineFields({author: 'text'});
        //[

        const doc = new Book({
          _id: "123", foo: {bar: {baz: 'new val', buzz: 5}, fnord: {a: 1}}});

        assert.same(doc.$withChanges('add'), doc);
        assert.same(doc.$withChanges('del'), null);

        let undo = {$partial: {
          foo: [
            "bar.baz.$partial", ['$match', 'new val', '$patch', [0,3,"orig"]],
            "bar.buzz", 2,
            'fnord.a', 2],
          author: ['$replace', 'H. G. Wells'],
        }};
        let old = doc.$withChanges(undo);

        assert.same(old.foo.bar.baz, "orig val");
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.author, "H. G. Wells");

        assert.same(doc.foo.bar.baz, 'new val');
        assert.same(doc.foo.bar.buzz, 5);
        assert.same(doc.foo.fnord.a, 1);

        assert.same(doc.$withChanges(undo), old);

        old = doc.$withChanges({$partial: {
          foo: [
            "bar.baz", null,
            "bar.buzz", 2,
            'fnord.a', 2],
          author: ['$replace', null],
        }});

        assert.same(old.foo.bar.baz, undefined);
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.author, undefined);
        //]
      });


      test("$invertChanges", ()=>{
        /**
         * Use the {beforeChange} keys to extract the new values. See {#koru/changes.extractChangeKeys}
         *
         * @returns new hash of extracted values.
         */
        const {Book} = v;
        const beforeChange = {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}};
        const doc = new Book({_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});

        const changes = doc.$invertChanges(beforeChange);

        assert.equals(changes, {a: 2, b: null, c: null, e: [1, {f: 69}]});

        // should not alter passed in arguments
        assert.equals(beforeChange, {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}});
        assert.equals(doc.attributes, {_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});
      });

      test("change", ()=>{
        const {Book} = v;
        const doc = Book.create({foo: {bar: {baz: 'orig'}}});

        doc.$change('foo').bar.baz = "new";

        const bar = doc.foo.bar;

        assert.equals(doc.changes, {foo: {bar: {baz: 'new'}}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});

        doc.$change('foo').fnord = 123;
        doc.$change('foo').bar.boo = "me too";


        assert.equals(bar, {baz: 'new', boo: "me too"});

        assert.equals(doc.changes, {foo: {bar: {baz: 'new', boo: "me too"}, fnord: 123}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});
      });

      test("can override and save invalid doc", ()=>{
        const {Book} = v;
        Book.defineFields({bar: {type: 'text', required: true}});
        const foo = Book.build({bar: null});

        spy(foo, '$isValid');

        foo.$save('force');

        assert.called(foo.$isValid); // insure validation methods were run

        assert(Book.findById(foo._id));
      });

      test("must be valid save ", ()=>{
        TH.noInfo();
        const {Book} = v;
        Book.defineFields({bar: {type: 'text', required: true}});
        const foo = Book.build();

        assert.invalidRequest(function () {
          foo.$$save();
        });

        foo.bar = 'okay';
        foo.$$save();

        assert.same(foo.$reload().bar, 'okay');
      });

      test("timestamps", ()=>{
        const {Book} = v;
        Book.defineFields({createdAt: 'auto_timestamp', updatedAt: 'auto_timestamp',});

        assert.equals(Book.createTimestamps, {createdAt: true});
        assert.equals(Book.updateTimestamps, {updatedAt: true});

        v.now = Date.now()+1234;
        intercept(util, 'dateNow', ()=>v.now);

        const doc = Book.create({name: 'testing'});

        assert(doc._id);

        assert.same(+doc.createdAt, v.now);

        const oldCreatedAt = v.now - 2000;

        doc.createdAt = oldCreatedAt;
        doc.updatedAt = oldCreatedAt;
        doc.$$save();

        doc.$reload();

        doc.name = 'changed';
        doc.$save();

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        refute.same(+doc.updatedAt, +oldCreatedAt);

        v.now += 4000;
        doc.$update({name: 'changed again'});

        doc.$reload(true);

        assert.same(+doc.createdAt, +oldCreatedAt);
        assert.same(+doc.updatedAt, v.now);
      });

      group("belongs_to", ()=>{
        beforeEach(()=>{
          v.Qux = Model.define('Qux').defineFields({name: 'text'});
          onEnd(function () {Model._destroyModel('Qux', 'drop')});
          v.qux = v.Qux.create({name: "qux"});
        });

        afterEach(()=>{
          Model._destroyModel('Qux', 'drop');
        });

        test("belongs_to_dbId", ()=>{
          const {Book} = v;
          Book.defineFields({
            qux_id: {type: 'belongs_to_dbId'},
            name: 'text',
          });

          const sut = Book.create({name: 'sam'});
          assert.equals(sut.$reload().attributes, {name: 'sam', _id: TH.match.any});
          assert.same(sut.qux_id, dbBroker.dbId);

          v.Qux.create({name: 'dbQux', _id: 'default'});

          assert.same(sut.qux.name, "dbQux");
        });

        test("accessor", ()=>{
          const {Book} = v;
          Book.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = Book.build();
          sut.qux_id = '';
          assert.same(sut.changes.qux_id, undefined);
        });

        test("belongs_to auto", ()=>{
          const {Book} = v;
          Book.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = Book.build({qux_id: v.qux._id});

          const quxFind = spy(v.Qux, 'findById');

          assert.same(sut.qux.name, "qux");
          assert.same(sut.qux.name, "qux");
          assert.same(Book.$fields.qux_id.model, v.Qux);

          assert.calledOnce(quxFind);
        });

        test("belongs_to manual name", ()=>{
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', modelName: 'Qux'}});

          const sut = Book.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        });

        test("belongs_to manual model", ()=>{
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', model: v.Qux}});

          const sut = Book.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        });
      });

      test("hasMany", ()=>{
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

      test("user_id_on_create", ()=>{
        const {Book} = v;
        v.User = Model.define('User');
        onEnd(function () {
          Model._destroyModel('User', 'drop');
        });
        Book.defineFields({user_id: 'user_id_on_create'});

        assert.equals(Book.userIds, { user_id: 'create' });

        TH.login("u1234", function () {
          const doc = Book.create({name: 'testing'});

          assert(doc._id);

          assert.same(doc.user_id, util.thread.userId);

          let id;
          session.rpc('save', 'Book', null, {_id: id = "123456", name: 'testing'} );
          assert.same(Book.findById(id).user_id, util.thread.userId);

          assert.same(Book.create({user_id: 'override'}).$reload().user_id, 'override');
        });
      });

      test("field accessor false", ()=>{
        const {Book} = v;
        Book.defineFields({fuzz: {type: 'text', accessor: false}});
        const doc = Book.build({fuzz: 'bar'});

        assert.same(doc.fuzz, undefined);
        assert.same(doc.changes.fuzz, 'bar');
        assert.same(Book.$fields.fuzz.accessor, false);
      });

      test("equality", ()=>{
        const {Book} = v;
        const OtherClass = Model.define('OtherClass'),
              a = new Book(),
              b = new Book(),
              c = new OtherClass();

        onEnd(function () {Model._destroyModel('OtherClass', 'drop')});

        refute.isTrue(a.$equals(b));

        a.attributes._id = "hello";

        refute.isTrue(a.$equals(b));

        b.attributes._id = a._id;
        c.attributes._id = a._id;

        assert.isTrue(a.$equals(b));
        refute.isTrue(a.$equals(c));
        refute.isTrue(a.$equals(null));
      });

      test("create", ()=>{
        const {Book} = v;
        const attrs = {name: 'testing'};

        isClient && spy(session, "rpc");
        const doc = Book.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;

        assert.same(doc.attributes,
                                             Book.findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc, 'save', 'Book', null, {
            _id: doc._id, name: "testing"});
      });

      test("$partial in $isValid", ()=>{
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        doc.validate = function () {
          v.changes = this.changes;
          v.original = Changes.original(v.changes);

          this.foo.baz = 1;
          this[error$] = v.errors;
        };
        doc.changes = {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}};
        assert.isTrue(doc.$isValid());

        assert.equals(doc.changes, {
          foo: {bar: 'abc', baz: 1}, $partial: {name: ['$append', '.sfx']}});

        assert.equals(v.changes, {name: 'testing.sfx', foo: {bar: 'abc', baz: 1}});
        assert.same(v.original, doc.changes);

        v.errors = {};
        doc.changes = {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}};
        assert.isFalse(doc.$isValid());

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});
      });

      test("$save with partial", ()=>{
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});

        doc.changes.$partial = {name: ['$append', ' 123']};
        doc.$$save();

        assert.equals(doc.name, 'testing 123');
        assert.equals(doc.$reload(true).name, 'testing 123');
      });

      test("$savePartial calls save", ()=>{
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        stub(doc, '$save').returns('answer');
        const ans = doc.$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});
      });

      test("$$savePartial calls save", ()=>{
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        const assertSave = stub(doc, '$save').withArgs('assert').returns(true);
        const ans = doc.$$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.same(ans, doc);

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});

        assert.calledOnce(assertSave);
        assert.same(assertSave.firstCall.thisValue, doc);
      });

      test("$hasChanged", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 't123', foo: {one: 123, two: 'a string', three: true}});
        doc.changes = {$partial: {foo: [
          'two.$partial', ['$append', '.sfx'], 'one', null, 'four', [1,2,3]]}};

        assert.isTrue(doc.$hasChanged('foo'));
        assert.isFalse(doc.$hasChanged('bar'));

        assert.isTrue(doc.$hasChanged('foo', 'del'));
        assert.isFalse(doc.$hasChanged('bar', 'del'));

        assert.isTrue(doc.$hasChanged('foo', 'add'));
        assert.isFalse(doc.$hasChanged('bar', 'add'));

        assert.isTrue(doc.$hasChanged('bar', {bar: 123}));
        assert.isFalse(doc.$hasChanged('bar', {foo: 123}));
      });

      test("$fieldDiff", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 't123', foo: {one: 123, two: 'a string', three: true}});
        doc.changes = {$partial: {foo: [
          'two.$partial', ['$append', '.sfx'], 'one', null, 'four', [1,2,3]]}};

        doc.validate = function () {
          assert.equals(doc.changes.foo, {
            two: 'a string.sfx', three: true, four: [1, 2, 3]});
          assert.equals(doc.$fieldDiff('foo'), {
            one: null,
            two: 'a string.sfx',
            four: [1,2,3],
          });

        };
        doc.$isValid();
      });

      test("duplicate id", ()=>{
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});

        assert.exception(() => {
          Book.create({_id: '123', name: 'testing2'});
        });
      });

      test("$reload on removed doc", ()=>{
        const {Book} = v;
        const doc = Book.create({name: 'old'});

        doc.$remove();

        assert.same(doc.$reload(true), doc);

        assert.equals(doc.attributes, {});
      });

      test("$clearChanges", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 't1', name: 'foo'});

        const changes = doc.changes;
        doc.$clearChanges();

        assert.same(doc.changes, changes);

        doc.changes.name = 'bar';

        doc.$clearChanges();

        refute.same(doc.changes, changes);

        assert(util.isObjEmpty(doc.changes));
      });

      test("update", ()=>{
        const {Book} = v;
        const doc = Book.create({name: 'old'});

        isClient && spy(session, "rpc");

        doc.name = 'new';
        doc.$save();
        assert.same(doc.name, 'new');

        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert.same(doc.attributes, Book
                                             .findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc,'save', 'Book', doc._id, {name: "new"});
      });

      test("build", ()=>{
        /**
         * Build a new model. Does not copy _id from attributes.
         */
        api.method();
        const {Book} = v;
        //[
        const doc = Book.create();
        const copy = Book.build(doc.attributes);

        refute.same(doc.attributes, copy.changes);
        assert.same(doc.name, copy.name);

        assert.equals(copy._id, null);
        assert.equals(copy.changes._id, null);
        //]
      });

      test("setFields", ()=>{
        const {Book} = v;
        Book.defineFields({a: 'text', d: 'text', notme: 'text', _version: 'number'});
        const sut = new Book();


        const result = sut.$setFields(['a','d','notdefined','_id', '_version'],{
          a: 'aa',d: 'dd', notdefined: 'set', notme: 'nm', _id: 'noset', _version: 5,
        });

        assert.same(result, sut);

        assert.equals(sut.changes,{a: 'aa',d: 'dd'});

        assert.same(sut.notdefined,'set');

      });

      test("inspect$", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 'id123', name: 'bar'});
        assert.equals(doc[inspect$](), 'Model.Book("id123", "bar")');
      });

      test("toId", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 'theId'});

        assert.same(Book.toId(doc), 'theId');
        assert.same(Book.toId('astring'), 'astring');
      });

      test("toDoc", ()=>{
        const {Book} = v;
        const doc = new Book({_id: 'theId'});


        stub(Book, 'findById', function (id) {
          return "found " + id;
        });


        assert.same(Book.toDoc(doc)._id, 'theId');
        assert.same(Book.toDoc('astring'), 'found astring');
      });
    });

    test("using a class", ()=>{
      /**
       * Define and register a model.
       *
       * @param {Module} [module] needed to auto unload module when file changed

       * @param {string} [name] name of model. Defaults to derived from module name.

       * @param {object} [fields] call defineFields with fields

       * @returns the model
       **/
      api.method("define");

      const module = new TH.MockModule("book-server");

      stub(module, 'onUnload');

      //[
      class Book extends BaseModel {
        foo() {return this.name;}
      }

      Book.define({
        module,
        fields: {name: 'text'},
      });

      assert.same(Model.Book, Book);
      assert.same(Book.modelName, 'Book');
      assert.same(Book._module, module);

      let tm = Book.create({name: 'my name'});

      assert.same(tm.foo(), 'my name');
      //]

      assert.calledWith(module.onUnload, TH.match.func);

      module.onUnload.yield();

      refute(Model.Book);
    });
  });
});
