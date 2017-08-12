define(function (require, exports, module) {
  const util = require('koru/util');
  const TH   = require('./test');

  const sut = require('./changes');

  var v = null;

  TH.testCase(module, {
    "test has"() {
      /**
       * test if undo has changed field
       **/
      assert.isTrue(sut.has({foo: undefined}, 'foo'));
      assert.isTrue(sut.has({foo: false}, 'foo'));
      assert.isFalse(sut.has({foo: undefined}, 'bar'));
      assert.isTrue(sut.has({$partial: {foo: undefined}}, 'foo'));
      assert.isFalse(sut.has({$partial: {foo: undefined}}, 'bar'));
    },

    "test simple changes"() {
      const attrs = {bar: 1, foo: 2, fuz: 3, fiz: 4};
      const changes = {foo: null, fuz: undefined, fiz: 5, nit: 6};
      sut.applyOne(attrs, 'foo', changes);
      sut.applyOne(attrs, 'fuz', changes);
      sut.applyOne(attrs, 'fiz', changes);
      sut.applyOne(attrs, 'nit', changes);
      assert.equals(attrs, {bar: 1, fiz: 5, nit: 6});
      assert.equals(changes, {foo: 2, fuz: 3, fiz: 4, nit: TH.match.null});
    },

    "test with non numeric array index"() {
      // say "foo.bar.baz" instead of "foo.0.baz"
      assert.exception(() => {
        sut.applyOne({a: [{b: [1]}]}, "a.0.b.x", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");

      assert.exception(() => {
        sut.applyOne({a: [{b: [1]}]}, "a.x.b.0", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");
    },

    "test with objects"() {
      const orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      let changes = {a: 2, b: undefined, d: 4, $partial: {nest: ["bar", 'bar']}};

      const undo = sut.applyAll(orig, changes);
      assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'bar'}, d: 4});
      assert.equals(undo, {a: 1, b: 2, d: undefined, $partial: {nest: ["bar", undefined]}});
      assert.equals(changes, {a: 2, b: undefined, d: 4, $partial: {nest: ["bar", 'bar']}});
      {
        const changes = {$partial: {nest: ["bar", 'new'], new: ["deep.list", 'deeplist']}};
        const undo = sut.applyAll(orig, changes);

        assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'new'},
                             d: 4, new: {deep: {list: 'deeplist'}}});
        assert.equals(undo, {$partial: {nest: ["bar", 'bar'], "new": ['$replace', null]}});
      }
    },

    "test deleting array entry by string"() {
      const orig = {a: [1,2,3]};
      const changes = {$partial: {a: ['1', undefined]}};

      assert.equals(sut.applyAll(orig, changes), {$partial: {a: ['1', 2]}});
      assert.equals(orig.a, [1, 3]);
    },

    "test deleting array entry by number"() {
      const orig = {a: [1,2,3]};
      const changes = {$partial: {a: [1, undefined]}};

      assert.equals(sut.applyAll(orig, changes), {$partial: {a: ['1', 2]}});
      assert.equals(orig.a, [1, 3]);
    },

    "test already applied"() {
      const orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      const changes = {a: 1, b: 2, c: 4, nest: {foo: 'foo'}};

      assert.equals(sut.applyAll(orig, changes), {c: 3});
    },

    "test with empty array"() {
      const orig = {top: {ar: []}};
      const changes = {$partial: {top: ["ar.1.foo", 3]}};

      const undo = sut.applyAll(orig, changes);

      assert.equals(orig, {top: {ar: [, {foo: 3}]}});
      assert.equals(undo, {$partial: {top: ['ar.1', null]}});
      sut.applyAll(orig, undo);

      assert.equals(orig, {top: {ar: [,]}});
    },

    "test change array"() {
      const orig = {top: {ar: []}};
      const changes = {$partial: {top: ["ar.0", 'new']}};

      assert.equals(sut.applyAll(orig, changes), {$partial: {top: ['ar.0', undefined]}});
      assert.equals(orig, {top: {ar: ["new"]}});
    },

    "test with array"() {
      const orig = {ar: [{foo: 1}, {foo: 2}]};
      const changes = {$partial: {ar: ["1.foo", 3]}};

      assert.equals(sut.applyAll(orig, changes), {$partial: {ar: ['1.foo', 2]}});
      assert.equals(orig, {ar: [{foo: 1}, {foo: 3}]});
    },

    "$partial": {
      "$match": {
        setUp() {
          /**
           * Match commands ensure we only update if the current value matches. The whole
           * transaction is aborted if the match is not satisfied.

           * Note: $match can be used on any type but $match.md5 and $match.sha256 can only be used
           * on strings
           **/
        },

        "$match equal": {
          "test equal"() {
            const attrs = {obj: {name: 'old name', number: 5}};
            const changes = ['$match', {name: 'old name', number: 5}];
            refute.exception(_=>{
              sut.applyPartial(attrs, 'obj', changes);
            });
            assert.equals(attrs, {obj: {name: 'old name', number: 5}});
          },

          "test not equal"() {
            const attrs = {obj: {name: 'old name', number: 5}};
            const changes = ['$match', {name: 'old name', number: 6}];
            assert.exception(_=>{
              sut.applyPartial(attrs, 'obj', changes);
            }, {error: 409, reason: {obj: 'not_match'}});
          },
        },

        "$match md5": {
          "test equal"() {
            const attrs = {name: 'old name'};
            const changes = ['$match', {md5: '58a5352c62'}];
            refute.exception(_=>{
              sut.applyPartial(attrs, 'name', changes);
            });
            assert.equals(attrs, {name: 'old name'});

          },

          "test not equal"() {
            const attrs = {name: 'old name'};
            const changes = ['$match', {md5: '58a5352c63'}];
            assert.exception(_=>{
              sut.applyPartial(attrs, 'name', changes);
            }, {error: 409, reason: {name: 'not_match'}});
          },
        },

        "$match sha256": {
          "test equal"() {
            const attrs = {name: 'old name'};
            const changes = ['$match', {sha256: '2b727fb85cff'}];
            refute.exception(_=>{
              sut.applyPartial(attrs, 'name', changes);
            });
            assert.equals(attrs, {name: 'old name'});

          },

          "test not equal"() {
            const attrs = {name: 'old name'};
            const changes = ['$match', {sha256: '2b727fb85cfe'}];
            assert.exception(_=>{
              sut.applyPartial(attrs, 'name', changes);
            }, {error: 409, reason: {name: 'not_match'}});
          },
        },
      },

      "$replace": {
        setUp() {
          /**
           * Replace the content of the field. Add the field is does not exists. Delete the field if
           * value is null.
           **/
        },

        "test no change"() {
          const attrs = {name: 'old name'};
          const changes = ['$replace', 'old name'];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'old name'});
          assert.equals(undo, []);
        },

        "test modify"() {
          const attrs = {name: 'old name'};
          const changes = ['$replace', 'new name'];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'new name'});
          assert.equals(undo, ['$replace', 'old name']);
        },

        "test add"() {
          const attrs = {};
          const changes = ['$replace', 'new name'];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'new name'});
          assert.equals(undo, ['$replace', null]);
        },

        "test delete"() {
          const attrs = {name: 'old name'};
          const changes = ['$replace', null];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {});
          assert.equals(undo, ['$replace', 'old name']);
        },
      },

      "$prepend, $append": {
        setUp() {
          /**
           * Add contents to the start or end of a field. Fields can be of type string or array.
           **/
        },

        "test wrong type"() {
          const attrs = {name: 123};
          const undo = [];
          assert.exception(_=>{
            sut.applyPartial(attrs, 'name', ['$prepend', 'me'], undo);
          }, {error: 400, reason: {name: 'wrong_type'}});

          assert.exception(_=>{
            sut.applyPartial(attrs, 'name', ['$append', 'me'], undo);
          }, {error: 400, reason: {name: 'wrong_type'}});
        },

        "test string"() {
          const name = 'orig name';
          const attrs = {name};
          const prepend = 'put me at front', append = 'put me at end';
          const changes = ['$prepend', prepend, '$append', append];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'put me at frontorig nameput me at end'});
          assert.equals(undo, ['$patch', [
            0, prepend.length, null,
            -append.length, append.length, null
          ]]);
        },

        "test array"() {
          const numbers = [2, 4, 3];
          const attrs = {numbers};
          const prepend = [45, 12], append = [16, 18];
          const changes = ['$prepend', prepend, '$append', append];
          const undo = [];
          sut.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [45, 12, 2, 4, 3, 16, 18]});
          assert.equals(undo, ['$patch', [
            0, 2, null,
            -2, 2, null,
          ]]);
        },

        "test $append only"() {
          const name = 'orig name';
          const attrs = {name};
          const append = 'put me at end';
          const changes = ['$append', append];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'orig nameput me at end'});
          assert.equals(undo, ['$patch', [
            -append.length, append.length, null
          ]]);
        },
      },

      "$patch": {
        setUp() {
          /**
           * Patch the field using an array of 3-tuples. A 3-tuple consists of:

           *   move-delta, delete-delta and add-content

           * Fields can be of type string or
           * array. Not allowed with $append, $prepend or $replace.
           **/
        },

        "test string"() {
          const name = 'orig content';
          const attrs = {name};
          const changes = ['$patch', [
            0, 1, "",                 // delete only
            2, 4, "i was changed ",   // delete and add
            3, 0, "and I was added. " // add only
          ]];
          const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'rii was changed nteand I was added. nt'});
          assert.equals(undo, ['$patch', [
            0, 0, "o",
            2, "i was changed ".length, "g co",
            3, "and I was added. ".length, null,
          ]]);
          const undo2 = [];
          sut.applyPartial(attrs, 'name', undo, undo2);
          assert.equals(attrs, {name: 'orig content'});
          assert.equals(undo2, ['$patch', [
            0, 1, null,                 // delete only
            2, 4, "i was changed ",   // delete and add
            3, 0, "and I was added. " // add only
          ]]);

          const attrs2 = {name: 'Austin;'};
          sut.applyPartial(attrs2, 'name', [
            '$patch', [0, 0, 'Jane ', 4, 1, 'e', -1, 1, '.']], []);
          assert.equals(attrs2.name, 'Jane Austen.');
        },

        "test -ve delta"() {
          const name = 'orig content';
          const attrs = {name};
          const changes = ['$patch', [
            3, 0, "_",
            -4, 2, "-ve delta. ", // -ve deltas are always from end of content
          ]];
           const undo = [];
          sut.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'ori_g con-ve delta. nt'});
          assert.equals(undo, ['$patch', [
            3, 1, null,
            -13, 11, 'te',
          ]]);
          const undo2 = [];
          sut.applyPartial(attrs, 'name', undo, undo2);
          assert.equals(attrs, {name: 'orig content'});
          assert.equals(undo2, ['$patch', [
             3, 0, "_",
            -4, 2, "-ve delta. ",
          ]]);
        },

        "test array"() {
          const numbers = [1,2,3,4,5,6];
          const attrs = {numbers};
          const changes = ['$patch', [
            3, 0, [12, 18, 16],
            -3, 2, [15, 11], // -ve deltas are always from end of content
          ]];
          const undo = [];
          sut.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [1, 2, 3, 12, 18, 16, 15, 11, 6]});
          assert.equals(undo, ['$patch', [
            3, 3, null,
            -3, 2, [4, 5],
          ]]);
          const undo2 = [];
          sut.applyPartial(attrs, 'numbers', undo, undo2);
          assert.equals(attrs, {numbers: [1,2,3,4,5,6]});
          assert.equals(undo2, ['$patch', [
            3, 0, [12, 18, 16],
            -3, 2, [15, 11],
          ]]);
        },
      },

      "$add, $remove": {
        setUp() {
          /**
           * Add items unless already exists and remove items if they exist.

           * The $add and $remove commands can only be used with arrays
           **/
        },

        "test $add"() {
          const attrs = {books: [{title: 's&s', author: 'JA'}]};
          const changes = [
            '$add', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 's&s', author: 'JA'}, {title: 'p&p', author: 'JA'}]});
          assert.equals(undo, ['$remove', [{title: 'p&p', author: 'JA'}]]);
        },

        "test $remove"() {
          const attrs = {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]};
          const changes = [
            '$remove', [{title: 'p&p'}, {title: 'e'}],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 's&s', author: 'JA'}]});
          assert.equals(undo, ['$add', [{title: 'p&p', author: 'JA'}]]);
        },

        "test no change $add"() {
          const attrs = {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]};
          const changes = [
            '$add', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]});
          assert.equals(undo, []);
        },

        "test no change $remove"() {
          const attrs = {books: []};
          const changes = [
            '$remove', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: []});
          assert.equals(undo, []);
        },

        "test undo"() {
          const numbers = [1,2,3,4,16,15];
          const attrs = {numbers};
          const changes = [
            '$add', [4, 7, 8],
            '$remove', [2, 9, 1],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [3, 4, 16, 15, 7, 8]});
          assert.equals(undo, [
            '$add', [1, 2],
            '$remove', [7, 8],
          ]);
          const undo2 = [];
          sut.applyPartial(attrs, 'numbers', undo, undo2);
          assert.equals(attrs, {numbers: [3,4,16,15,1,2]});
          assert.equals(undo2, [
            '$add', [7, 8],
            '$remove', [1, 2],
          ]);
        },

        "test add to null"() {
          const attrs = {};
          const changes = [
            '$add', ['a', 'b'],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'letters', changes, undo);
          assert.equals(attrs, {letters: ['a', 'b']});
          assert.equals(undo, [
            '$remove', ['a', 'b'],
          ]);
        },

        "test remove from null"() {
          const attrs = {};
          const changes = [
            '$remove', ['a', 'b'],
          ];
          const undo = [];
          sut.applyPartial(attrs, 'letters', changes, undo);
          assert.equals(attrs, {});
          assert.equals(undo, []);
        },
      },

      "subfields": {
        setUp() {
          /**
           * Sub-fields can consist of field names or array indexes. If the last segment is
           * '$partial' then value is a partial command otherwise it is the replacement value.
           **/

          v = {};
          v.attrs = {html: {
            ol: [{li: {b: 'one'}}, {li: {b: 'two'}}, {li: ['3', ' ', 'three']}]
          }};
        },

        tearDown() {
          v = null;
        },

        "test simple replacement"() {
          const changes = [
            'ol.1.li.b', '2',
          ];

          const undo = [];
          sut.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html.ol[1], {li: {b: '2'}});
          assert.equals(undo, [
            'ol.1.li.b', 'two',
          ]);
        },

        "test no change"() {
          const changes = [
            'ol.2.li.0', '3',
          ];

          const old = util.deepCopy(v.attrs);
          const undo = [];
          sut.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs, old);
          assert.equals(undo, []);
        },

        "test missing top"() {
          const changes = ['div.1.i', 'hello', 'div.2.b', 'bye bye'];
          const undo = [];
          sut.applyPartial(v.attrs, 'foo', changes, undo);
          assert.equals(v.attrs.foo, {div: [, {i: 'hello'}, {b: 'bye bye'}]});
          assert.equals(undo, [
            '$replace', null,
          ]);
          sut.applyPartial(v.attrs, 'foo', undo, []);
          assert.equals(v.attrs, {html: TH.match.object});
        },

        "test missing sub"() {
          const changes = ['div.1.i', 'hello'];
          const undo = [];
          sut.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html, {ol: TH.match.object, div: [, {i: 'hello'}]});
          assert.equals(undo, [
            'div', null,
          ]);
          sut.applyPartial(v.attrs, 'html', undo, []);
          assert.equals(v.attrs, {html: TH.match.object});
        },

        "test partial"() {
          const changes = [
            'ol.2.li.$partial', [
              '$add', ['4', '5']
            ]
          ];

          const undo = [];
          sut.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html.ol[2], {li: ['3', ' ', 'three', '4', '5']});
          assert.equals(undo, [
            'ol.2.li.$partial', [
              '$remove', ['4', '5']
            ],
          ]);
        },
      },

      "test top level match"() {
        const attrs = {foo: 1, bar: "two"};
        const changes = {$match: {foo: 1, bar: {md5: "b8a9"}}};
        refute.exception(_=>{sut.applyAll(attrs, changes)});
        assert.equals(attrs, {foo: 1, bar: "two"});
        assert.equals(changes, {$match: {foo: 1, bar: {md5: "b8a9"}}});
      },

      "test top level not match"() {
        const attrs = {foo: 1, bar: {md5: "bad"}};
        const changes = {$match: {foo: 1, bar: "two"}};
        assert.exception(
          _=>{sut.applyAll(attrs, changes)},
          {error: 409, reason: {bar: 'not_match'}}
        );
      },

      "test applyAll"() {
        /**
         * Apply all commands to an attributes object. Commands can have:

         * 1. a $match object which assert the supplied fields match the attribute

         * 2. a $partial object which calls applyPartial for each field

         * @returns undo command which when applied to the updated attributes reverts it to its
         * original content. Calling `Changes.original` on undo will return the original commands
         * object
         **/
        const attrs = {foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]}, simple: [123]};
        const changes = {
          foo: 2,
          $partial: {
            bar: ['$replace', 4],
            simple: 456,
            baz: [
              'bif.2.$partial', [
                'bip', 'new',
                'bob.$partial', [
                  '$append', ' appended'
                ]
              ],
            ],
          },
        };
        const undo = sut.applyAll(attrs, changes);
        assert.equals(changes, {
          foo: 2,
          simple: 456,
          $partial: {
            bar: ['$replace', 4],
            baz: [
              'bif.2.$partial', [
                'bip', 'new',
                'bob.$partial', [
                  '$append', ' appended'
                ]
              ],
            ],
          },
        });
        assert.same(sut.original(undo), changes);

        assert.equals(attrs, {
          foo: 2, bar: 4,  baz: {
            bif: [1, 2, {bob: 'text appended', bip: 'new'}]
          },
          simple: 456,
        });
        assert.equals(undo, {
          foo: 1,
          simple: [123],
          $partial: {
            bar: ['$replace', 2],
            baz: [
              'bif.2.$partial', [
                'bob.$partial', [
                  '$patch', [-9, 9, null]
                ],
                'bip', null,
              ],
            ],
          }
        });

        sut.applyAll(attrs, undo);
        assert.equals(attrs, {
          foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]},
          simple: [123],
        });
      },

      "test no changes in applyAll"() {
        const attrs = {foo: 1, bar: [1,2]};
        const changes = {
          foo: 1,
          $partial: {
            bar: ['$add', [1]],
          },
        };
        ;
        assert.equals(sut.applyAll(attrs, changes), {});
        assert.equals(attrs, {foo: 1, bar: [1, 2]});
      },
    },

    "test original"() {
      const undo = {foo: 123}, orig = {foo: 456};

      sut.setOriginal(undo, orig);
      assert.same(sut.original(undo), orig);
    },

    "test updateCommands"() {
      /**
       * Given an original change command (commands), a modified top-level changes (modified), and
       * the original top-level changes (original) update commands to reflect the modifications
       **/

      const commands = {
        foo: 2,
        $partial: {
          bar: [
            'baz.0', 4,
            'bif', 'five',
          ],
          buz: ['$append', '.foo'],
          zip: ['$prepend', 'bar.'],
        },
        fuz: 5,
      };
      const modified = {foo: 3, bar: {baz: [3], bif: 'six'}, buz: 'buz.foo', newone: [1,2,3]};
      const original = {foo: 2, bar: {baz: [4], bif: 'six'}, buz: 'buz.foo', zip: 'bar.zip', fuz: 5};

      sut.updateCommands(commands, modified, original);
      assert.equals(commands, {
        foo: 3,
        newone: [1,2,3],
        bar: {baz: [3], bif: 'six'},
        $partial: {
          buz: ['$append', '.foo'],
        },
      });
    },

    "test empty partial in updateCommands"() {
      const commands = {
        $partial: {
          zip: ['$prepend', 'bar.'],
        },
        fuz: 5,
      };
      const modified = {fuz: 5, zip: 'zap'};
      const original = {fuz: 5, zip: 'bar.zip'};

      sut.updateCommands(commands, modified, original);
      assert.equals(commands, {
        fuz: 5,
        zip: 'zap',
      });
    },

    "test extractChangeKeys"() {
      /**
       * Extract top level parameters that have changed given a set of attributes and a undo
       * command
       **/

      const attrs = {foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]}};
      const changes = {
        foo: 2,
        $partial: {
          bar: ['$replace', 4],
        },
        fuz: 5,
      };

      const params = sut.extractChangeKeys(attrs, changes);
      assert.equals(params, {foo: 1, bar: 2, fuz: null});
    },

    "test topLevelChanges"() {
      /**
       * Extract top level fields that have changed given a set of attributes and a change command
       **/
      assert.equals(sut.topLevelChanges({foo: {a: 1}}, {$partial: {foo: ['$replace', null]}}),
                    {foo: null});

      const attrs = {foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]}};
      const changes = {
        foo: 2,
        $partial: {
          baz: ['bif.2.bob', 'changed'],
        },
        fuz: 5,
      };

      const params = sut.topLevelChanges(attrs, changes);
      assert.equals(params, {foo: 2, baz: {bif: [1, 2, {bob: 'changed'}]}, fuz: 5});


    },

    "diffSeq": {
      setUp() {
        /**
         * build an instruction to convert oldSeq to newSeq
         **/
      },

      "test equal"() {
        assert.equals(sut.diffSeq([1,2,3], [1,2,3]), undefined);
      },

      "test customCompare"() {
        const o = n => ({a: n});
        assert.equals(sut.diffSeq([1,2,3].map(o), [1,4,3].map(o), util.deepEqual), [
          1, 1, [{a: 4}]
        ]);
      },

      "test simple"() {
        assert.equals(sut.diffSeq([1,2,3,4,5,6], [1,2,2,8,7,5,6]), [
          2, 2, [2, 8, 7]
        ]);
        assert.equals(sut.diffSeq([2,3,4,5,6], [1,2,2,8,7,5,6]), [
          0, 3, [1, 2, 2, 8, 7]
        ]);
        assert.equals(sut.diffSeq([2,3,4,5,6], [1,2,2,8,7,5,6,1]), [
          0, 5, [1,2,2,8,7,5,6,1]
        ]);
      },

      "test string"() {
        assert.equals(sut.diffSeq("it1", "it21"), [2, 0, '2']);
        assert.equals(sut.diffSeq("it21", "it1"), [2, 1, '']);
        assert.equals(sut.diffSeq("cl 123.2", "cl 123"), [6, 2, '']);
        assert.equals(sut.diffSeq("helo worlld", "hello world"), [3, 6, 'lo wor']);
        assert.equals(sut.diffSeq("hello world", "helo worlld"), [3, 6, 'o worl']);
        assert.equals(sut.diff("hello world", "helo worlld"), [3, 6, 'o worl']);
        assert.equals(sut.diffSeq("hello world", "hello world"), undefined);
      },
    },

    "test applyPatch"() {
      assert.equals(sut.applyPatch("it1", [2, 0, '2']), "it21");
      assert.equals(sut.applyPatch("it1", [0, 0]), "it1");
    },



    "arrayChanges"() {
      /**
       * Extract a list of added and removed elems from an after and before

       * Note: converts elements to strings to compare unless hash method supplied
       **/

      assert.equals(sut.arrayChanges([1,2,6], [3,1]), {added: [2, 6], removed: [3]});
      assert.equals(sut.arrayChanges([1,"5",6], [3,1]), {added: ["5", 6], removed: [3]});
      assert.equals(sut.arrayChanges([1,"5",6]), {added: [1,"5",6], removed: []});
      assert.equals(sut.arrayChanges(null, ["5", 1.2]), {added: [], removed: ["5", 1.2]});

      assert.equals(
        sut.arrayChanges(
          [{id: 1, a: 2}, {id: 5, b: 3}], [{id: 5, b: 3}, {id: 'x', a: 2}],
          o=>''+o.id
        ),
        {added: [{id: 1, a: 2}], removed: [{id: 'x', a: 2}]});
    },

    "fieldDiff": {
      setUp() {
        /**
         * determine which sub-fields have changed

         * @param field the field to diff
         * @param from value (or undo partial) before change
         * @param to value (or apply partial) after change
         * @returns a partial command list
         **/
      },

      "test not in change"() {
        const attrs = {_id: 't123'};
        assert.equals(sut.fieldDiff('foo', attrs, {fuz: '123'}), undefined);
      },

      "test no change"() {
        const attrs = {_id: 't123', foo: {one: 123, two: 'a string', three: true}};
        const changes = {foo: {one: 123, two: 'a string', three: true}};

        assert.equals(sut.fieldDiff('foo', attrs, changes), undefined);
      },

      "test bad args"() {
        assert.exception(_=>{
          sut.fieldDiff('foo', undefined, {$partial: {}});
        }, {message: 'illegal arguments'});

        assert.exception(_=>{
          sut.fieldDiff('foo', {$partial: {}}, undefined);
        }, {message: 'illegal arguments'});

        assert.exception(_=>{
          sut.fieldDiff('foo', {$partial: {}}, {$partial: {}});
        }, {message: 'illegal arguments'});
      },

      "test fromTo"() {
        const attrs = {one: {two: {three: {a: 123, b: 456}}}};
        const changes = {$partial: {one: ["two.three.b", 789]}};

        assert.equals(sut.fromTo(['one', 'two', 'three'], attrs, changes), {
          from: {a: 123, b: 456}, to: {a: 123, b: 789}
        });
      },

      "test object"() {
        const attrs = {_id: 't123', foo: {one: 123, two: 'a string', three: true}};
        const changes = {foo: {two: 'new string', three: true, four: [1,2,3]}};

        assert.equals(sut.diff(attrs.foo, changes.foo), {
          one: null,
          two: 'new string',
          four: [1,2,3],
        });

        assert.same(sut.fieldDiff('foo', null, null), undefined);

        assert.equals(sut.fieldDiff('foo', attrs, undefined), {one: null, two: null, three: null});
        assert.equals(sut.fieldDiff('foo', undefined, attrs),
                      {one: 123, two: 'a string', three: true});

        assert.equals(sut.fieldDiff('foo', attrs, {}), {one: null, two: null, three: null});
        assert.equals(sut.fieldDiff('foo', attrs, attrs), {});


        assert.equals(sut.fieldDiff('foo', attrs, changes), {
          one: null,
          two: 'new string',
          four: [1,2,3],
        });



        assert.equals(sut.fieldDiff('foo', {}, changes), {
          two: 'new string', three: true, four: [1,2,3]});

        assert.equals(sut.fieldDiff('foo', attrs, {foo: 123}), 123);
        assert.equals(sut.fieldDiff('foo', {foo: {}}, {foo: new Date(2017, 1, 1)}),
                      new Date(2017, 1, 1));

        assert.equals(sut.fieldDiff('foo', attrs, {$partial: {foo: ['$replace', null]}}), {
          one: null, two: null, three: null
        });

        assert.equals(sut.fieldDiff('foo', {$partial: {foo: ['$replace', null]}}, attrs), {
          one: 123, two: 'a string', three: true
        });

        assert.equals(sut.fieldDiff('foo', {foo: {}}, {$partial: {
          foo: ['two', 'new string', 'three', true, 'four', [1,2,3]]
        }}), {
          two: 'new string', three: true, four: [1,2,3]});

        assert.equals(sut.fieldDiff('foo', {$partial: {
          foo: ['two', 'old string', 'three', true, 'five', 5]
        }}, attrs), {
          two: 'a string', five: null});
      },

      "test array"() {
        const attrs = {_id: 't123', foo: [1,2,3,4]};
        const changes = {foo: [1,2,4,5,6]};

        assert.equals(sut.fieldDiff('foo', attrs, changes), [2, 2, [4, 5, 6]]);

        assert.equals(sut.fieldDiff('foo', attrs, {$partial: {foo: ['$replace', null]}}),
                      [0, 4, []]);
        assert.equals(sut.fieldDiff('foo', {$partial: {foo: ['$replace', null]}}, attrs),
                      [0, 0, [1,2,3,4]]);

      },
    },
  });
});
