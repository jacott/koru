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

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      API = class extends MainAPI {};
      API.isRecord = true;
      API.reset();
      test.stub(ctx, 'exportsModule').withArgs(MainAPI).returns([ctx.modules['koru/test/api']]);
    },

    tearDown() {
      v = null;
    },

    "test module"() {
      /**
       * Specify the <subject> to be documented
       *
       * @param {[module,...]} subjectModules - list of modules that define the subject
       **/
      MainAPI.module(MainAPI);
      MainAPI.method('module');

      API.module();
      assert.calledWith(ctx.exportsModule, MainAPI);
      const api = API._apiMap.get(MainAPI);
      assert(api);
      assert.same(api.subject, MainAPI);

      const myHelper = {
        clean() {}
      };

      API.module(myHelper, 'myHelper');

      class Elf {
      }

      API.module(Elf);

      assert.same(API.instance.subjectName, 'Elf');
    },

    "test example"() {
      /**
       * Run a section of as an example of a method call.
       **/
      MainAPI.module();
      MainAPI.method('example');

      MainAPI.example(function body() {
        class Color {
          static define(name, value) {
            this.colors[name] = value;
          }
          // ...
        }
        Color.colors = {};

        API.module(Color);
        API.method('define');

        API.example(() => {
          // this body of code is executed
          Color.define('red', '#f00');
          Color.define('blue', '#00f');
          assert.same(Color.colors.red, '#f00');
        });
      });

      API.done();

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
      MainAPI.module();
      MainAPI.method('comment');

      test.onEnd(() => {});

      MainAPI.example(() => {
        class Excercise {
          static register(name, minutes) {}
          begin() {}
        }

        API.module(Excercise);
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

    "test property"() {
      /**
       * Document a property of the current subject
       **/
      MainAPI.module(MainAPI);
      MainAPI.method('property');

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

        API.module(v.defaults, 'defaults');
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
          value: ['F', v.logger, 'logger']
        },
        width: {
          info: 'Document a property of the current subject',
          value: 800,
        }
      });
    },

    "test new"() {
      /**
       * Document <constructor> for the current subject
       *
       * @returns a ProxyClass which is to be used instead of `new Class`
       **/
      MainAPI.module(MainAPI);
      MainAPI.method('new');

      class Hobbit {
        constructor(name) {
          this.name = name;
        }
        $inspect() {return `{Hobbit:${this.name}}`;}
      }

      API.module(Hobbit);
      var newHobbit = API.new();

      var bilbo = newHobbit('Bilbo');

      assert.same(bilbo.name, 'Bilbo');

      API.done();

      assert.equals(API.instance.newInstance, {
        test,
        sig: 'constructor(name)',
        intro: 'Document <constructor> for the current subject\n\n@returns a ProxyClass which is to be used instead of `new Class`',
        calls: [[
          ['Bilbo'], ['O', bilbo, '{Hobbit:Bilbo}']
        ]],
      });

    },

    "test method"() {
      /**
       * Document <methodName> for the current subject
       **/
      MainAPI.module(MainAPI);
      MainAPI.method('method');
      const fooBar = {
        fnord(a) {return a*2}
      };


      API.module(fooBar, 'fooBar');
      API.method('fnord');

      assert.same(fooBar.fnord(5), 10);
      assert.same(fooBar.fnord(-1), -2);

      API.done();

      assert.equals(API.instance.methods.fnord, {
        test,
        sig: 'fnord(a)',
        intro: 'Document <methodName> for the current subject',
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
       * Document prototype <methodName> for the current subject
       **/
      MainAPI.module(MainAPI);
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

        API.module(Tree);
        API.protoMethod('prune');

        const plum = new Tree('Plum');
        assert.same(plum.prune(3), 7);
        assert.same(plum.prune(2), 5);
      });

      API.done();

      assert.equals(API.instance.protoMethods.prune, {
        test,
        sig: 'prune(branchCount)',
        intro: 'Document prototype <methodName> for the current subject',
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

    "test resolveObject"() {
      assert.equals(API.resolveObject(test.stub(), 'my stub'), ['Oi', 'my stub', 'Function']);
      API._apiMap.set(API, v.myApi = new API(test.tc, MainAPI, 'MainAPI', [{id: 'koru/test/api'}]));

      assert.equals(v.ans = API.resolveObject(v.myApi, 'myApi'), ['Oi', 'myApi', 'koru/test/api']);
      assert.msg('should cache').same(API.resolveObject(v.myApi), v.ans);

      const foo = {foo: 123};

      assert.equals(v.ans = API.resolveObject(foo, 'foo'), ['O', 'foo']);
      assert.equals(v.ans = API.resolveObject(util.protoCopy(foo), 'ext foo'), ['O', 'ext foo']);

      class SubApi extends API {}

      assert.equals(v.ans = API.resolveObject(SubApi, 'sub'), ['Os', 'sub', 'koru/test/api']);

      class S2ubApi extends SubApi {}
      class S3ubApi extends S2ubApi {}

      assert.equals(v.ans = API.resolveObject(S3ubApi, 's3'), ['Os', 's3', 'koru/test/api']);
      assert.msg('should cache').same(API.resolveObject(S3ubApi), v.ans);

      assert.equals(API.resolveObject(new S2ubApi(), 's2()'), ['Oi', 's2()', 'koru/test/api']);

      assert.equals(API.resolveObject(util.protoCopy(new S2ubApi()), 'ext s2()'), ['Oi', 'ext s2()', 'koru/test/api']);

      assert.equals(API.resolveObject([2], '[2]'), ['Oi', '[2]', 'Array']);
      assert.equals(API.resolveObject(new Date(), 'dd/mm/yy'), ['Oi', 'dd/mm/yy', 'Date']);
    },

    "test serialize"() {
      const fooBar = {
        defaults: {
          theme: MainAPI,
          color: 'blue'
        },
        fnord(a, b) {return new API()}
      };
      const api = new API(test.tc, fooBar, 'fooBar', [{id: 'koru/test/api'}]);

      // map in superClass: MainAPI
      API._apiMap.set(API, new API(test.tc, MainAPI, 'MainAPI', [{id: 'koru/test/api'}]));

      class Hobbit {
        constructor(name) {this.name = name;}
      }
      API._apiMap.set(Hobbit, new API({name: 'koru/test/hobbit'}, Hobbit, 'Hobbit',
                                         [{id: 'koru/test/hobbit'}]));

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
              value: 'blue',
            },
          }
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

      assert.equals(api.serialize({methods: {foo: {sig: 'foo()'}, fnord: {sig: 'oldSig'}}}), {
        subject: {
          ids: ['koru/test/api'],
          name: 'fooBar',
          abstracts: ['API is a semi-automatic API document generator. It uses\n'+
                      'unit-tests to determine types and values at test time.'],
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
                value: 'blue',
              },
            }
          }
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
  });
});
