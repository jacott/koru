define((require, exports, module)=>{
  'use strict';
  /**
   * DocChange encapsulates a change to a {#koru/model/base-model} instance. Used with
   * {#koru/model/base-model.onChange} and other observe methods. The main properties are:
   *
   * * `type` is either "add", "chg", "del"

   * * `doc` is the document that has changed.

   * * `undo` is: "del" when `type` is "add", "add" when `type` is "del". When`type` is "chg" `undo` is
   * a [change](#koru/changes) object that will undo the change.

   * * `flag` is only present on client and a truthy value indicates change was not a
   * simulation. Some truthy values include: "fromServer", "idbLoad", "simComplete" and "stopped"

   * NOTE: DocChange should be treated immutable and not stored as it is recycled by koru. If you
   * need to mutate or store the change use {##clone}.
   **/
  const Changes         = require('koru/changes');
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {inspect$} = require('koru/symbols');

  const {stub, spy, onEnd, util} = TH;

  const DocChange = require('./doc-change');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let Book;
    before(()=>{
      Book = class extends BaseModel {
      };
      Book.define({
        name: 'Book',
        fields: {title: 'text', author: 'text', pages: 'number', index: 'object'}
      });
    });

    after(()=>{
      Model._destroyModel('Book', 'drop');
    });

    test("add", ()=>{
      /**
       * Create a model change representing an add.
       **/
      api.method();

      const doc = new Book({_id: 'book1', title: 'Animal Farm'});

      const change = DocChange.add(doc, 'serverUpdate');

      assert.isTrue(change.isAdd);
      assert.isFalse(change.isDelete);
      assert.isFalse(change.isChange);

      assert.same(change.type, 'add');
      assert.same(change.doc, doc);
      assert.same(change.undo, 'del');
      assert.same(change.flag, 'serverUpdate');
    });

    test("delete", ()=>{
      /**
       * Create a model change representing a delete.
       **/
      api.method();

      const doc = new Book({_id: 'book1', title: 'Animal Farm'});

      const change = DocChange.delete(doc, 'simComplete');

      assert.isTrue(change.isDelete);
      assert.isFalse(change.isAdd);
      assert.isFalse(change.isChange);

      assert.same(change.type, 'del');
      assert.same(change.doc, doc);
      assert.same(change.undo, 'add');
      assert.same(change.flag, 'simComplete');
    });

    test("change", ()=>{
      /**
       * Create a model change representing a change.
       **/
      api.method();

      const doc = new Book({_id: 'book1', title: 'Animal Farm'});

      const change = DocChange.change(doc, {title: 'Fanimal Arm'}, 'serverUpdate');

      assert.isTrue(change.isChange);
      assert.isFalse(change.isAdd);
      assert.isFalse(change.isDelete);

      assert.same(change.type, 'chg');
      assert.same(change.doc, doc);
      assert.equals(change.undo, {title: 'Fanimal Arm'});
      assert.same(change.flag, 'serverUpdate');
    });

    group("with change", ()=>{
      let change;

      beforeEach(()=>{
        change = DocChange.add(new Book({_id: 'book1', title: 'Animal Farm'}, {title: 'Fanimal Arm'}));
      });

      test("clone", ()=>{
        /**
         * Clone the change. This is a shallow copy of the change---doc and undo are assigned; not
         * copied.
         **/
        api.protoMethod();

        //[
        change = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm'}), {title: 'Fanimal Arm'});
        const copy = change.clone();
        refute.same(copy, change);
        assert.same(copy.doc, change.doc);
        assert.same(copy.undo, change.undo);

        assert.same(copy.was, change.was); // was is cached
        //]
      });

      test("was", ()=>{
        /**
         * Retrieve the doc with the `undo` set as changes.  See {#koru/model/base-model#$withChanges}
         **/
        api.protoProperty();

        //[
        const dc = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm'}), {title: 'Fanimal Arm'});
        const {was} = dc;
        assert.equals(was.title, 'Fanimal Arm');
        assert.equals(was.changes, {title: 'Fanimal Arm'});
        //]
      });

      test("changes", ()=>{
        /**
         * Retrieve the changes that were made to `doc`. See {#koru/model/base-model#$invertChanges}
         **/
        api.protoProperty();

        //[
        const dc = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm'}), {title: 'Fanimal Arm'});
        assert.equals(dc.changes, {title: 'Animal Farm'});
        //]
      });

      test("model", ()=>{
        /**
         * Retrieve the model of the `doc`.
         **/
        api.protoProperty();
        //[
        const {model} = change;
        assert.same(model, Book);
        //]
      });

      test("hasField", ()=>{
         /**
         * Test if a field has been changed.
         **/
        api.protoMethod();

        //[
        const dc = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm', pages: 112}), {title: 'Fanimal Arm'});
        assert.isTrue(dc.hasField('title'));
        assert.isFalse(dc.hasField('pages'));

        // does not need to be a Model document
        const add = DocChange.add({name: 'Simon'});
        assert.isTrue(add.hasField('name'));
        assert.isFalse(add.hasField('location'));

        assert.isTrue(DocChange.delete({name: 'Simon'}).hasField('name'));

        const change = DocChange.change({name: 'Simon', location: 'home'}, {location: 'work'});
        assert.isFalse(change.hasField('name'));
        assert.isTrue(change.hasField('location'));
        //]
      });

      test("hasSomeFields", ()=>{
        /**
         * Test if any of the `fields` have been changed
         **/
         api.protoMethod();

        //[
        const dc = DocChange.change(
          new Book({
            _id: 'book1',
            title: 'Animal Farm',
            Author: 'George Orwell',
            pages: 112,
          }), {title: 'Fanimal Arm', pages: 432});
        assert.isTrue(dc.hasSomeFields('author', 'title'));
        assert.isTrue(dc.hasSomeFields('pages', 'title'));
        assert.isTrue(dc.hasSomeFields('author', 'pages'));
        assert.isFalse(dc.hasSomeFields('author'));
        assert.isFalse(dc.hasSomeFields('author', 'index'));
        //]
      });

      test("subDocKeys", ()=>{
        /**
         * Create a iterator over the property names for each property that is different between two
         * objects.

         **/
        api.protoMethod();

        //[
        const book = new Book({_id: 'book1', title: 'Animal Farm', index: {
          d: {dog: [123,234], donkey: [56,456]},
          p: {pig: [3, 34]}
        }});

        const undo = Changes.applyAll(book.attributes, {index: {
          d: {dog: [123,234]},
          h: {horse: [23,344]},
          p: {pig: [3, 34]},
        }});

        change = DocChange.change(book, undo);

        assert.equals(Array.from(change.subDocKeys('index')).sort(), ['d', 'h']);
        //]

        change._set(book, {index: {g: false}});
        assert.equals(Array.from(change.subDocKeys('index')).sort(), ['d', 'g', 'h', 'p']);

        change._set(book, {$partial: {index: ['$replace', null]}});
        assert.equals(Array.from(change.subDocKeys('index')).sort(), ['d', 'h', 'p']);

        change._set(book, {foo: {a: 1, b: 2}});
        assert.equals(Array.from(change.subDocKeys('foo')).sort(), ['a', 'b']);

        assert.equals(Array.from(
          DocChange.change(book, {}).subDocKeys('index')
        ).sort(), ['d', 'h', 'p']);

        assert.equals(Array.from(
          DocChange.change(book, {$partial: {title: null}}).subDocKeys('index')
        ).sort(), []);
      });

      group("subDocs", ()=>{
        /**
         * Create a iterator over the `DocChange`s for each property that is different between two
         * objects
         **/

        const map = (iter)=> {
          const ans = [];
          for (const dc of iter)
            ans.push(dc.clone());
          return ans.sort((a, b)=>{
            a = a._id; b = b._id;
            return a === b ? 0 : a < b ? -1 : 1;
          });
        };

        test("example", ()=>{
          api.protoMethod();
          //[
          const book = new Book({_id: 'book1', title: 'Animal Farm', index: {
            d: {dog: [123,234], donkey: [56,456]},
            p: {pig: [3, 34]}
          }});
          const undo = Changes.applyAll(book.attributes, {index: {
            d: {dog: [123,234], deer: [34]},
            h: {horse: [23,344]},
            p: {pig: [3, 34]},
          }});

          change = DocChange.change(book, undo);

          let count = 0;
          for (const dc of change.subDocs('index')) {
            if (dc._id === 'd') {
              ++count;
              assert.isTrue(dc.isChange);
              assert.same(dc.doc, book.index.d);
              assert.equals(dc.undo, {$partial: {
                deer: null,
                donkey: ['$replace', [56, 456]],
              }});
            } else {
              ++count;
              assert.same(dc._id, 'h');
              assert.isTrue(dc.isAdd);
              assert.same(dc.doc, book.index.h);
            }
          }
          assert.same(count, 2);
          //]

          change._set(book, {index: {g: false}});

          let ans, dc;

          ans = map(change.subDocs('index'));
          assert.equals(ans.map(dc => dc._id), ['d', 'g', 'h', 'p']);
          assert.equals(ans.map(dc => dc.type), ['add', 'del', 'add', 'add']);
          assert.equals(ans.map(dc => dc.doc), [
            {dog: [123, 234], deer: [34]}, false, {horse: [23, 344]}, {pig: [3, 34]}]);

          change._set(book, {$partial: {index: ['$replace', null]}});

          ans = map(change.subDocs('index'));
          assert.equals(ans.map(dc => dc._id), ['d', 'h', 'p']);
          assert.equals(ans.map(dc => dc.type), ['add', 'add', 'add']);
          assert.equals(ans.map(dc => dc.doc), [
            {dog: [123, 234], deer: [34]}, {horse: [23, 344]}, {pig: [3, 34]}]);

          change._set(book, {foo: {a: 1, b: 2}});
          ans = map(change.subDocs('foo'));
          assert.equals(ans.map(dc => dc._id), ['a', 'b']);
          assert.equals(ans.map(dc => dc.type), ['del', 'del']);
          assert.equals(ans.map(dc => dc.doc), [1, 2]);

          change._set(book, {$partial: {index: ['h', null]}});
          ans = map(change.subDocs('index')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['h']);
          assert.equals(dc.type, 'add');
          assert.equals(dc.doc, {horse: [23, 344]});

          change._set(book, {$partial: {index: ['h', {hog: [12]}]}});
          ans = map(change.subDocs('index')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['h']);
          assert.equals(dc.type, 'chg');
          assert.equals(dc.undo, {hog: [12]});


          change._set(book, {$partial: {index: ['h', {hog: [12]}]}});

          change._set(book, {$partial: {foo: ['a', 123]}});
          assert.equals(map(change.subDocs('index')), []);
          ans = map(change.subDocs('foo')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['a']);
          assert.equals(dc.type, 'del');
          assert.equals(dc.doc, 123);
        });

        test("multipart partial", ()=>{
          const book = new Book({_id: 'book1', title: 'Animal Farm', index: {
            p: {words: {pig: {occurs: 158}, puppy: {occurs: 2}}}
          }});

          const undo = {$partial: {
            index: ['p.words.puppy.$partial', [
              'occurs', 4,
            ]]}};

          const change = DocChange.change(book, undo);

          let ans, dc;
          ans = map(change.subDocs('index')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['p']);
          assert.equals(dc.type, 'chg');
          assert.equals(dc.doc, {words: {pig: {occurs: 158}, puppy: {occurs: 2}}});
          assert.equals(dc.undo, {$partial: {words: ['puppy.$partial', ['occurs', 4]]}});

          ans = map(dc.subDocs('words')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['puppy']);
          assert.equals(dc.type, 'chg');
          assert.equals(dc.doc, {occurs: 2});
          assert.equals(dc.undo, {$partial: {occurs: 4}});
        });

        test("nested", ()=>{
          const book = new Book({_id: 'book1', title: 'Animal Farm', index: {
            p: {words: {pig: {occurs: 158}, puppy: {occurs: 2}}}
          }});

          const undo = {$partial: {
            index: ['p.$partial', [
              'words.$partial', [
                'puppy', null,
                'pig.$partial', ['occurs', 34]
              ]]]}};

          const change = DocChange.change(book, undo);

          let ans, dc;
          ans = map(change.subDocs('index')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['p']);
          assert.equals(dc.type, 'chg');

          assert.equals(dc.doc, {words: {pig: {occurs: 158}, puppy: {occurs: 2}}});
          assert.equals(dc.undo, {$partial: {words: [
            'puppy', null, 'pig.$partial', ['occurs', 34]]}});

          ans = map(dc.subDocs('words'));
          assert.equals(ans.map(dc => dc._id), ['pig', 'puppy']);
          assert.equals(ans.map(dc => dc.type), ['chg', 'add']);
          assert.equals(ans.map(dc => dc.doc), [
            {occurs: 158}, {occurs: 2}]);
          assert.equals(ans.map(dc => dc.undo), [
            {$partial: {occurs: 34}}, 'del']);
        });

        test("compond keys", ()=>{
          const book = new Book({_id: 'book1', title: 'Animal Farm', index: {
            p: {words: {pig: {syn: 'hog'}, puppy: {syn: 'dog'}}}
          }});

          const undo = {$partial: {index: [
            'p.words.pig.syn', 'pork', 'p.words.puppy.syn.$partial', ['$append', 'gy']]}};

          const change = DocChange.change(book, undo);

          let ans, dc;
          ans = map(change.subDocs('index')); dc = ans[0];
          assert.equals(ans.map(dc => dc._id), ['p']);
          assert.equals(dc.type, 'chg');

          assert.equals(dc.doc, {words: {pig: {syn: 'hog'}, puppy: {syn: 'dog'}}});
          assert.equals(dc.undo, {$partial: {words: [
            'pig.syn', 'pork',
            'puppy.syn.$partial', ['$append', 'gy'],
          ]}});

          ans = map(dc.subDocs('words'));
          assert.equals(ans.map(dc => dc._id), ['pig', 'puppy']);
          assert.equals(ans.map(dc => dc.type), ['chg', 'chg']);
          assert.equals(ans.map(dc => dc.doc), [
            {syn: 'hog'}, {syn: 'dog'}]);
          assert.equals(ans.map(dc => dc.undo), [
            {$partial: {syn: 'pork'}}, {$partial: {syn: ['$append', 'gy']}}]);
        });
      });

      test("inspect", ()=>{
        change = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm'}), {title: 'Fanimal Arm'});

        assert.equals(
          change[inspect$](),
          `DocChange.change(Model.Book("book1"), {title: 'Fanimal Arm'}, undefined)`);
      });

      test("read only type, doc, undo", ()=>{
        change = DocChange.change(
          new Book({_id: 'book1', title: 'Animal Farm'}), {title: 'Fanimal Arm'});

        ['type', 'doc', 'undo'].forEach(field =>{
          assert.exception(()=>{change[field] = null}, {message: 'illegal call'});
        });
      });

    });
  });
});
