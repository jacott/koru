define(function (require, exports, module) {
  /**
   * The base class for all models
   **/
  const koru     = require('koru');
  const Changes  = require('koru/changes');
  const Model    = require('koru/model');
  const dbBroker = require('koru/model/db-broker');
  const session  = require('koru/session');
  const api      = require('koru/test/api');
  const TH       = require('./test-helper');

  const val       = require('./validation');

  const {stub, spy, onEnd, intercept, util} = TH;

  const BaseModel = require('./base-model');
  let v = null;

  val.register(module, {required: require('./validators/required-validator')});

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      Model._destroyModel('Book', 'drop');
      v = null;
    },


    'with Book example': {
      setUp() {
        class Book extends BaseModel {
          authorize() {}
        }
        Book.define({
          name: 'Book',
          fields: {name: 'text', foo: 'jsonb', age: 'number'}
        });
        v.Book = Book;
        v.exampleWithBook = func => {
          api.example("class Book extends BaseModel {}\n\n");
          api.exampleCont(func);
        };
      },

      "test onChange"() {
        /**
         * Observe changes to model records.
         *
         * @param callback is called with the arguments `(now, undo, [flag])`
         *
         * * if record was added: `now` will be a model instance and was
         * will be `null`.

         * * if record was changed: `now` will be a model instance with the changes and `undo`
         * will be a change object that will undo the change.

         * * if record was removed: `now` will be null and `undo` will be a model instance before
         * the remove.

         * * `flag` is only present on client and a truthy value indicates change was not a
         * simulation.

         * @return contains a stop method to stop observering
         **/
        const {Book} = v;
        intercept(Book, 'onChange', api.custom(Book.onChange));

        v.exampleWithBook(_=>{
          onEnd(Book.onChange(v.oc = stub()));
          const ondra = Book.create({_id: 'm123', name: 'Ondra', age: 21});
          const matchOndra = TH.match.field('_id', ondra._id);
          assert.calledWith(v.oc, ondra, null);


          ondra.$update('age', 22);
          assert.calledWith(v.oc, matchOndra, {age: 21});

          ondra.$remove();
          assert.calledWith(v.oc, null, matchOndra);
        });
      },

      "test remote."() {
        /**
         * Define multiple Remote updating Procedure calls prefixed by model's
         * name.
         **/
        const {Book} = v;
        api.method('remote');
        v.exampleWithBook(_=>{
          Book.remote({
            move() {},
            expire() {},
          });
        });

        assert(session.isRpc('Book.move'));
        refute(session.isRpcGet('Book.move'));

        assert(session.isRpc('Book.expire'));
      },

      "test remoteGet"() {
        /**
         * Define multiple Remote inquiry Procedure calls prefixed by
         * model's name.
         **/
        const {Book} = v;
        api.method('remoteGet');
        v.exampleWithBook(_=>{
          Book.remoteGet({
            list() {},
            show() {},
          });
        });

        assert(session.isRpc('Book.list'));
        assert(session.isRpcGet('Book.list'));

        assert(session.isRpcGet('Book.show'));
      },

      "test accessor"() {
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
      },

      "test classMethods"() {
        const {Book} = v;
        const doc = Book.build();
        assert.same(doc.constructor, doc.classMethods);
      },

      "test _id"() {
        const {Book} = v;
        assert.equals(Book.$fields._id, {type: 'id'});

        const doc = new Book({_id: "attrId"});

        assert.same(doc._id, "attrId");

        doc.changes._id = "chgId";
        assert.same(doc._id, "attrId");


        doc.attributes._id = null;
        assert.same(doc._id, "chgId");
      },

      "test exists"() {
        const {Book} = v;
        const doc = Book.create({name: 'foo'});

        assert.isTrue(Book.exists(doc._id));

        assert.isFalse(Book.exists('bad'));
      },

      "test query"() {
        const {Book} = v;
        const query = Book.query;

        assert.same(query.model, Book);
      },

      "test $onThis"() {
        const {Book} = v;
        const sut = Book.create();

        const query = sut.$onThis;

        assert.same(query.model, Book);
        assert.same(query.singleId, sut._id);
      },

      "test where"() {
        const {Book} = v;
        const query = Book.where('t1', 123);

        assert.same(query.model, Book);
        assert.equals(query._wheres, {t1: 123});
      },

      "test findById"() {
        const {Book} = v;
        const doc = Book.create({foo: {bar: {baz: 'orig'}}});

        assert[isClient ? 'same' : 'equals'](Book.findById(doc._id).attributes, doc.attributes);
      },

      "test findAttrsById"() {
        const {Book} = v;
        const doc = Book.create({foo: {bar: {baz: 'orig'}}});

        const attrs = Book.findAttrsById(doc._id);
        assert.same(attrs, Book.findById(doc._id).attributes);
      },

      "test findBy."() {
        const {Book} = v;
        const doc = Book.create({name: 'Sam', foo: 'bar'});

        assert[isClient ? 'same' : 'equals'](Book.findBy('foo', 'bar')
                                             .attributes, doc.attributes);
      },

      "test validator passing function"() {
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
      },

      "test withChanges on objects"() {
        /**
         * Return a doc representing this doc with the supplied changes
         * staged against it such that calling doc.$save will apply the changes.
         *
         * If this method is called again with the same changes object
         * then a cached version of the before doc is returned.
         */

        const {Book} = v;
        Book.defineFields({queen: 'text'});

        const doc = new Book({
          _id: "123", foo: {bar: {baz: 'new val', buzz: 5}, fnord: {a: 1}}});

        assert.same(doc.$withChanges(), null);


        let was = {$partial: {
          foo: [
            "bar.baz.$partial", ['$match', 'new val', '$patch', [0,3,"orig"]],
            "bar.buzz", 2,
            'fnord.a', 2],
          queen: ['$replace', 'Mary'],
        }};
        let old = doc.$withChanges(was);

        assert.same(old.foo.bar.baz, "orig val");
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, "Mary");

        assert.same(doc.foo.bar.baz, 'new val');
        assert.same(doc.foo.bar.buzz, 5);
        assert.same(doc.foo.fnord.a, 1);

        assert.same(doc.$withChanges(was), old);

        was = {$partial: {
          foo: [
            "bar.baz", null,
            "bar.buzz", 2,
            'fnord.a', 2],
          queen: ['$replace', null],
        }};

        old = doc.$withChanges(was);

        assert.same(old.foo.bar.baz, undefined);
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, undefined);
      },


      "test $asChanges"() {
        /**
         * Use the {beforeChange} keys to extract the new values.
         *
         * @returns new hash of extracted values.
         */
        const {Book} = v;
        const beforeChange = {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}};
        const doc = new Book({_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});

        const changes = doc.$asChanges(beforeChange);

        assert.equals(changes, {a: 2, b: null, c: null, e: [1, {f: 69}]});

        // should not alter passed in arguments
        assert.equals(beforeChange, {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}});
        assert.equals(doc.attributes, {_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});
      },

      "test change"() {
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
      },

      "test can override and save invalid doc"() {
        const {Book} = v;
        Book.defineFields({bar: {type: 'text', required: true}});
        const foo = Book.build({bar: null});

        spy(foo, '$isValid');

        foo.$save('force');

        assert.called(foo.$isValid); // insure validation methods were run

        assert(Book.findById(foo._id));
      },

      "test must be valid save "() {
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
      },

      'test timestamps'() {
        const {Book} = v;
        Book.defineFields({createdAt: 'auto_timestamp', updatedAt: 'auto_timestamp',});

        assert.equals(Book.createTimestamps, {createdAt: true});
        assert.equals(Book.updateTimestamps, {updatedAt: true});

        v.now = Date.now()+1234;
        this.intercept(util, 'dateNow', ()=>v.now);

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

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        assert.same(+doc.updatedAt, v.now);
      },

      "belongs_to": {
        setUp() {
          v.Qux = Model.define('Qux').defineFields({name: 'text'});
          onEnd(function () {Model._destroyModel('Qux', 'drop')});
          v.qux = v.Qux.create({name: "qux"});
        },

        tearDown() {
          Model._destroyModel('Qux', 'drop');
        },

        "test belongs_to_dbId"() {
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
        },

        "test accessor"() {
          const {Book} = v;
          Book.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = Book.build();
          sut.qux_id = '';
          assert.same(sut.changes.qux_id, undefined);
        },

        "test belongs_to auto"() {
          const {Book} = v;
          Book.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = Book.build({qux_id: v.qux._id});

          const quxFind = spy(v.Qux, 'findById');

          assert.same(sut.qux.name, "qux");
          assert.same(sut.qux.name, "qux");
          assert.same(Book.$fields.qux_id.model, v.Qux);

          assert.calledOnce(quxFind);
        },

        "test belongs_to manual name"() {
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', modelName: 'Qux'}});

          const sut = Book.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        },

        "test belongs_to manual model"() {
          const {Book} = v;
          Book.defineFields({baz_id: {type: 'belongs_to', model: v.Qux}});

          const sut = Book.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        },
      },

      "test hasMany"() {
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

      },

      'test user_id_on_create'() {
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
      },

      "test field accessor false"() {
        const {Book} = v;
        Book.defineFields({fuzz: {type: 'text', accessor: false}});
        const doc = Book.build({fuzz: 'bar'});

        assert.same(doc.fuzz, undefined);
        assert.same(doc.changes.fuzz, 'bar');
        assert.same(Book.$fields.fuzz.accessor, false);
      },

      'test equality'() {
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
      },

      'test create'() {
        const {Book} = v;
        const attrs = {name: 'testing'};

        isClient && spy(session, "rpc");
        const doc = Book.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;

        assert[isClient ? 'same' : 'equals'](doc.attributes,
                                             Book.findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc, 'save', 'Book', null, {
            _id: doc._id, name: "testing"});
      },

      "test $partial in $isValid"() {
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        doc.validate = function () {
          v.changes = this.changes;
          v.original = Changes.original(v.changes);

          this.foo.baz = 1;
          this._errors = v.errors;
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
      },

      "test $savePartial"() {
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        stub(doc, '$save').returns('answer');
        const ans = doc.$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});
      },

      "test $$savePartial"() {
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});
        stub(doc, '$save').returns('answer');;
        const ans = doc.$$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});

        assert.calledWith(doc.$save, 'assert');
      },

      "test $fieldDiffs"() {
        const {Book} = v;
        const doc = new Book({_id: 't123', foo: {one: 123, two: 'a string', three: true}});
        doc.changes = {$partial: {foo: [
          'two.$partial', ['$append', '.sfx'], 'one', null, 'four', [1,2,3]]}};

        doc.validate = function () {
          assert.equals(doc.changes.foo, {
            two: 'a string.sfx', three: true, four: [1, 2, 3]});
          assert.equals(doc.$fieldDiffs('foo'), {
            one: null,
            two: 'a string.sfx',
            four: [1,2,3],
          });

        };
        doc.$isValid();
      },

      "test $fieldDiffsFrom"() {
        const {Book} = v;
        stub(Changes, 'fieldDiff').returns('success');
        const doc = new Book({_id: 't123', foo: 456});
        assert.equals(doc.$fieldDiffsFrom('foo', {undo: 123}), 'success');
        assert.calledWith(Changes.fieldDiff, 'foo', {undo: 123}, {_id: 't123', foo: 456});
      },

      "test duplicate id"() {
        const {Book} = v;
        const doc = Book.create({_id: '123', name: 'testing'});

        assert.exception(() => {
          Book.create({_id: '123', name: 'testing2'});
        });
      },

      "test $reload on removed doc"() {
        const {Book} = v;
        const doc = Book.create({name: 'old'});

        doc.$remove();

        assert.same(doc.$reload(), doc);

        assert.equals(doc.attributes, {});
      },

      "test $clearChanges"() {
        const {Book} = v;
        const doc = new Book({_id: 't1', name: 'foo'});

        const changes = doc.changes;
        doc.$clearChanges();

        assert.same(doc.changes, changes);

        doc.changes.name = 'bar';

        doc.$clearChanges();

        refute.same(doc.changes, changes);

        assert(util.isObjEmpty(doc.changes));
      },

      'test update'() {
        const {Book} = v;
        const doc = Book.create({name: 'old'});

        isClient && spy(session, "rpc");

        doc.name = 'new';
        doc.$save();
        assert.same(doc.name, 'new');

        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert[isClient ? 'same' : 'equals'](doc.attributes, Book
                                             .findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc,'save', 'Book', doc._id, {name: "new"});
      },

      'test build'() {
        const {Book} = v;
        const doc = Book.create();
        const copy = Book.build(doc.attributes);

        refute.same(doc.attributes, copy.changes);
        assert.same(doc.name, copy.name);

        assert.equals(copy._id, null);
        assert.equals(copy.changes._id, null);
      },

      'test setFields'() {
        const {Book} = v;
        Book.defineFields({a: 'text', d: 'text', notme: 'text', _version: 'number'});
        const sut = new Book();


        const result = sut.$setFields(['a','d','notdefined','_id', '_version'],{
          a: 'aa',d: 'dd', notdefined: 'set', notme: 'nm', _id: 'noset', _version: 5,
        });

        assert.same(result, sut);

        assert.equals(sut.changes,{a: 'aa',d: 'dd'});

        assert.same(sut.notdefined,'set');

      },

      "test $inspect"() {
        const {Book} = v;
        const doc = new Book({_id: 'id123', name: 'bar'});
        assert.equals(doc.$inspect(), '{Model: Book_id123 bar}');
      },

      "test toId"() {
        const {Book} = v;
        const doc = new Book({_id: 'theId'});

        assert.same(Book.toId(doc), 'theId');
        assert.same(Book.toId('astring'), 'astring');
      },

      "test toDoc"() {
        const {Book} = v;
        const doc = new Book({_id: 'theId'});


        stub(Book, 'findById', function (id) {
          return "found " + id;
        });


        assert.same(Book.toDoc(doc)._id, 'theId');
        assert.same(Book.toDoc('astring'), 'found astring');
      },
    },

    "test using a class"() {
      /**
       * Define and register a model.
       *
       * @param {Module} [module] needed to auto unload module when file changed

       * @param {string} [name] name of model. Defaults to derived from module name.

       * @param {object} [fields] call defineFields with fields

       * @returns the model
       **/
      api.method("define");

      stub(koru, 'onunload');

      const module = new TH.MockModule("book-server");

      api.example(() => {
        class Book extends BaseModel {
          foo() {return this.name;}
        }

        Book.define({
          module,
          fields: {name: 'text'},
        });

        assert.same(Model.Book, Book);
        assert.same(Book.modelName, 'Book');

        let tm = Book.create({name: 'my name'});

        assert.same(tm.foo(), 'my name');
      });

      const Book = Model.Book;

      assert.calledWith(koru.onunload, module, TH.match.func);

      koru.onunload.yield();

      refute(Model.Book);
    },



  });
});
