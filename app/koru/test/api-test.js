define((require, exports, module)=>{
  /**
   * API is a semi-automatic API document generator. It uses
   * unit-tests to determine types and values at test time.

   *
   * Method document comments need to be inside the test method; not in the production code and not
   * outside the test method.

   *
   * Examples can be verbatim from the test method by surrounding the example between `//[` and
   * `//]` comments.
   **/
  const TH              = require('koru/test-helper');
  const Core            = require('koru/test/core');
  const util            = require('koru/util');
  const MainAPI         = require('./api');

  const {stub, spy, onEnd, match: m} = TH;

  const {inspect$} = require('koru/symbols');

  const ctx = module.ctx;
  const APIModule = ctx.modules['koru/test/api'];
  const TestModule = ctx.modules['koru/test/api-test'];


  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let API, v = {};
    beforeEach(()=>{
      test = TH.test;
      API = class extends MainAPI {};
      API.isRecord = true;
      API.reset();
      stub(ctx, 'exportsModule').withArgs(MainAPI).returns([APIModule]);
      MainAPI.module();
    });

    afterEach(()=>{
      v = {};
    });

    test("module", ()=>{
      /**
       * Initiate documentation of the module. Subsequent calls to API
       * methods will act of the given `module`.
       *
       * @param [subjectModule] defaults to the module corresponding
       * to the current test module.

       * @param {string} [subjectName] defaults to a hopefully reasonable name

       * @param {string} [initExample] code that can be used to initialize `subject`

       * @param {string} [initInstExample] code that can be used to initialize an instance of
       * `subject`
       **/
      MainAPI.method('module');

      API.module();
      if (MainAPI.isRecord) assert.calledWith(ctx.exportsModule, MainAPI);
      refute.same(API._moduleMap, MainAPI._moduleMap);
      refute.same(API._subjectMap, MainAPI._subjectMap);

      const api = API._moduleMap.get(APIModule);
      assert(api);
      assert.same(api.subject, MainAPI);
      assert.equals(API._subjectMap.get(MainAPI), [APIModule, null]);

      assert.same(API.instance.subjectName, 'API');


      const myHelper = {
        clean() {}
      };

      API.module({
        subjectModule: {id: 'myMod1', exports: myHelper},
        subjectName: 'myHelper',
        initExample: 'Init example',
        initInstExample: 'Init inst example',
      });

      assert.same(API._instance.constructor, API);
      assert.same(API._instance.initExample, 'Init example');
      assert.same(API._instance.initInstExample, 'Init inst example');


      class Book {
      }

      API.module({subjectModule: {id: 'myMod2', exports: Book}});

      assert.same(API.instance.subjectName, 'Book');
    });

    test("innerSubject", ()=>{
      /**
       * Document a subject within a module.
       *
       * @param subject either the actual subject or the property name
       * of the subject if accessible from the current subject
       * @param [subjectName] override the subject name
       * @param [options.info] property info line (if subject is a `string`). Alias 'intro'
       * @param [options.abstract] introduction to the subject. If abstract is a `function` then the
       * initial doc comment is used.
       * @param [options.initExample] code that can be used to initialize `subject`
       * @param [options.initInstExample] code that can be used to initialize an instance of
       * `subject`

       * @returns an API instance for the given `subject`. Subsequent
       * API calls should be made directly on this API instance and
       * **not** the API Class itself
       **/
      MainAPI.method('innerSubject');
      API.module();
      function abstract() {
        /**
         * An example abstract
         **/
      }
      const anythingApi = API.innerSubject(
        v.anything = {anything: 'is allowed'},
        'Anything can be documented', {
          initExample: `const init = {sample: 'code'};`,
          initInstExample: `const inst = initCode();`,
          abstract,
        });
      assert.same(anythingApi.propertyName, undefined);

      assert.same(anythingApi, API.valueToApi(v.anything));
      assert.same(anythingApi.moduleName, 'koru/test/api::Anything can be documented');
      assert.equals(anythingApi.initExample, `const init = {sample: 'code'};`);
      assert.equals(anythingApi.initInstExample, `const inst = initCode();`);
      assert.equals(anythingApi.abstract, 'An example abstract');

      MainAPI.example(() => {
        class Book {
          constructor() {this._chapters = [];}
          newChapter() {
            const chapter = new this.constructor
                  .Chapter(10);
            this._chapters.push(chapter);
            return chapter;
          }
        };
        Book.Chapter = class {
          constructor(startPage) {this.page = startPage;}
          goto() {return this.page;}
        };;

        API.module({
          subjectModule: {id: 'myMod1', exports: Book},
          subjectName: 'myHelper'});
        API.innerSubject('Chapter', null, {
          info: 'Chapter info',
        })
          .protoMethod('goto');

        const book = new Book();
        const chapter = book.newChapter();
        assert.same(chapter.goto(), 10);
      });

      API.done();
      MainAPI.done();

      const subjectApi = API.instance.innerSubjects.Chapter;

      assert.same(subjectApi.propertyName, 'Chapter');

      assert.match(subjectApi.subject.toString(), /startPage/);

      const matchSubject = ['F', TH.match(arg => arg.prototype.goto),
                            TH.match(/(constructor|function)\s*\(startPage\)/)];

      assert.equals(API.instance.properties, {
        Chapter: {
          info: 'Chapter info',
          value: matchSubject,
        }
      });


      assert.equals(subjectApi.protoMethods.goto, {
        intro: TH.match(/Document a subject within a module./),
        sig: TH.match(/goto\(\)/),
        subject: matchSubject,
        test: TH.test,
        calls: [[[], 10]],
      });
    });

    const commentExample = ()=>{
      //[
      let Iam = "example one";
      //]
      Iam = "outside an example";
      //[#
      Iam = "continuing example one";
      //]

      //[
      Iam = "example two";
      //]
    };

    test("example-comments", ()=>{
      /**
       * Alternately the special comments `//[`, `//[#` and `//]` can be used instead. `//[` records
       * a new example, `//[#` continues an example and `//]` stops recording.
       *
       * {{example:0}}
       **/
      const topic = MainAPI.topic();

      topic.addBody(MainAPI.functionBody(commentExample));
      MainAPI.done();

      assert(true);
    });

    test("example", ()=>{
      /**
       * Run a section of as an example of a method call.
       *
       * Use `API.exampleCont(body)` to continue an example.
       *
       * {{topic:example-comments}}
       *
       * @returns {object|primitive} the result of running body
       **/
      MainAPI.method('example');

      MainAPI.example(() => {
        class Color {
          static define(name, value) {
            return this.colors[name] = value;
          }
          // ...
        }
        Color.colors = {};

        API.module({subjectModule: {id: 'myMod', exports: Color}});
        API.method('define');

        API.example('const foo = "can put any valid code here";');
        API.example(() => {
          // this body of code is executed
          Color.define('red', '#f00');
          Color.define('blue', '#00f');
        });
        API.exampleCont("// comment\n");
        API.exampleCont(() => {  assert.same(Color.colors.red, '#f00');});
        assert.same(API.example(() => {return Color.define('green', '#0f0')}), '#0f0');
      });

      MainAPI.done();
      assert.same(MainAPI._instance.target, void 0);

      assert.equals(API.instance.methods.define, {
        test: TH.test,
        sig: TH.match.any,
        intro: TH.match.any,
        subject: TH.match.any,
        calls: [{
          body: 'const foo = "can put any valid code here";',
          calls: [],
        }, {
          body:
          `// this body of code is executed
Color.define('red', '#f00');
Color.define('blue', '#00f');
// comment
assert.same(Color.colors.red, '#f00');`,
          calls: [[
            ['red', '#f00'], '#f00'
          ],[
            ['blue', '#00f'], '#00f'
          ]]
        }, {
          body: `return Color.define('green', '#0f0')`, calls: [[['green', '#0f0'], '#0f0']]
        }]
      });
    });

    group("multi tests on a subject", ()=>{
      const foo = {bar: a => "b"};
      let result;
      before(()=>{
        API.module({subjectModule: {id: 'myMod', exports: foo}});
      });

      after(()=>{
        assert.equals(result.calls, [
          {body: 'foo.bar(1);\n', calls: [[[1], 'b']]},
          {body: 'foo.bar(2);\n', calls: [[[2], 'b']]},
        ]);
      });

      test("test 1", ()=>{
        API.method('bar');

        //[
        foo.bar(1);
        //]

        API.done();
        assert(result = API.instance.methods.bar);
      });

      test("test 2", ()=>{
        API.method('bar');

        //[
        foo.bar(2);
        //]

        API.done();
        assert(result = API.instance.methods.bar);
      });
    });

    test("strange example", ()=>{
      const foo = {bar() {}};

      API.module({subjectModule: {id: 'myMod', exports: foo}});
      API.method('bar');
      API.example(() =>{
        foo.bar(1, doc => {
          return false;
        });
      });
      assert.equals(API.instance.methods.bar.calls[0].body.trim(), `foo.bar(1, doc => {
  return false;
});`);
    });

    test("topic", ()=>{
      /**
       * Record a test as a topic for insertion into a method document comment using the syntax
       * `{{{topic:[<path>:]<topicName>}}`

       * @param {string} [options.name] override the name of the topic. Defaults to test name.

       * @param {function|string} [options.intro] the narrative for the topic being
       * documented. Defaults to test comment.

       **/
      MainAPI.method('topic');

      let mockTest;
      const test = (name, body)=>{
        const orig = Core.test;
        try {
          mockTest = Core.test = {
            mode: 'running',
            name: "library test "+name+".",
            body,
            onEnd: stub(),
          };
          body();
        } finally {
          Core.test = orig;
          mockTest.onEnd.yield();
        }
      };

      const returnBook = stub();
      const book = {borrow: ()=>({book, returnBook})};

      class Library {
        static findBook(name) {
          return book;
        }
      }

      MainAPI.example(() => {
        API.module({subjectModule: {id: 'myMod', exports: Library}});
        test("borrow book", ()=>{
          /**
           * In order to borrow a book it needs to be found in the library; then call the borrow
           * method on it:
           *
           * {{example:0}}
           *
           * When the book has been read it can be returned to the library:
           *
           * {{example:1}}
           **/
          API.topic();

          let receipt;
          //[
          const book = Library.findBook("Dune");
          if (book !== void 0)
            receipt = book.borrow();
          //]

          //[
          receipt.returnBook();
          //]

          assert.equals(receipt.book, Library.findBook("Dune"));
        });
      });

      API.done();

      assert.equals(API.instance.topics['borrow book'], {
        intro: m(/In order.*found in the library/),
        calls: [{
          body: m(/^const book = Library.findBook/),
          calls: [],
        }, {
          body: m(b => b.trim() === 'receipt.returnBook();'),
          calls: [],
        }],
        test: mockTest,
      });

      const {target} = MainAPI._instance;
      const {calls} = target;
      target.calls = [];
      MainAPI.done();
      target.calls = calls;
    });

    test("comment", ()=>{
      /**
       * Add a comment before the next example
       **/
      MainAPI.method('comment');

      MainAPI.example(() => {
        class Excercise {
          static register(name, minutes) {}
          begin() {}
        }

        API.module({subjectModule: {id: 'myMod', exports: Excercise}});
        API.method('register');

        API.comment('Optionally set the default duration');
        Excercise.register('Jogging', 5); // This call gets the comment
        Excercise.register('Skipping'); // This call get no comment
      });

      API.done();

      assert.equals(API.instance.methods.register, {
        test,
        sig: TH.match.any,
        intro: TH.match.any,
        subject: TH.match.any,
        calls: [[
          ['Jogging', 5], undefined, 'Optionally set the default duration'
        ],[
          ['Skipping'], undefined
        ]]
      });
    });

    group("property", ()=>{
      beforeEach(()=>{
        MainAPI.method('property');
      });

      test("value property", ()=>{
        /**
         * Document a property of the current subject. The property
         * can be either plain value or a get/set function.

         * @param [options.info] description of property. Defaults to the current test's doc
         * comment.  When `function` should return an info `string`. The info `string` can contain
         * `${value}` which will be substituted with a description of the properties value. Alias
         * `intro`
         * @param [options.properties] document child properties
         *
         **/
        //[
        const defaults = {
          logger() {},
          width: 800,
          height: 600,
          theme: {
            name: 'light',
            primaryColor: '#aaf'
          }
        };
        let name, logger;

        API.module({subjectModule: {id: 'myMod', exports: defaults}, subjectName: 'defaults'});
        API.property('theme', {
          info: 'The default theme',
          properties: {
              name: value => {
                name = value;
                return 'The theme name is ${value}';
              },
            primaryColor: 'The primary color is ${value}'
          },
        });
        assert.same(name, 'light');

        API.property('logger', value => {
          logger = value;
            return 'The default logger is ${value}';
        });

        assert.same(logger, defaults.logger);
        //]

        MainAPI.comment("If no info supplied then the test description is used");
        API.property('width');

        API.done();

        assert.equals(API.instance.properties, {
          theme: {
            info: 'The default theme',
            value: ['P', defaults.theme],
            properties: {
              name: {
                info: 'The theme name is ${value}',
                value: name,
              },
              primaryColor: {
                info: 'The primary color is ${value}',
                value: '#aaf',
              },
            },
          },
          logger: {
            info: 'The default logger is ${value}',
            value: ['F', logger, TH.match(/(logger|function)/)]
          },
          width: {
            info: TH.match(/Document a property/),
            value: 800,
          }
        });
      });

      test("get/set property", ()=>{
        MainAPI.example(() => {
          const book = {
            get title() {return this._title;},
            set title(value) {this._title = value;},
          };

          API.module({
            subjectModule: {id: 'myMod', exports: book},
            subjectName: 'Book'});
          API.property('title', {
            info: 'Get/set the book title',
          });
          API.comment('sets title');
          book.title = 'Room';
          assert.same(book._title, 'Room');
          assert.same(book.title, book._title);
        });

        assert.equals(API.instance.properties, {
          title: {
            info: 'Get/set the book title',
            calls: [
              [['Room'], undefined, 'sets title'],
              [[], 'Room'],
            ],
          },
        });
      });

      test("doc comment", ()=>{
        /**
         * The number of pages in the book
         **/
        const testCase = (opts)=>{for (const i in opts) opts[i]()};
        //[
        testCase({"test pageCount"() {
          /**
           * The number of pages in the book
           **/
          const book = {pageCount: 400};
          API.module({
            subjectModule: {id: 'myMod', exports: book},
            subjectName: 'Book'});
          API.property('pageCount'); // extracts the comment above
          assert.equals(book.pageCount, 400);
        }});
        //]
        assert.equals(API.instance.properties, {
          pageCount: {
            info: 'The number of pages in the book',
            value: 400,
          },
        });
      });
    });

    test("protoProperty", ()=>{
      /**
       * Document a property of the current subject's prototype. The
       * property can be either plain value or a get/set function.
       *
       * See {#.property}

       * @param name the property to document

       * @param [options] see {#.property}

       * @param [subject] defaults to subject.prototype
       **/
      MainAPI.method('protoProperty');
      MainAPI.example(() => {
        class Book {
          constructor(title) {
            this._title = title;
          }

          get title() {return this._title}
        }

        API.module({subjectModule: {id: 'myMod', exports: Book}});
        const book = new Book("Jungle Book", 504);
        API.protoProperty('title', {info: 'The title'});
        book.bookMark = 100;
        API.protoProperty('bookMark', {info: 'record page'}, book);
        assert.same(book.title, "Jungle Book");
      });

      API.done();
    });

    test("class", ()=>{
      /**
       * Document `constructor` for the current subject.
       *
       * @param [options.sig] override the call signature. Sig is used as the subject if it
       * is a function.
       * @param [options.intro] the abstract for the method being
       * documented. Defaults to test comment.
       *
       * @returns a ProxyClass which is to be used instead of `Class`

       **/
      MainAPI.method();

      class Book {
        constructor(title) {
          this.title = title;
        }
        [inspect$]() {return `Book("${this.title}")`;}
      }

      API.module({subjectModule: {id: 'myMod', exports: Book}});

      {
        //[
        const Book = API.class();

        const book = new Book('There and back again');

        assert.same(book.title, 'There and back again');
        //]


        assert.equals(API.instance.newInstance, {
          test,
          sig: TH.match(/(constructor|function Book)\(title\)/),
          intro: TH.match(/Document `constructor`/),
          calls: [[
            ['There and back again'], ['O', book, 'Book("There and back again")']
          ]],
        });
      }

      API.class({sig: 'function Hobbit({name}) {}', intro: 'It is a dangerous thing Frodo'});
      API.class({sig: (class {}), intro: ()=>{}});
    });

    test("custom.", ()=>{
      /**
       * Document a custom function in the current module
       *
       * @param func the function to document
       * @param [options.name] override the name of func
       * @param [options.sig] replace of prefix the function signature. If it ends with a ".", "#"
       * or a ":" then it will prefix otherwise it will replace.
       * @param {function|string} [options.intro] the abstract for the method being documented. Defaults to
       * test comment.

       * @returns a ProxyClass which is to be used instead of `func`
       **/

      MainAPI.method('custom');

      function myCustomFunction(arg) {
        this.ans = arg;
        return 'success';
      }
      API.module({subjectModule: {id: 'myMod', exports: {}}});
      const thisValue = {};

      let proxy = API.custom(myCustomFunction);

      proxy.call(thisValue, 2);

      assert.same(thisValue.ans, 2);

      assert.equals(API.instance.customMethods.myCustomFunction, {
        test,
        sigPrefix: undefined,
        sig: 'myCustomFunction(arg)',
        intro: TH.match(/Document a custom function/),
        calls: [[
          [2], 'success'
        ]],
      });

      proxy = API.custom(myCustomFunction, {name: 'example2', sig: 'foobar = function example2(arg)'});

      proxy.call(thisValue, 4);

      assert.same(thisValue.ans, 4);

      assert.equals(API.instance.customMethods.example2, {
        test,
        sigPrefix: undefined,
        sig: 'foobar = function example2(arg)',
        intro: TH.match(/Document a custom function/),
        calls: [[
          [4], 'success'
        ]],
      });

      proxy = API.custom(myCustomFunction, {name: 'example3'});
      proxy.call(thisValue, 4);
      assert.equals(API.instance.customMethods.example3.sig, 'example3(arg)');

      proxy = API.custom(myCustomFunction, {name: 'example4', sig: 'Container#'});
      proxy.call(thisValue, 4);
      assert.equals(API.instance.customMethods.example4.sigPrefix, 'Container#');
      assert.equals(API.instance.customMethods.example4.sig, 'example4(arg)');

      proxy = API.custom(myCustomFunction, {name: 'example5', sig: 'Container.'});
      proxy.call(thisValue, 4);
      assert.equals(API.instance.customMethods.example5.sigPrefix, 'Container.');
      assert.equals(API.instance.customMethods.example5.sig, 'example5(arg)');

      proxy = API.custom(myCustomFunction, {name: 'example6', sig: 'Container.foo()'});
      proxy.call(thisValue, 4);
      assert.equals(API.instance.customMethods.example6.sigPrefix, 'Container.');
      assert.equals(API.instance.customMethods.example6.sig, 'foo()');

      API.done();
    });

    test("customIntercept", ()=>{
      /**
       * Intercept a function and document it like {#.custom}.
       *
       * @param object the container of the function to document
       * @param [options.name] the name of function to intercept defaults to test name
       * @param [options.sig] replace of prefix the function signature. If it ends with a ".", "#"
       * or a ":" then it will prefix otherwise it will replace.
       * @param {function|string} [options.intro] the abstract for the method being
       * documented. Defaults to test comment.

       * @returns the original function
       **/

      MainAPI.method('customIntercept');

      const printer = {print: stub().returns('success')};

      //[
      class Book {
        print(copies) {
          return printer.print(this, copies);
        }
      }
      API.module({subjectModule: {id: 'myMod', exports: {}}});
      const thisValue = {};

      let orig = API.customIntercept(Book.prototype, {name: 'print', sig: 'Book#'});

      const book = new Book();
      assert.same('success', book.print(2));
      //]

      assert.calledWith(printer.print, book, 2);

      assert.equals(API.instance.customMethods.print, {
        test,
        sigPrefix: 'Book#',
        sig: 'print(copies)',
        intro: TH.match(/Intercept a function/),
        calls: [[
          [2], 'success'
        ]],
      });

      API.done();
    });

    test("method", ()=>{
      /**
       * Document `methodName` for the current subject
       *
       * @param {function|string} [intro] the abstract for the method being documented. Defaults to
       * test comment.
       **/
      MainAPI.method('method');
      const fooBar = {
        fnord(a) {return a*2}
      };


      API.module({subjectModule: {id: 'myMod', exports: fooBar},
                  subjectName: 'fooBar'});
      API.method('fnord');

      assert.same(fooBar.fnord(5), 10);
      assert.same(fooBar.fnord(-1), -2);

      API.done();

      assert.equals(API.instance.methods.fnord, {
        test,
        sig: TH.match(/(function )?fnord\(a\)/),
        intro: m(str => str.startsWith('Document `methodName` for the current subject')),
        subject: ['P', {fnord: ['F', fooBar.fnord, 'fnord']}],
        calls: [[
          [5], 10
        ],[
          [-1], -2
        ]]
      });

      API.method('foo', {subject: {foo() {}}, intro: "intro"});
    });

    test("well known symbol name", ()=>{
      class ADT {
        *[Symbol.iterator]() {
          yield 1; yield 2;
        }
      }
      API.module({subjectModule: {id: 'myMod', exports: ADT}, subjectName: 'ADT'});
      API.protoMethod(Symbol.iterator);

      const adt = new ADT;
      assert.equals(Array.from(adt), [1, 2]);

      API.done();

      assert.equals(API.instance.protoMethods["[Symbol.iterator]"], {
        test,
        sig: '*[Symbol.iterator]()',
        intro: void 0,
        subject: ['F', ADT, 'ADT'],
        calls: [[[], ['O', ({}), '{}']]]
      });
    });

    test("local symbol name", ()=>{
      const foo$ = Symbol("foo");
      class ADT {
        [foo$]() {return "foo"}
      }
      API.module({subjectModule: {id: 'myMod', exports: ADT}, subjectName: 'ADT'});
      API.protoMethod(foo$);

      const adt = new ADT;
      assert.equals(adt[foo$](), "foo");

      API.done();

      assert.equals(API.instance.protoMethods["[Symbol(foo)]"], {
        test,
        sig: '[foo$]()',
        intro: void 0,
        subject: ['F', ADT, 'ADT'],
        calls: [[[], 'foo']]
      });
    });

    test("protoMethod", ()=>{
      /**
       * Document prototype `methodName` for the current subject

       * @param methodName the name of the prototype method to
       * document

       * @param [options.subject] override the instance to document. This
       * defaults to `module.exports.prototype`
       * @param {function|string} [options.intro] the abstract for the method being
       * documented. Defaults to test comment.
       **/
      MainAPI.method('protoMethod');

      //[
      class Tree {
        constructor(name) {
          this.name = name;
          this.branches = 10;
        }

        prune(branchCount) {
          return this.branches -= branchCount;
        }

        graft(branchCount) {
          return this.branches += branchCount;
        }
      };

      API.module({subjectModule: {id: 'myMod', exports: Tree}});
      API.protoMethod('prune');

      const plum = new Tree('Plum');
      assert.same(plum.prune(3), 7);
      assert.same(plum.prune(2), 5);


      /** Overriding subject.prototype **/
      const subject = {anything() {return "I could be anything"}};
      API.protoMethod('anything', {subject});

      assert.same(subject.anything(), "I could be anything");
      //]

      API.done();

      assert.equals(API.instance.protoMethods.prune, {
        test,
        sig: TH.match(/(function )?prune\(branchCount\)/),
        intro: TH.match(/Document prototype `methodName` for the current subject/),
        subject: ['F', TH.match.func, 'Tree'],
        calls: [[
          [3], 7
        ],[
          [2], 5
        ]]
      });

      API.protoMethod('graft', {intro: "an intro"});
    });

    test("auto subject", ()=>{
      TH.stubProperty(test.tc, "moduleId", {get() {
        return "foo-bar-test";
      }});
      TH.stubProperty(ctx.modules, 'foo-bar', {value: v.subject = {
        id: 'foo-bar',
        exports: {},
      }});
      TH.stubProperty(ctx.modules, 'foo-bar-test',
                      {value: v.testModule = {}});

      ctx.exportsModule.withArgs(TH.match.is(v.subject.exports))
        .returns([v.subject]);

      const api = API.instance;

      assert(api);
      assert.same(api.subject, v.subject.exports);
      assert.same(api.subjectName, 'FooBar');
    });

    test("serializeValue", ()=>{
      const api = MainAPI._instance;
      assert.equals(api.serializeValue(undefined), ['U', 'undefined']);
      assert.equals(api.serializeValue(null), null);
      assert.equals(api.serializeValue("number"), 'number');
      assert.equals(api.serializeValue(["M", MainAPI]), ["M", 'koru/test/api']);
      assert.equals(api.serializeValue(["x", MainAPI, 'arg 2']), ["x", 'arg 2']);
      assert.equals(api.serializeValue(
        ["P", {a: ["M", MainAPI], b: undefined}]
      ), ["P", {a: ["M", 'koru/test/api'], b: ['U', 'undefined']}]);

      if (! MainAPI.isRecord)
        return;

      assert.equals(api.serializeValue(["O", api, 'my api']),
                    ["Oi", 'my api', 'koru/test/api']);
      assert.equals(api.serializeValue(["O", MainAPI]), ["M", 'koru/test/api']);
    });

    test("resolveObject", ()=>{
      assert.equals(MainAPI.resolveObject(ctx.modules['koru/util-base']), ['Oi', '{Module:koru/util-base}', 'Module']);

      assert.equals(API.resolveObject(stub(), 'my stub'), ['Oi', 'my stub', 'Function']);

      const foo = {foo: 123};

      assert.equals(v.ans = API.resolveObject(foo, 'foo'), ['O', 'foo']);
      assert.equals(v.ans = API.resolveObject(Object.create(foo), 'ext foo'),
                    ['O', 'ext foo']);

      assert.equals(API.resolveObject([2], '[2]'), ['Oi', '[2]', 'Array']);
      assert.equals(API.resolveObject([2], '[2]'), ['Oi', '[2]', 'Array']);
      assert.equals(API.resolveObject(new Date(), 'dd/mm/yy'), ['Oi', 'dd/mm/yy', 'Date']);
      assert.equals(API.resolveObject({id: 'myModule',
                                       __proto__: module.constructor.prototype}),
                    ['Oi', '{Module:myModule}', 'Module']);
      class MyExt extends module.constructor {}
      assert.equals(API.resolveObject(MyExt),
                    ['Os', 'MyExt', 'Module']);

      API._moduleMap.set(APIModule, v.myApi = new API(null, APIModule,
                                                      'MainAPI', [{id: 'koru/test/api'}]));
      API._mapSubject(API, APIModule);

      assert.equals(v.ans = API.resolveObject(v.myApi, 'myApi'),
                    ['Oi', 'myApi', 'koru/test/api']);
      assert.msg('should cache').same(API.resolveObject(v.myApi), v.ans);

      class SubApi extends API {}

      assert.equals(v.ans = API.resolveObject(SubApi, 'sub'), ['Os', 'sub', 'koru/test/api']);

      class S2ubApi extends SubApi {}
      class S3ubApi extends S2ubApi {}

      assert.equals(v.ans = API.resolveObject(S3ubApi, 's3'), ['Os', 's3', 'koru/test/api']);
      assert.msg('should cache').same(API.resolveObject(S3ubApi), v.ans);

      assert.equals(API.resolveObject(new S2ubApi(), 's2()'),
                    ['Oi', 's2()', 'koru/test/api']);

      assert.equals(API.resolveObject(Object.create(new S2ubApi()), 'ext s2()'),
                    ['Oi', 'ext s2()', 'koru/test/api']);

    });

    test("serialize", ()=>{

      const myCtx = {modules: {}};
      const fooBar = {
        defaults: {
          theme: MainAPI,
          color: 'blue'
        },
        fnord(a, b) {return new API()}
      };
      const fooBarMod = {
        id: 'koru/test/foo-bar',
        exports: fooBar,
        _requires: {'koru/test/other-foo-bar' : 1},
        ctx: myCtx,
      };
      const otherMod = {
        id: 'koru/test/other-foo-bar',
        exports: fooBar,
        ctx: myCtx,
      };
      const FooTestMod = {
        id: 'koru/test/foo-bar-test',
        exports() {},
        body: `function () {/**\n * foo bar comment **/}`
      };
      myCtx.modules[otherMod.id] = otherMod;
      myCtx.modules[fooBarMod.id] = fooBarMod;
      API._mapSubject(fooBar, otherMod);
      API._mapSubject(fooBar, fooBarMod);
      const api = new API(null, fooBarMod, 'fooBar', FooTestMod);

      // map in superClass: MainAPI

      API._mapSubject(API, APIModule);
      API._moduleMap.set(APIModule, new API(null, APIModule, 'MainAPI', [APIModule]));

      class Hobbit {
        constructor(name) {this.name = name;}
      }
      const HobbitMod = {id: 'koru/test/hobbit', exports: Hobbit};
      API._mapSubject(Hobbit, HobbitMod);
      API._moduleMap.set(HobbitMod, new API(null, HobbitMod, 'Hobbit', [HobbitMod]));

      api.newInstance = {
        test,
        sig: 'new fooBar(foo)',
        intro: 'intro for foobar newInstance',
        calls: [[
          ['name'], ['O', new Hobbit('Pippin'), '{Hobbit:instance}']
        ]]
      };

      api.properties = {
        defaults: {
          info: 'the defaults',
          value: ['O', fooBar.defaults, '{defs}'],
          properties: {
            theme: {
              info: 'theme info',
              value: ['O', MainAPI, 'MainAPI'],
            },
            color: {
              info: 'color info',
              calls: [[[], ['O', {r:0, g: 0, b: 1}, 'rgb:blue']], [['green'], undefined]],
            },
          }
        }
      };

      api.protoProperties = {
        dateProp: {
          info: 'proto property',
          value: ['O', new Date(), '2016/08/22'],
        }
      };

      api.methods.fnord = {
        test,
        sig: 'fnord(a, b)',
        intro: 'Fnord ignores args; returns MainAPI',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [2, ['F', stub, 'stub'], ['O', Date, '{special}']], ['M', MainAPI], 'my comment'
        ], {
          intro: 'example intro',
          body: 'example source code here',
          calls: [[
            [
              "x", true,
              ['O', API, '{api extends MainAPI}'],
            ],
            undefined,
          ]]
        }]
      };

      api.protoMethods.zord = {
        test,
        sig: 'zord(a)',
        intro: 'introducing zord',
        subject: ['O', 'fooBar', fooBar],
        calls: [[
          [false], undefined
        ]]
      };

      api.customMethods.sentai = {
        test,
        sigPrefix: 'Ranger#',
        sig: 'sentai(a)',
        intro: 'introducing sentai',
        calls: [[
          [1], 2
        ]]
      };

      api.topics = {
        'scene 1': {
          test,
          intro: 'Scene 1 intro',
            calls: [{
              body: 'scene 1 code here',
              calls: [],
            }],
        },
      };

      api.initExample = () => {
        const example = 'init';
      };

      api.initInstExample = () => {
        const exampleInst = 'initInst';
      };

      assert.equals(api.serialize(), {
        id: 'koru/test/foo-bar',
        initExample: TH.match(/const example = 'init';/),
        initInstExample: TH.match(/const exampleInst = 'initInst';/),
        requires: [otherMod.id],
        modifies: [otherMod.id],
        subject: {
          name: 'fooBar',
          abstract: 'foo bar comment',
        },
        newInstance: {
          test: 'koru/test/api test serialize.',
          sig: 'new fooBar(foo)',
          intro: 'intro for foobar newInstance',
          calls: [[
            ['name'], ['Oi', '{Hobbit:instance}', 'koru/test/hobbit']
          ]]

        },
        properties: {
          defaults: {
            info: 'the defaults',
            value: ['O', '{defs}'],
            properties: {
              theme: {
                info: 'theme info',
                value: ['O', 'MainAPI'],
              },
              color: {
                info: 'color info',
                calls: [[[], ['O', 'rgb:blue']], [['green']]],
              },
            }
          }
        },
        protoProperties: {
          dateProp: {info: 'proto property', value: ['Oi', '2016/08/22', 'Date']}
        },
        methods: {
          fnord: {
            test: 'koru/test/api test serialize.',
            sigPrefix: undefined,
            sig: 'fnord(a, b)',
            intro: 'Fnord ignores args; returns MainAPI',
            calls: [[
              [2, ['F', 'stub'], ['O', '{special}', 'Date']], ['M', 'koru/test/api'], 'my comment'
            ], {
              intro: 'example intro',
              body: 'example source code here',
              calls: [[
                [
                  'x', true,
                  ['M', 'koru/test/api'], // is actually a documented subject
                ],
              ]]
            }],
          }
        },
        protoMethods: {
          zord: {
            test: 'koru/test/api test serialize.',
            sigPrefix: undefined,
            sig: 'zord(a)',
            intro: 'introducing zord',
            calls: [[
              [false]
            ]],
          }
        },
        customMethods: {
          sentai: {
            test: 'koru/test/api test serialize.',
            sigPrefix: 'Ranger#',
            sig: 'sentai(a)',
            intro: 'introducing sentai',
            calls: [[
              [1], 2
            ]],
          }
        },
        topics: {
          'scene 1': {
            sigPrefix: void 0,
            sig: void 0,
            test: 'koru/test/api test serialize.',
            intro: 'Scene 1 intro',
            calls: [{
              body: 'scene 1 code here',
              calls: [],
            }],
          }
        }
      });
    });

    test("#moduleName", ()=>{
      class Foo {}
      class Bar {}
      class Qux {}
      const FooMod = {id: 'my/mod/foo', exports: Foo};
      const api = new API(null, FooMod);
      const subApi = new API(api, Bar, 'Bar');
      subApi.properties = {Qux: {}};
      const sub2Api = new API(subApi, Qux, 'Qux');
      sub2Api.propertyName = 'qux';
      assert.same(api.moduleName, 'my/mod/foo');
      assert.same(subApi.moduleName, 'my/mod/foo::Bar');
      assert.same(sub2Api.moduleName, 'my/mod/foo::Bar.qux');
    });
  });
});
