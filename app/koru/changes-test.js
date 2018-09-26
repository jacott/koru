define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const Changes = require('./changes');

  const {match: m} = TH;
  const {deepCopy} = util;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("has", ()=>{
      /**
       * test if undo has changed field
       **/
      api.method();
      assert.isTrue(Changes.has({foo: undefined}, 'foo'));
      assert.isTrue(Changes.has({foo: false}, 'foo'));
      assert.isFalse(Changes.has({foo: undefined}, 'bar'));
      assert.isTrue(Changes.has({$partial: {foo: undefined}}, 'foo'));
      assert.isFalse(Changes.has({$partial: {foo: undefined}}, 'bar'));
    });

    group("merge", ()=>{
      /**
       * Merge one set of changes into another.
       *
       * @param to the destination for the merges
       * @param from the source of the merges. Values may be assignment (not copied) to `to` so use
       * {#koru/util/deepCopy} if that is not intended.
       *
       * @returns `to`
       **/

      test("toplevel, partial", ()=>{
        api.method();
        // [
        const current = {title: 'The Bone', author: 'Kery Hulme', genre: ['Romance', 'Mystery']};
        assert.same(Changes.merge(current, {$partial: {
          title: ['$append', ' People'],
          author: ['$patch', [3, 1, 'i']],
          genre: ['$remove', ['Romance'], '$add', ['Drama']]
        }}), current);

        assert.equals(current, {
          title: 'The Bone People',
          author: 'Keri Hulme',
          genre: ['Mystery', 'Drama'],
        });
        //]

        Changes.merge(current, {$partial: {
          title: ['$replace', 'E nga iwi o nga iwi'],
          author: ['$prepend', 'Kai Tahu '],
          genre: ['$add', ['Drama']]
        }});

        assert.equals(current, {
          title: 'E nga iwi o nga iwi',
          author: 'Kai Tahu Keri Hulme',
          genre: ['Mystery', 'Drama'],
        });
      });

      test("partial, partial", ()=>{
        api.method();
        // [
        const current = {$partial: {
          title: ['$append', 'The Bone'],
          author: ['$prepend', 'Kery'],
        }};
        Changes.merge(current, {$partial: {
          title: ['$append', ' People'],
          author: ['$patch', [3, 1, 'i']],
          genre: ['$add', ['Mystery']]
        }});

        assert.equals(current, {$partial: {
          title: ['$append', 'The Bone', '$append', ' People'],
          author: ['$prepend', 'Kery', '$patch', [3, 1, 'i']],
          genre: ['$add', ['Mystery']],
        }});
        //]
      });

      test("partial, toplevel", ()=>{
        api.method();
        // [
        const current = {$partial: {
          title: ['$append', 'The Bone'],
          author: ['$prepend', 'Kery'],
        }};
        Changes.merge(current, {
          title: 'The Bone People',
          genre: ['Mystery'],
        });

        assert.equals(current, {
          title: 'The Bone People',
          genre: ['Mystery'],
          $partial: {author: ['$prepend', 'Kery'],}});
        //]
      });
    });

    group("applyOne", ()=>{
      /**
       * Apply only one attribute from changes
       */

      before(()=>{
        api.method();
      });

      test("simple changes", ()=>{
        //[
        const attrs = {bar: 1, foo: 2, fuz: 3, fiz: 4};
        const changes = {foo: null, fuz: undefined, fiz: 5, nit: 6};
        Changes.applyOne(attrs, 'foo', changes);
        Changes.applyOne(attrs, 'fuz', changes);
        Changes.applyOne(attrs, 'fiz', changes);
        Changes.applyOne(attrs, 'nit', changes);
        assert.equals(attrs, {bar: 1, fiz: 5, nit: 6});
        assert.equals(changes, {foo: 2, fuz: 3, fiz: 4, nit: m.null});
        //]
      });

      test("with non numeric array index", ()=>{
        // say "foo.bar.baz" instead of "foo.0.baz"
        assert.exception(() => {
          Changes.applyOne({a: [{b: [1]}]}, "a.0.b.x", {value: 2});
        }, 'Error', "Non numeric index for array: 'x'");

        assert.exception(() => {
          Changes.applyOne({a: [{b: [1]}]}, "a.x.b.0", {value: 2});
        }, 'Error', "Non numeric index for array: 'x'");
      });
    });

    group("applyAll", ()=>{
      /**
       * Apply all commands to an attributes object. Commands can have:

       * 1. a $match object which assert the supplied fields match the attribute

       * 2. a $partial object which calls applyPartial for each field; OR

       * 3. be a top level replacement value

       * @returns `undo` command which when applied to the updated attributes reverts it to its
       * original content. Calling {#.original} on undo will return the original commands
       * object
       **/

      before(()=>{
        api.method();
      });

      test("top level match", ()=>{
        //[
        // matches top level
        const attrs = {foo: 1, bar: "two"};
        const changes = {$match: {foo: 1, bar: {md5: "b8a9"}}};
        refute.exception(_=>{Changes.applyAll(attrs, changes)});
        assert.equals(attrs, {foo: 1, bar: "two"});
        assert.equals(changes, {$match: {foo: 1, bar: {md5: "b8a9"}}});
        //]
      });

      test("top level not match", ()=>{
        //[
        // bad checksum
        const attrs = {foo: 1, bar: {md5: "bad"}};
        const changes = {$match: {foo: 1, bar: "two"}};
        assert.exception(
          _=>{Changes.applyAll(attrs, changes)},
          {error: 409, reason: {bar: 'not_match'}}
        );
        //]
      });

      test("undo", ()=>{
        //[
        // can apply undo
        const attrs = {
          foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]},
          simple: [123]
        };
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
        const undo = Changes.applyAll(attrs, changes);
        //]
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
        //[
        assert.same(Changes.original(undo), changes);

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

        Changes.applyAll(attrs, undo);
        assert.equals(attrs, {
          foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]},
          simple: [123],
        });
        //]
      });

      test("applyAsDiff", ()=>{
        const doc = {index: {
          d: {dog: [123,234], donkey: [56,456]},
          p: {pig: [3, 34]}
        }};
        const patch = {index: {
          d: {dog: [123,234], deer: [34]},
          h: {horse: [23,344]},
          p: {pig: [3, 34]},
        }};
        const undo = Changes.applyAll(doc, patch);

        assert.equals(undo, {$partial: {index: [
          'h', null,
          'd.$partial', [
            'deer', null,
            'donkey', [56, 456]]
        ]}});

        const redo = Changes.applyAll(doc, {$partial: {index: [
          'h', null,
          'd.$partial', [
            'deer', null,
            'donkey', [56, 456]],
        ]}});

        assert.equals(redo, {$partial: {index: [
          'd.$partial', ['donkey', null, 'deer', [34]],
          'h', {horse: [23, 344]}
        ]}});

        assert.equals(doc, {index: {
          d: {dog: [123,234], donkey: [56,456]},
          p: {pig: [3, 34]}
        }});
      });

      test("no changes", ()=>{
        const attrs = {foo: 1, bar: [1,2]};
        const changes = {
          foo: 1,
          $partial: {
            bar: ['$add', [1]],
          },
        };
        ;
        assert.equals(Changes.applyAll(attrs, changes), {});
        assert.equals(attrs, {foo: 1, bar: [1, 2]});
      });

      test("null to object partial", ()=>{
        const attrs ={_id: 'idhw'};
        const changes = {$partial: {
          html: ['div.0.b', 'hello', 'input.$partial', ['id', 'world']],
        }};

        const undo = Changes.applyAll(attrs, changes);

        assert.equals(attrs, {
          _id: 'idhw',
          html: {div: [{b: 'hello'}], input: {id: 'world'}}});

        assert.equals(undo, {$partial: {html: ['$replace', null]}});
      });

      test("with objects", ()=>{
        const orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
        let changes = {a: 2, b: null, d: 4, $partial: {nest: ["bar", 'bar']}};

        const undo = Changes.applyAll(orig, changes);
        assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'bar'}, d: 4});
        assert.equals(undo, {a: 1, b: 2, d: null, $partial: {nest: ["bar", null]}});
        assert.same(undo.d, null);

        assert.equals(changes, {a: 2, b: null, d: 4, $partial: {nest: ["bar", 'bar']}});
        assert.same(changes.b, null);

        {
          const changes = {$partial: {nest: ["bar", 'new'], new: ["deep.list", 'deeplist']}};
          const undo = Changes.applyAll(orig, changes);

          assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'new'},
                               d: 4, new: {deep: {list: 'deeplist'}}});
          assert.equals(undo, {$partial: {nest: ["bar", 'bar'], "new": ['$replace', null]}});
        }
      });

      test("deleting array entry by string", ()=>{
        const orig = {a: [1,2,3]};
        const changes = {$partial: {a: ['1', undefined]}};

        assert.equals(Changes.applyAll(orig, changes), {$partial: {a: ['1', 2]}});
        assert.equals(orig.a, [1, 3]);
      });

      test("deleting array entry by number", ()=>{
        const orig = {a: [1,2,3]};
        const changes = {$partial: {a: [1, undefined]}};

        assert.equals(Changes.applyAll(orig, changes), {$partial: {a: ['1', 2]}});
        assert.equals(orig.a, [1, 3]);
      });

      test("already applied", ()=>{
        //[
        const ary = [1, 2, 3], aa = {aa: 1, ary};
        const b = [1, 2];
        const orig = {a: aa, b, c: 3, nest: {foo: 'foo'}};
        const changes = {
          a: {aa: 1, ab: 2, ary: [1, 4, 5, 6, 3]},
          b: [1, 2], c: 4, nest: {foo: 'foo'}};

        assert.equals(Changes.applyAll(orig, changes), {$partial: {
          a: ['ary.$partial', ['$patch', [1, 3, [2]]], 'ab', null]}, c: 3});
        assert.equals(aa, {aa: 1, ab: 2, ary});
        assert.equals(ary, [1, 4, 5, 6, 3]);
        assert.same(orig.a, aa);
        //]

        assert.equals(
          Changes.applyAll(orig.a, {aa: 1, ab: 2, ary: [1, 5, 4, 6, 3]}),
          {$partial: {ary: ['$patch', [1, 2, [4, 5]]]}}
        );
        assert.equals(ary, [1, 5, 4, 6, 3]);
      });

      test("with empty array", ()=>{
        const orig = {top: {ar: []}};
        const changes = {$partial: {top: ["ar.1.foo", 3]}};

        const undo = Changes.applyAll(orig, changes);

        assert.equals(orig, {top: {ar: [, {foo: 3}]}});
        assert.equals(undo, {$partial: {top: ['ar.1', null]}});
        Changes.applyAll(orig, undo);

        assert.equals(orig, {top: {ar: [,]}});
      });

      test("change array", ()=>{
        const orig = {top: {ar: []}};
        const changes = {$partial: {top: ["ar.0", 'new']}};

        assert.equals(Changes.applyAll(orig, changes), {$partial: {top: ['ar.0', undefined]}});
        assert.equals(orig, {top: {ar: ["new"]}});
      });

      test("with array", ()=>{
        const orig = {ar: [{foo: 1}, {foo: 2}]};
        const changes = {$partial: {ar: ["1.foo", 3]}};

        assert.equals(Changes.applyAll(orig, changes), {$partial: {ar: ['1.foo', 2]}});
        assert.equals(orig, {ar: [{foo: 1}, {foo: 3}]});
      });
    });

    test("nestedDiff", ()=>{
      /**
       * Create diff in partial format to the specified depth.
       *
       * @param was the previous value of the object

       * @param now the current value of the object

       * @param depth How deep to recurse subfields defaults to 0

       * @return diff in partial format
       **/
      api.method();
      //[
      const was = {level1: {level2: {iLike: 'I like three', numbers: [2, 9, 11]}}};
      const now = deepCopy(was);
      now.level1.level2.iLike = 'I like the rimu tree';
      now.level1.level2.iAlsoLike = 'Tuis';
      let changes = Changes.nestedDiff(was, now, 5);

      /** depth 5 **/
      assert.equals(changes, [
        'level1.$partial', [
          'level2.$partial', [
            'iLike.$partial', ['$patch', [9, 0, 'e rimu t']],
            'iAlsoLike', 'Tuis'
          ]]]);

      const wasCopy = deepCopy(was);
      Changes.applyAll({likes: wasCopy},  {$partial: {likes: changes}});
      assert.equals(wasCopy, now);

      /** depth 2 **/
      assert.equals(Changes.nestedDiff(was, now, 2), [
        'level1.$partial', ['level2.$partial', [
          'iLike', 'I like the rimu tree', 'iAlsoLike', 'Tuis',
        ]]]);

      /** depth 0 **/
      assert.equals(Changes.nestedDiff(was, now), [
        'level1', {level2: {
          iLike: 'I like the rimu tree', iAlsoLike: 'Tuis', numbers: [2, 9, 11]}}]);

      { /** arrays and multiple entries **/
        const now = deepCopy(was);
        now.level1.level2.numbers = [2, 3, 5, 7, 11];
        now.level1.level2a = 'Another branch';

        assert.equals(Changes.nestedDiff(was, now, 5), [
          'level1.$partial', [
            'level2.$partial', [
              'numbers.$partial', ['$patch', [1, 1, [3, 5, 7]]],
            ],
            'level2a', 'Another branch',
          ]]);
      }
      //]
    });

    test("nestedDiff continued", ()=>{
      assert.equals(Changes.nestedDiff({
        d: {dog: [123, 234], donkey: [56, 456]},
        p: {pig: [3, 34]}
      }, {
        d: {dog: [123, 234], deer: [34]},
        h: {horse: [23, 344]},
        p: {pig: [3, 34]}
      }, 5), [
        'd.$partial', ['donkey', null, 'deer', [34]],
        'h', {horse: [23, 344]},
      ]);
    });


    group("applyPartial", ()=>{
      group("$match", ()=>{
        before(()=>{
          /**
           * Match commands ensure we only update if the current value matches. The whole
           * transaction is aborted if the match is not satisfied.

           * Note: $match can be used on any type but $match.md5 and $match.sha256 can only be used
           * on strings
           **/
        });

        group("equal", ()=>{
          test("equal", ()=>{
            const attrs = {obj: {name: 'old name', number: 5}};
            const changes = ['$match', {name: 'old name', number: 5}];
            refute.exception(_=>{
              Changes.applyPartial(attrs, 'obj', changes);
            });
            assert.equals(attrs, {obj: {name: 'old name', number: 5}});
          });

          test("not equal", ()=>{
            const attrs = {obj: {name: 'old name', number: 5}};
            const changes = ['$match', {name: 'old name', number: 6}];
            assert.exception(_=>{
              Changes.applyPartial(attrs, 'obj', changes);
            }, {error: 409, reason: {obj: 'not_match'}});
          });
        });

        group("md5", ()=>{
          test("equal", ()=>{
            const attrs = {name: 'old name'};
            const changes = ['$match', {md5: '58a5352c62'}];
            refute.exception(_=>{
              Changes.applyPartial(attrs, 'name', changes);
            });
            assert.equals(attrs, {name: 'old name'});

          });

          test("not equal", ()=>{
            const attrs = {name: 'old name'};
            const changes = ['$match', {md5: '58a5352c63'}];
            assert.exception(_=>{
              Changes.applyPartial(attrs, 'name', changes);
            }, {error: 409, reason: {name: 'not_match'}});
          });
        });

        group("sha256", ()=>{
          test("equal", ()=>{
            const attrs = {name: 'old name'};
            const changes = ['$match', {sha256: '2b727fb85cff'}];
            refute.exception(_=>{
              Changes.applyPartial(attrs, 'name', changes);
            });
            assert.equals(attrs, {name: 'old name'});

          });

          test("not equal", ()=>{
            const attrs = {name: 'old name'};
            const changes = ['$match', {sha256: '2b727fb85cfe'}];
            assert.exception(_=>{
              Changes.applyPartial(attrs, 'name', changes);
            }, {error: 409, reason: {name: 'not_match'}});
          });
        });
      });

      group("$replace", ()=>{
        before(()=>{
          /**
           * Replace the content of the field. Add the field is does not exists. Delete the field if
           * value is null.
           **/
        });

        test("no change", ()=>{
          const attrs = {name: 'old name'};
          const changes = ['$replace', 'old name'];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'old name'});
          assert.equals(undo, []);
        });

        test("modify", ()=>{
          const attrs = {name: 'old name'};
          const changes = ['$replace', 'new name'];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'new name'});
          assert.equals(undo, ['$replace', 'old name']);
        });

        test("add", ()=>{
          const attrs = {};
          const changes = ['$replace', 'new name'];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'new name'});
          assert.equals(undo, ['$replace', null]);
        });

        test("delete", ()=>{
          const attrs = {name: 'old name'};
          const changes = ['$replace', null];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {});
          assert.equals(undo, ['$replace', 'old name']);
        });
      });

      group("$prepend, $append", ()=>{
        before(()=>{
          /**
           * Add contents to the start or end of a field. Fields can be of type string or array.
           **/
        });

        test("wrong type", ()=>{
          const attrs = {name: 123};
          const undo = [];
          assert.exception(_=>{
            Changes.applyPartial(attrs, 'name', ['$prepend', 'me'], undo);
          }, {error: 400, reason: {name: 'wrong_type'}});

          assert.exception(_=>{
            Changes.applyPartial(attrs, 'name', ['$append', 'me'], undo);
          }, {error: 400, reason: {name: 'wrong_type'}});
        });

        test("string", ()=>{
          const name = 'orig name';
          const attrs = {name};
          const prepend = 'put me at front', append = 'put me at end';
          const changes = ['$prepend', prepend, '$append', append];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'put me at frontorig nameput me at end'});
          assert.equals(undo, ['$patch', [
            0, prepend.length, null,
            -append.length, append.length, null
          ]]);
        });

        test("array", ()=>{
          const numbers = [2, 4, 3];
          const attrs = {numbers};
          const prepend = [45, 12], append = [16, 18];
          const changes = ['$prepend', prepend, '$append', append];
          const undo = [];
          Changes.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [45, 12, 2, 4, 3, 16, 18]});
          assert.equals(undo, ['$patch', [
            0, 2, null,
            -2, 2, null,
          ]]);
        });

        test("$append only", ()=>{
          const name = 'orig name';
          const attrs = {name};
          const append = 'put me at end';
          const changes = ['$append', append];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'orig nameput me at end'});
          assert.equals(undo, ['$patch', [
            -append.length, append.length, null
          ]]);
        });
      });

      group("$patch", ()=>{
        before(()=>{
          /**
           * Patch the field using an array of 3-tuples. A 3-tuple consists of:

           *   move-delta, delete-delta and add-content

           * Fields can be of type string or
           * array. Not allowed with $append, $prepend or $replace.
           **/
        });

        test("string", ()=>{
          const name = 'orig content';
          const attrs = {name};
          const changes = ['$patch', [
            0, 1, "",                 // delete only
            2, 4, "i was changed ",   // delete and add
            3, 0, "and I was added. " // add only
          ]];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'rii was changed nteand I was added. nt'});
          assert.equals(undo, ['$patch', [
            0, 0, "o",
            2, "i was changed ".length, "g co",
            3, "and I was added. ".length, null,
          ]]);
          const undo2 = [];
          Changes.applyPartial(attrs, 'name', undo, undo2);
          assert.equals(attrs, {name: 'orig content'});
          assert.equals(undo2, ['$patch', [
            0, 1, null,                 // delete only
            2, 4, "i was changed ",   // delete and add
            3, 0, "and I was added. " // add only
          ]]);

          const attrs2 = {name: 'Austin;'};
          Changes.applyPartial(attrs2, 'name', [
            '$patch', [0, 0, 'Jane ', 4, 1, 'e', -1, 1, '.']], []);
          assert.equals(attrs2.name, 'Jane Austen.');
        });

        test("-ve delta", ()=>{
          const name = 'orig content';
          const attrs = {name};
          const changes = ['$patch', [
            3, 0, "_",
            -4, 2, "-ve delta. ", // -ve deltas are always from end of content
          ]];
          const undo = [];
          Changes.applyPartial(attrs, 'name', changes, undo);
          assert.equals(attrs, {name: 'ori_g con-ve delta. nt'});
          assert.equals(undo, ['$patch', [
            3, 1, null,
            -13, 11, 'te',
          ]]);
          const undo2 = [];
          Changes.applyPartial(attrs, 'name', undo, undo2);
          assert.equals(attrs, {name: 'orig content'});
          assert.equals(undo2, ['$patch', [
            3, 0, "_",
            -4, 2, "-ve delta. ",
          ]]);
        });

        test("array", ()=>{
          const numbers = [1,2,3,4,5,6];
          const attrs = {numbers};
          const changes = ['$patch', [
            3, 0, [12, 18, 16],
            -3, 2, [15, 11], // -ve deltas are always from end of content
          ]];
          const undo = [];
          Changes.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [1, 2, 3, 12, 18, 16, 15, 11, 6]});
          assert.equals(undo, ['$patch', [
            3, 3, null,
            -3, 2, [4, 5],
          ]]);
          const undo2 = [];
          Changes.applyPartial(attrs, 'numbers', undo, undo2);
          assert.equals(attrs, {numbers: [1,2,3,4,5,6]});
          assert.equals(undo2, ['$patch', [
            3, 0, [12, 18, 16],
            -3, 2, [15, 11],
          ]]);
        });

        test("missing from", ()=>{
          const attrs = {}, undo = [];
          Changes.applyPartial(attrs, 'numbers', ['$patch', [0, 0, [1,2]]], undo);
          assert.equals(attrs, {numbers: [1,2]});
          assert.equals(undo, ['$patch', [0, 2, null]]);

          const undo2 = [];
          Changes.applyPartial(attrs, 'numbers', undo, undo2);

          assert.equals(attrs, {numbers: []});
          assert.equals(undo2, ['$patch', [0, 0, [1, 2]]]);
        });
      });

      group("$add, $remove", ()=>{
        before(()=>{
          /**
           * Add items unless already exists and remove items if they exist.

           * The $add and $remove commands can only be used with arrays
           **/
        });

        test("$add", ()=>{
          const attrs = {books: [{title: 's&s', author: 'JA'}]};
          const changes = [
            '$add', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 's&s', author: 'JA'}, {title: 'p&p', author: 'JA'}]});
          assert.equals(undo, ['$remove', [{title: 'p&p', author: 'JA'}]]);
        });

        test("$remove", ()=>{
          const attrs = {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]};
          const changes = [
            '$remove', [{title: 'p&p'}, {title: 'e'}],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 's&s', author: 'JA'}]});
          assert.equals(undo, ['$add', [{title: 'p&p', author: 'JA'}]]);
        });

        test("no change $add", ()=>{
          const attrs = {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]};
          const changes = [
            '$add', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}]});
          assert.equals(undo, []);
        });

        test("no change $remove", ()=>{
          const attrs = {books: []};
          const changes = [
            '$remove', [{title: 'p&p', author: 'JA'}, {title: 's&s', author: 'JA'}],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'books', changes, undo);
          assert.equals(attrs, {books: []});
          assert.equals(undo, []);
        });

        test("undo", ()=>{
          const numbers = [1,2,3,4,16,15];
          const attrs = {numbers};
          const changes = [
            '$add', [4, 7, 8],
            '$remove', [2, 9, 1],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'numbers', changes, undo);
          assert.equals(attrs, {numbers: [3, 4, 16, 15, 7, 8]});
          assert.equals(undo, [
            '$add', [1, 2],
            '$remove', [7, 8],
          ]);
          const undo2 = [];
          Changes.applyPartial(attrs, 'numbers', undo, undo2);
          assert.equals(attrs, {numbers: [3,4,16,15,1,2]});
          assert.equals(undo2, [
            '$add', [7, 8],
            '$remove', [1, 2],
          ]);
        });

        test("add to null", ()=>{
          const attrs = {};
          const changes = [
            '$add', ['a', 'b'],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'letters', changes, undo);
          assert.equals(attrs, {letters: ['a', 'b']});
          assert.equals(undo, [
            '$remove', ['a', 'b'],
          ]);
        });

        test("remove from null", ()=>{
          const attrs = {};
          const changes = [
            '$remove', ['a', 'b'],
          ];
          const undo = [];
          Changes.applyPartial(attrs, 'letters', changes, undo);
          assert.equals(attrs, {});
          assert.equals(undo, []);
        });
      });

      group("subfields", ()=>{
        let v = {};
        beforeEach(()=>{
          /**
           * Sub-fields can consist of field names or array indexes. If the last segment is
           * '$partial' then value is a partial command otherwise it is the replacement value.
           **/

          v.attrs = {html: {
            ol: [{li: {b: 'one'}}, {li: {b: 'two'}}, {li: ['3', ' ', 'three']}]
          }};
        });

        afterEach(()=>{
          v = {};
        });

        test("null to value", ()=>{
          const attrs = {index: {d: {dog: [123, 234], donkey: [56, 456]}, p: {pig: [3, 34]}}};
          const actions = [
            'd.$partial', ['donkey', null, 'deer', [34]],
            'h.$partial', ['horse', [23, 344]]];
          const key = 'index';
          const undo = [];

          Changes.applyPartial(attrs, key, actions, undo);

          assert.equals(undo, [
            'h.$partial', ['$replace', null],
            'd.$partial', ['deer', null, 'donkey', [56, 456]]]);
        });

        test("simple replacement", ()=>{
          const changes = [
            'ol.1.li.b', '2',
          ];

          const undo = [];
          Changes.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html.ol[1], {li: {b: '2'}});
          assert.equals(undo, [
            'ol.1.li.b', 'two',
          ]);
        });

        test("no change", ()=>{
          const changes = [
            'ol.2.li.0', '3',
          ];

          const old = deepCopy(v.attrs);
          const undo = [];
          Changes.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs, old);
          assert.equals(undo, []);
        });

        test("missing top", ()=>{
          const changes = ['div.1.i', 'hello', 'div.2.b', 'bye bye'];
          const undo = [];
          Changes.applyPartial(v.attrs, 'foo', changes, undo);
          assert.equals(v.attrs.foo, {div: [, {i: 'hello'}, {b: 'bye bye'}]});
          assert.equals(undo, [
            '$replace', null,
          ]);
          Changes.applyPartial(v.attrs, 'foo', undo, []);
          assert.equals(v.attrs, {html: m.object});
        });

        test("missing sub", ()=>{
          const changes = ['div.1.i', 'hello'];
          const undo = [];
          Changes.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html, {ol: m.object, div: [, {i: 'hello'}]});
          assert.equals(undo, [
            'div', null,
          ]);
          Changes.applyPartial(v.attrs, 'html', undo, []);
          assert.equals(v.attrs, {html: m.object});
        });

        test("partial", ()=>{
          const changes = [
            'ol.2.li.$partial', [
              '$add', ['4', '5']
            ]
          ];

          const undo = [];
          Changes.applyPartial(v.attrs, 'html', changes, undo);
          assert.equals(v.attrs.html.ol[2], {li: ['3', ' ', 'three', '4', '5']});
          assert.equals(undo, [
            'ol.2.li.$partial', [
              '$remove', ['4', '5']
            ],
          ]);
        });

        test("composite", ()=>{
          const attrs = {checklists: {
            cl1: {name: 'cl 1', items: {
              it1: {name: 'it 1'},
              it2: {name: 'it 2'},
            }},
            cl2: {name: 'cl 2'}
          }};
          const changes = [
            'cl1.items.it1.name.$partial', ['$append', 'chg'],
            'cl1.items.it2.name', 'new it 2',
          ];

          const orig = util.deepCopy(attrs);

          const undo = [];
          Changes.applyPartial(attrs, 'checklists', changes, undo);
          assert.equals(attrs.checklists.cl1, {
            name: 'cl 1', items: {it1: {name: 'it 1chg'}, it2: {name: 'new it 2'}}});

          const diff = Changes.nestedDiff(attrs, orig, 10);

          Changes.applyPartial(attrs, 'checklists', undo, []);

          assert.equals(attrs.checklists, orig.checklists);

          assert.equals(undo, [
            'cl1.items.it2.name', 'it 2',
            'cl1.items.it1.name.$partial', ['$patch', [-3, 3, null]]]);
        });
      });
    });

    test("original", ()=>{
      /**
       * Reteries the original set of changes from an `undo`. See {#.applyAll}
       **/
      api.method();
      const undo = {foo: 123}, orig = {foo: 456};

      Changes.setOriginal(undo, orig);
      assert.same(Changes.original(undo), orig);
    });

    test("updateCommands", ()=>{
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

      Changes.updateCommands(commands, modified, original);
      assert.equals(commands, {
        foo: 3,
        newone: [1,2,3],
        bar: {baz: [3], bif: 'six'},
        $partial: {
          buz: ['$append', '.foo'],
        },
      });
    });

    test("empty partial in updateCommands", ()=>{
      const commands = {
        $partial: {
          zip: ['$prepend', 'bar.'],
        },
        fuz: 5,
      };
      const modified = {fuz: 5, zip: 'zap'};
      const original = {fuz: 5, zip: 'bar.zip'};

      Changes.updateCommands(commands, modified, original);
      assert.equals(commands, {
        fuz: 5,
        zip: 'zap',
      });
    });

    test("extractChangeKeys", ()=>{
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

      const params = Changes.extractChangeKeys(attrs, changes);
      assert.equals(params, {foo: 1, bar: 2, fuz: null});
    });

    test("topLevelChanges", ()=>{
      /**
       * Extract top level fields that have changed given a set of attributes and a change command
       **/
      assert.equals(Changes.topLevelChanges({foo: {a: 1}}, {$partial: {foo: ['$replace', null]}}),
                    {foo: null});

      const attrs = {foo: 1, bar: 2, baz: {bif: [1, 2, {bob: 'text'}]}};
      const changes = {
        foo: 2,
        $partial: {
          baz: ['bif.2.bob', 'changed'],
        },
        fuz: 5,
      };

      const params = Changes.topLevelChanges(attrs, changes);
      assert.equals(params, {foo: 2, baz: {bif: [1, 2, {bob: 'changed'}]}, fuz: 5});
    });

    group("diffSeq", ()=>{
      before(()=>{
        /**
         * build an instruction to convert oldSeq to newSeq
         **/
      });

      test("equal", ()=>{
        assert.equals(Changes.diffSeq([1,2,3], [1,2,3]), undefined);
      });

      test("unicode", ()=>{
        assert.equals("bomb 🔜𝌆".length, 9);
        assert.equals(Array.from("bomb 🔜𝌆").length, 7);

        assert.equals(Changes.diffSeq("b💣mb 🔜𝌆abc", "b💣mb 💣abc"), [6, 4, "💣"]);
      });


      test("customCompare", ()=>{
        const o = n => ({a: n});
        assert.equals(Changes.diffSeq([1,2,3].map(o), [1,4,3].map(o), util.deepEqual), [
          1, 1, [{a: 4}]
        ]);
      });

      test("simple", ()=>{
        assert.equals(Changes.diffSeq([1,2,3,4,5,6], [1,2,2,8,7,5,6]), [
          2, 2, [2, 8, 7]
        ]);
        assert.equals(Changes.diffSeq([2,3,4,5,6], [1,2,2,8,7,5,6]), [
          0, 3, [1, 2, 2, 8, 7]
        ]);
        assert.equals(Changes.diffSeq([2,3,4,5,6], [1,2,2,8,7,5,6,1]), [
          0, 5, [1,2,2,8,7,5,6,1]
        ]);
      });

      test("string", ()=>{
        assert.equals(Changes.diffSeq("it1", "it21"), [2, 0, '2']);
        assert.equals(Changes.diffSeq("it21", "it1"), [2, 1, '']);
        assert.equals(Changes.diffSeq("cl 123.2", "cl 123"), [6, 2, '']);
        assert.equals(Changes.diffSeq("helo worlld", "hello world"), [3, 6, 'lo wor']);
        assert.equals(Changes.diffSeq("hello world", "helo worlld"), [3, 6, 'o worl']);
        assert.equals(Changes.diff("hello world", "helo worlld"), [3, 6, 'o worl']);
        assert.equals(Changes.diffSeq("hello world", "hello world"), undefined);
      });
    });

    test("applyPatch", ()=>{
      assert.equals(Changes.applyPatch("it1", [2, 0, '2']), "it21");
      assert.equals(Changes.applyPatch("it1", [0, 0]), "it1");
    });



    test("arrayChanges", ()=>{
      /**
       * Extract a list of added and removed elems from an after and before

       * Note: converts elements to strings to compare unless hash method supplied
       **/

      assert.equals(Changes.arrayChanges([1,2,6], [3,1]), {added: [2, 6], removed: [3]});
      assert.equals(Changes.arrayChanges([1,"5",6], [3,1]), {added: ["5", 6], removed: [3]});
      assert.equals(Changes.arrayChanges([1,"5",6]), {added: [1,"5",6], removed: []});
      assert.equals(Changes.arrayChanges(null, ["5", 1.2]), {added: [], removed: ["5", 1.2]});

      assert.equals(
        Changes.arrayChanges(
          [{id: 1, a: 2}, {id: 5, b: 3}], [{id: 5, b: 3}, {id: 'x', a: 2}],
          o=>''+o.id
        ),
        {added: [{id: 1, a: 2}], removed: [{id: 'x', a: 2}]});
    });

    group("fieldDiff", ()=>{
      before(()=>{
        /**
         * determine which sub-fields have changed

         * @param field the field to diff
         * @param from value (or undo partial) before change
         * @param to value (or apply partial) after change
         * @returns a partial command list
         **/
      });

      test("not in change", ()=>{
        api.method('fieldDiff');
        const attrs = {_id: 't123'};
        assert.equals(Changes.fieldDiff('foo', attrs, {fuz: '123'}), undefined);
      });

      test("no change", ()=>{
        api.method('fieldDiff');
        const attrs = {_id: 't123', foo: {one: 123, two: 'a string', three: true}};
        const changes = {foo: {one: 123, two: 'a string', three: true}};

        assert.equals(Changes.fieldDiff('foo', attrs, changes), undefined);
      });

      test("bad args", ()=>{
        assert.exception(_=>{
          Changes.fieldDiff('foo', undefined, {$partial: {}});
        }, {message: 'illegal arguments'});

        assert.exception(_=>{
          Changes.fieldDiff('foo', {$partial: {}}, undefined);
        }, {message: 'illegal arguments'});

        assert.exception(_=>{
          Changes.fieldDiff('foo', {$partial: {}}, {$partial: {}});
        }, {message: 'illegal arguments'});
      });

      test("fromTo", ()=>{
        const attrs = {one: {two: {three: {a: 123, b: 456}}}};
        const changes = {$partial: {one: ["two.three.b", 789]}};

        assert.equals(Changes.fromTo(['one', 'two', 'three'], attrs, changes), {
          from: {a: 123, b: 456}, to: {a: 123, b: 789}
        });
      });

      test("object", ()=>{
        const attrs = {_id: 't123', foo: {one: 123, two: 'a string', three: true}};
        const changes = {foo: {two: 'new string', three: true, four: [1,2,3]}};

        assert.equals(Changes.diff(attrs.foo, changes.foo), {
          one: null,
          two: 'new string',
          four: [1,2,3],
        });

        assert.same(Changes.fieldDiff('foo', null, null), undefined);

        assert.equals(Changes.fieldDiff('foo', attrs, undefined), {one: null, two: null, three: null});
        assert.equals(Changes.fieldDiff('foo', undefined, attrs),
                      {one: 123, two: 'a string', three: true});

        assert.equals(Changes.fieldDiff('foo', attrs, {}), {one: null, two: null, three: null});
        assert.equals(Changes.fieldDiff('foo', attrs, attrs), {});


        assert.equals(Changes.fieldDiff('foo', attrs, changes), {
          one: null,
          two: 'new string',
          four: [1,2,3],
        });



        assert.equals(Changes.fieldDiff('foo', {}, changes), {
          two: 'new string', three: true, four: [1,2,3]});

        assert.equals(Changes.fieldDiff('foo', attrs, {foo: 123}), 123);
        assert.equals(Changes.fieldDiff('foo', {foo: {}}, {foo: new Date(2017, 1, 1)}),
                      new Date(2017, 1, 1));

        assert.equals(Changes.fieldDiff('foo', attrs, {$partial: {foo: ['$replace', null]}}), {
          one: null, two: null, three: null
        });

        assert.equals(Changes.fieldDiff('foo', {$partial: {foo: ['$replace', null]}}, attrs), {
          one: 123, two: 'a string', three: true
        });

        assert.equals(Changes.fieldDiff('foo', {foo: {}}, {$partial: {
          foo: ['two', 'new string', 'three', true, 'four', [1,2,3]]
        }}), {
          two: 'new string', three: true, four: [1,2,3]});

        assert.equals(Changes.fieldDiff('foo', {$partial: {
          foo: ['two', 'old string', 'three', true, 'five', 5]
        }}, attrs), {
          two: 'a string', five: null});
      });

      test("array", ()=>{
        const attrs = {_id: 't123', foo: [1,2,3,4]};
        const changes = {foo: [1,2,4,5,6]};

        assert.equals(Changes.fieldDiff('foo', attrs, changes), [2, 2, [4, 5, 6]]);

        assert.equals(Changes.fieldDiff('foo', attrs, {$partial: {foo: ['$replace', null]}}),
                      [0, 4, []]);
        assert.equals(Changes.fieldDiff('foo', {$partial: {foo: ['$replace', null]}}, attrs),
                      [0, 0, [1,2,3,4]]);

      });
    });
  });
});
