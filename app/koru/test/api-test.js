define(function (require, exports, module) {
  /**
   * API is a semi-automatic API document generator. It uses
   * unit-tests to determine types and values at test time.
   **/
  var test, v;
  const TH      = require('koru/test');
  const util    = require('koru/util');
  const MainAPI = require('./api');

  const ctx = module.ctx;
  let API;
  const APIModule = ctx.modules['koru/test/api'];
  const TestModule = ctx.modules['koru/test/api-test'];

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      API = class extends MainAPI {};
      API.isRecord = true;
      API.reset();
      test.stub(ctx, 'exportsModule').withArgs(MainAPI).returns([APIModule]);
      MainAPI.module();
    },

    tearDown() {
      v = null;
    },

    "test module"() {
      /**
       * Initiate documentation of the module. Subsequent calls to API
       * methods will act of the given `module`.
       *
       * @param [module] defaults to the module corresponding to the
       * current test module
       * @param [subjectName] defaults to a hopefully reasonable name
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


      const myHelper = {
        clean() {}
      };

      API.module({id: 'myMod1', exports: myHelper}, 'myHelper');

      assert.same(API._instance.constructor, API);


      class Book {
      }

      API.module({id: 'myMod2', exports: Book});

      assert.same(API.instance.subjectName, 'Book');
    },

    "test innerSubject"() {
      /**
       * Document a subject within a module.
       *
       * @param subject either the actual subject or the property name
       * of the subject if accessible from the current subject
       * @param [subjectName] override the subject name
       * @param [options] adornments to the documentation:
       *
       * * `intro|info` - property info line (if subject is a `string`)

       * * `abstract` - introduction to the subject. If abstract is a
       * `function` then the initial doc comment is used.

       * * `initExample` - code that can be used to initialize
       * `subject`

       * * `initInstExample` - code that can be used to initialize
       * an instance of `subject`

       * @returns an API instance for the given `subject`. Subsequent
       * API calls should be made directly on this API instance and
       * **not** the API Class itself
       **/
      MainAPI.method('innerSubject');
      API.module();
      MainAPI.comment("hello");
      function abstract() {
        /**
         * An example abstract
         **/
      }
      const anythingApi = API.innerSubject(v.anything = {anything: 'is allowed'},
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

        API.module({id: 'myMod1', exports: Book}, 'myHelper');
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
    },

    "test example"() {
      /**
       * Run a section of as an example of a method call.
       **/
      MainAPI.method('example');

      MainAPI.example(() => {
        class Color {
          static define(name, value) {
            this.colors[name] = value;
          }
          // ...
        }
        Color.colors = {};

        API.module({id: 'myMod', exports: Color});
        API.method('define');

        API.example(() => {
          // this body of code is executed
          Color.define('red', '#f00');
          Color.define('blue', '#00f');
          assert.same(Color.colors.red, '#f00');
        });
      });

      MainAPI.done();

      assert.equals(API.instance.methods.define, {
        test,
        sig: TH.match.any,
        intro: TH.match.any,
        subject: TH.match.any,
        calls: [{
          body:
`          // this body of code is executed
          Color.define('red', '#f00');
          Color.define('blue', '#00f');
          assert.same(Color.colors.red, '#f00');
        `,
          calls: [[
            ['red', '#f00'], undefined
          ],[
            ['blue', '#00f'], undefined
          ]]
        }]
      });
    },

    "test comment"() {
      /**
       * Add a comment before the next example
       **/
      MainAPI.method('comment');

      test.onEnd(() => {});

      MainAPI.example(() => {
        class Excercise {
          static register(name, minutes) {}
          begin() {}
        }

        API.module({id: 'myMod', exports: Excercise});
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
    },

    "property": {
      setUp() {
        MainAPI.method('property');
      },

      "test value property"() {
        /**
         * Document a property of the current subject. The property
         * can be either plain value or a get/set function.
         *
         * @param [options] details about the property.
         *
         * When `object` can contain the following:
         *
         * * `info` (or `intro`): description of property
         * * `properties`: document child properties
         *
         * When `function` should return an info `string`. The info
         * `string` can contain `${value}` which will be substituted
         * with a description of the properties value.
         **/
        MainAPI.example(() => {
          v.defaults = {
            logger: function () {},
            width: 800,
            height: 600,
            theme: {
              name: 'light',
              primaryColor: '#aaf'
            }
          };

          API.module({id: 'myMod', exports: v.defaults}, 'defaults');
          API.property('theme', {
            info: 'The default theme',
            properties: {
              name: value => {
                v.name = value;
                return 'The theme name is ${value}';
              },
              primaryColor: 'The primary color is ${value}'
            },
          });
          assert.same(v.name, 'light');

          API.property('logger', value => {
            v.logger = value;
            return 'The default logger is ${value}';
          });

          assert.same(v.logger, v.defaults.logger);
        });

        MainAPI.comment("If no info supplied then the test description is used");
        API.property('width');

        API.done();

        assert.equals(API.instance.properties, {
          theme: {
            info: 'The default theme',
            value: ['O', v.defaults.theme, "{name: 'light', primaryColor: '#aaf'}"],
            properties: {
              name: {
                info: 'The theme name is ${value}',
                value: v.name,
              },
              primaryColor: {
                info: 'The primary color is ${value}',
                value: '#aaf',
              },
            },
          },
          logger: {
            info: 'The default logger is ${value}',
            value: ['F', v.logger, TH.match(/(logger|function)/)]
          },
          width: {
            info: TH.match(/Document a property/),
            value: 800,
          }
        });
      },

      "test get/set property"() {
        MainAPI.example(() => {
          const book = {
            get title() {return this._title;},
            set title(value) {this._title = value;},
          };

          API.module({id: 'myMod', exports: book}, 'Room');
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
      },
    },

    "test protoProperty"() {
      /**
       * Document a property of the current subject's prototype. The
       * property can be either plain value or a get/set function.
       *
       * See {#.property}
       **/
      MainAPI.method('protoProperty');
      MainAPI.example(() => {
        class Book {
          constructor(pages) {
            this.pages = pages;
          }
        }

        API.module({id: 'myMod', exports: Book});
        API.protoProperty('page', {info: 'The number of pages'});
        const book = new Book(504);
        assert.same(book.pages, 504);
      });

      API.done();
    },


    "test new"() {
      /**
       * Document `constructor` for the current subject
       *
       * @returns a ProxyClass which is to be used instead of `new Class`
       **/
      MainAPI.method('new');

      class Hobbit {
        constructor(name) {
          this.name = name;
        }
        $inspect() {return `{Hobbit:${this.name}}`;}
      }

      API.module({id: 'myMod', exports: Hobbit});
      var newHobbit = API.new();

      var bilbo = newHobbit('Bilbo');

      assert.same(bilbo.name, 'Bilbo');

      API.done();

      assert.equals(API.instance.newInstance, {
        test,
        sig: TH.match(/(constructor|function Hobbit)\(name\)/),
        intro: 'Document `constructor` for the current subject\n\n@returns a ProxyClass which is to be used instead of `new Class`',
        calls: [[
          ['Bilbo'], ['O', bilbo, '{Hobbit:Bilbo}']
        ]],
      });

    },

    "test method"() {
      /**
       * Document `methodName` for the current subject
       **/
      MainAPI.method('method');
      const fooBar = {
        fnord(a) {return a*2}
      };


      API.module({id: 'myMod', exports: fooBar}, 'fooBar');
      API.method('fnord');

      assert.same(fooBar.fnord(5), 10);
      assert.same(fooBar.fnord(-1), -2);

      API.done();

      assert.equals(API.instance.methods.fnord, {
        test,
        sig: TH.match(/(function )?fnord\(a\)/),
        intro: 'Document `methodName` for the current subject',
        subject: ['O', fooBar, '{fnord: => fnord}'],
        calls: [[
          [5], 10
        ],[
          [-1], -2
        ]]
      });
    },

    "test protoMethod"() {
      /**
       * Document prototype `methodName` for the current subject
       **/
      MainAPI.method('protoMethod');

      MainAPI.example(() => {
        class Tree {
          constructor(name) {
            this.name = name;
            this.branches = 10;
          }

          prune(branchCount) {
            return this.branches -= branchCount;
          }
        };

        API.module({id: 'myMod', exports: Tree});
        API.protoMethod('prune');

        const plum = new Tree('Plum');
        assert.same(plum.prune(3), 7);
        assert.same(plum.prune(2), 5);
      });

      API.done();

      assert.equals(API.instance.protoMethods.prune, {
        test,
        sig: TH.match(/(function )?prune\(branchCount\)/),
        intro: 'Document prototype `methodName` for the current subject',
        subject: ['F', TH.match.func, 'Tree'],
        calls: [[
          [3], 7
        ],[
          [2], 5
        ]]
      });
    },

    "test auto subject"() {
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

      var api = API.instance;

      assert(api);
      assert.same(api.subject, v.subject.exports);
      assert.same(api.subjectName, 'fooBar');
    },

    "test serializeValue"() {
      const api = MainAPI._instance;
      assert.equals(api.serializeValue(undefined), ['U', 'undefined']);
      assert.equals(api.serializeValue(null), null);
      assert.equals(api.serializeValue("number"), 'number');
      assert.equals(api.serializeValue(["M", MainAPI]), ["M", 'koru/test/api']);
      assert.equals(api.serializeValue(["x", MainAPI, 'arg 2']), ["x", 'arg 2']);

      if (! MainAPI.isRecord)
        return;

      assert.equals(api.serializeValue(["O", api, 'my api']),
                    ["Oi", 'my api', 'koru/test/api']);
      assert.equals(api.serializeValue(["O", MainAPI]), ["M", 'koru/test/api']);
    },

    "test resolveObject"() {
      assert.equals(MainAPI.resolveObject(ctx.modules['koru/util-base']), ['Oi', '{Module:koru/util-base}', 'Module']);

      assert.equals(API.resolveObject(test.stub(), 'my stub'), ['Oi', 'my stub', 'Function']);

      const foo = {foo: 123};

      assert.equals(v.ans = API.resolveObject(foo, 'foo'), ['O', 'foo']);
      assert.equals(v.ans = API.resolveObject(util.protoCopy(foo), 'ext foo'),
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

      assert.equals(API.resolveObject(util.protoCopy(new S2ubApi()), 'ext s2()'),
                    ['Oi', 'ext s2()', 'koru/test/api']);

    },

    "test serialize"() {
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
        exports: function () {},
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
          [2, ['F', test.stub, 'stub'], ['O', Date, '{special}']], ['M', MainAPI], 'my comment'
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

      api.initExample = () => {
        const example = 'init';
      };

      api.initInstExample = () => {
        const exampleInst = 'initInst';
      };


      assert.equals(api.serialize({
        methods: {foo: {sig: 'foo()'}, fnord: {sig: 'oldSig'}}
      }), {
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
          test: 'koru/test/api test serialize',
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
            test: 'koru/test/api test serialize',
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
            test: 'koru/test/api test serialize',
            sig: 'zord(a)',
            intro: 'introducing zord',
            calls: [[
              [false]
            ]],
          }
        },
      });
    },

    "test #moduleName"() {
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
    },
  });
});
