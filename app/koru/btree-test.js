define((require, exports, module) => {
  'use strict';
  /**
   * A Balanced Tree. Implemented using a

   * [Red-black tree](https://en.wikipedia.org/wiki/Red%E2%80%93black_tree).

   **/
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const BTree = require('koru/btree');
  const {left$, right$, up$, red$} = BTree[isTest];

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('constructor', () => {
      /**
       * Create an instance of BTree.

       * @param compare Function to test order of two keys (like `Array#sort`) defaults to

       * ```js
       * (a, b) => a == b ? 0 : a < b ? -1 : 1
       * ```

       * @param unique if `true` do not add entry if {##add} called with key already in tree;
       **/
      const BTree = api.class();
      //[
      const simple = new BTree();
      simple.add(5); simple.add(5); simple.add(1);
      assert.equals(Array.from(simple), [1, 5, 5]);

      const compCompare = (a, b) => {
        if (a === b) return 0;
        const ans = a.k1 - b.k1;
        return ans == 0 ? a.k2 - b.k2 : ans;
      };

      const composite = new BTree(compCompare, true);
      composite.add({k1: 4, k2: 5, name: '45'});
      composite.add({k1: 4, k2: 3, name: '43'});
      assert.same(
        composite.add({k1: 4, k2: 3, name: 'rep'}).value.name,
        '43');

      assert.equals(Array.from(composite).map((v) => v.name), ['43', '45']);
      //]
    });

    test('clear', () => {
      /**
       * Remove all entries
       */
      api.protoMethod();
      //[
      const tree = new BTree();
      tree.add(1);
      tree.add(2);
      tree.add(3);
      tree.clear();
      assert.same(tree.firstNode, null);

      assert.same(tree.size, 0);
      //]
    });

    test('cursor handles deletes', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20, 110, 120, 130, 95]);
      for (const v of tree) {
        tree.delete(v);
      }
      assertTree(tree, '');
    });

    test('duplicates', () => {
      const tree = new BTree();
      tree.add(5);
      tree.add(5);
      assertTree(tree, `
5
r  5 *
`);
      tree.delete(5);
      tree.delete(5);
      assertTree(tree, ``);
    });

    test('unique tree', () => {
      const tree = new BTree(void 0, true);
      tree.add(5);
      tree.add(5);
      tree.add(4);
      assertTree(tree, `
5
l  4 *
`);
      tree.delete(5);
      assertTree(tree, `4`);
      tree.delete(5);
      assertTree(tree, `4`);
    });

    group('traverse by nodes', () => {
      let tree;

      afterEach(() => {tree = null});

      const init = () => {
        api.example(() => {
          tree = new BTree();
          insertNodes(tree, [100, 50, 20, 110, 120, 130, 95]);
        });
        assertTree(tree, `
50
l  20
r  110 *
l    100
l      95 *
r    120
r      130 *
`);
      };

      test('nodeFrom', () => {
        /**
         * find node equal or greater than value
         **/
        api.protoMethod();
        init();
        //[#
        assert.same(tree.nodeFrom(35).value, 50);

        assert.same(tree.nodeFrom(95).value, 95);
        assert.same(tree.nodeFrom(5).value, 20);

        assert.same(tree.nodeFrom(200), null);
        //]
      });

      test('no right nodeFrom', () => {
        const tree = new BTree();
        insertNodes(tree, [10, 0]);
        assertTree(tree, `
10
l  0 *
`);
        assert.same(tree.nodeFrom(20), null);
      });

      test('nodeTo', () => {
        /**
         * find node equal or less than value
         **/
        api.protoMethod();
        init();
        //[#
        const n130 = tree.lastNode;
        assert.same(n130.value, 130);

        assert.same(tree.nodeTo(200), n130);
        assert.same(tree.nodeTo(10), null);
        assert.same(tree.nodeTo(95).value, 95);
        assert.same(tree.nodeTo(105).value, 100);
        //]
      });

      test('no left nodeFrom', () => {
        const tree = new BTree();
        insertNodes(tree, [10, 20]);
        assertTree(tree, `
10
r  20 *
`);
        assert.same(tree.nodeTo(0), null);
      });

      test('first, last on empty tree', () => {
        const tree = new BTree();
        assert.same(tree.firstNode, null);
        assert.same(tree.lastNode, null);
      });

      test('firstNode, nextNode', () => {
        init();
        const ans = [];
        for (let n = tree.firstNode; n !== null; n = tree.nextNode(n))
          ans.push(n.value);

        assert.equals(ans, [20, 50, 95, 100, 110, 120, 130]);
      });

      test('t-l-r', () => {
        const tree = new BTree();
        insertNodes(tree, [0, 100, 200, -100]);
        tree.delete(100);
        tree.delete(-100);
        tree.add(50);
        assertTree(tree, `
50
l  0 *
r  200 *
`);
        const ans = [];
        for (let n = tree.firstNode; n !== null; n = tree.nextNode(n))
          ans.push(n.value);

        assert.equals(ans, [0, 50, 200]);
      });

      test('lastNode, previousNode', () => {
        const tree = new BTree();
        buildTree(tree, `
1
l  -2
l    -3
l      -4
r      -2.5
r    -1.5
l      -1.7
r      -1.2
r  9
l    5 *
l      4
l        3
r        4.5
r      7
l        6
l          5.5 *
r        8
r    13 *
l      11
l        10
r        12
r      17
l        15 *
l          14
r          16
r        19 *
l          18
r          100
l            20 *
r            1000
        `);
        const ans = [];

        for (let n = tree.lastNode; n !== null; n = tree.previousNode(n))
          ans.push(n.value);

        assert.equals(ans, Array.from(tree).reverse());
      });
    });

    test('compare', () => {
      const myCompare = (a, b) => {
        a = a.key; b = b.key;
        return a == b ? 0 : a < b ? 1 : -1;
      };
      const tree = new BTree(myCompare);
      tree.add({key: 100, value: 'v100'});

      tree.add({key: 50, value: 'v50'});
      tree.add({key: 150, value: 'v150'});

      assert.equals(Array.from(tree), [
        {key: 150, value: 'v150'},
        {key: 100, value: 'v100'},
        {key: 50, value: 'v50'}]);
    });

    test('find', () => {
      /**
       * Find a value in the tree.

       * @param value find entry with same keys as `value`

       * @return {undefined|object} `undefined` if not found otherwise the value {##add;ed} to the
       * tree
       **/
      api.protoMethod();
      //[
      const tree = new BTree();
      insertNodes(tree, [100, 200, 50, 150, 250]);

      assert.same(tree.find(50), 50);
      assert.same(tree.find(49), void 0);
      assert.same(tree.find(150), 150);
      //]

      assert.same(tree.find(120), void 0);
      assert.same(tree.find(300), void 0);
    });

    test('findNode', () => {
      /**
       * Find a `node` in the tree that matches `value`. Be careful with the node; don't insert it
       * into another tree or change its keys; call {##deleteNode} first.

       * @param value contains the keys to find.

       * @return {undefined|object} `undefined` if `node` can't be found otherwise the matching
       * `node`.
       **/
      api.protoMethod();

      //[
      const tree = new BTree();
      insertNodes(tree, [100, 200, 50, 150, 250]);

      assert.same(tree.findNode(50).value, 50);
      assert.same(tree.findNode(49), void 0);
      assert.same(tree.findNode(150).value, 150);
      //]

      assert.same(tree.findNode(120), void 0);
      assert.same(tree.findNode(300), void 0);
    });

    test('insert balancing case 1,2,3', () => {
      /**
       * ensure correct coloring of tree
       **/
      const tree = new BTree();
      assert.equals(tree.root, null);
      const n123 = tree.add(123);
      assert.same(n123, tree.root);

      assertTree(tree, `
123
`);
      assert.same(tree.root[up$], null);
      const n456 = tree.add(456);
      assert.same(n456[up$], n123);
      assertTree(tree, `
123
r  456 *
`);
      assert.same(tree.root[up$], null);
      tree.add(13);
      assertTree(tree, `
123
l  13 *
r  456 *
`);
      tree.add(10);
      assertTree(tree, `
123
l  13
l    10 *
r  456
`);
    });

    test('case 4 left', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20, 110, 120, 130, 95]);
      assertTree(tree, `
50
l  20
r  110 *
l    100
l      95 *
r    120
r      130 *
`);
      tree.add(97);
      assertTree(tree, `
50
l  20
r  110 *
l    97
l      95 *
r      100 *
r    120
r      130 *
`);
    });

    test('case 4 right', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 200, 20, 10, 5, 105]);
      assertTree(tree, `
150
l  20 *
l    10
l      5 *
r    100
r      105 *
r  200
`);
      tree.add(103);
      assertTree(tree, `
150
l  20 *
l    10
l      5 *
r    103
l      100 *
r      105 *
r  200
`);
    });

    test('rotate sub left', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 50, 200]);
      assertTree(tree, `
100
l  50
r  150
r    200 *
`);

      tree.add(300);
      assertTree(tree, `
100
l  50
r  200
l    150 *
r    300 *
`);
    });

    test('rotate sub right', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 150, 20]);
      assertTree(tree, `
100
l  50
l    20 *
r  150
`);

      tree.add(10);
      assertTree(tree, `
100
l  20
l    10 *
r    50 *
r  150
`);
    });

    test('rotate root right', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20]);
      assertTree(tree, `
50
l  20 *
r  100 *
`);
    });

    test('rotate root left', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 170]);
      assertTree(tree, `
150
l  100 *
r  170 *
`);
    });

    test('iterator', () => {
      /**
       * iterate the tree in order
       **/
      api.protoMethod(Symbol.iterator);
      //[
      const tree = new BTree();
      insertNodes(tree, [123, 456]);
      assert.equals(Array.from(tree), [123, 456]);
      assert.equals(Array.from(tree), [123, 456]);
      const i = tree[Symbol.iterator]();
      tree.add(53);
      assert.equals(i.next().value, 53);
      assert.equals(Array.from(tree), [53, 123, 456]);
      //]
    });

    test('forEach', () => {
      /**
       * call body for each iteration in order
       **/
      const tree = new BTree();
      insertNodes(tree, [123, 456]);
      const ans = [];
      tree.forEach((v) => ans.push(v));
      assert.equals(ans, [123, 456]);
      tree.add(53); ans.length = 0;
      tree.forEach((v) => ans.push(v));
      assert.equals(ans, [53, 123, 456]);
    });

    test('values from to', () => {
      const tree = new BTree();
      insertNodes(tree, [1, 3, 6, 7, 8, 45, 63, 42]);
      assertTree(tree, `
7
l  3 *
l    1
r    6
r  45 *
l    8
r      42 *
r    63
`);

      assert.equals(Array.from(tree.values({from: 2, to: 43})), [3, 6, 7, 8, 42]);
      assert.equals(Array.from(tree.nodes({from: 2, to: 43})).map((n) => n.value), [3, 6, 7, 8, 42]);

      assert.equals(Array.from(tree.values({from: 7})), [7, 8, 42, 45, 63]);

      assert.equals(Array.from(tree.values({from: 4, to: 43})), [6, 7, 8, 42]);
      assert.equals(Array.from(tree.values({from: 0, to: 45})), [1, 3, 6, 7, 8, 42, 45]);
      assert.equals(Array.from(tree.values({from: 4, to: 5})), []);
      assert.equals(Array.from(tree.values({
        from: 7, to: 45, excludeFrom: true, excludeTo: true})), [8, 42]);
      assert.equals(Array.from(tree.values({
        from: 7, to: 45, excludeFrom: true, excludeTo: false})), [8, 42, 45]);
      assert.equals(Array.from(tree.values({
        from: 7, to: 45, excludeFrom: false, excludeTo: true})), [7, 8, 42]);
    });

    test('direction -1 cursor from to', () => {
      const tree = new BTree();
      insertNodes(tree, [1, 3, 6, 7, 8, 45, 63, 42]);

      assert.equals(Array.from(tree.values({from: 46, direction: -1})), [45, 42, 8, 7, 6, 3, 1]);
      assert.equals(Array.from(tree.values({from: 45, direction: -1})), [45, 42, 8, 7, 6, 3, 1]);
      assert.equals(Array.from(tree.values({to: 6, direction: -1})), [63, 45, 42, 8, 7, 6]);
      assert.equals(Array.from(tree.values({
        from: 45, to: 7, direction: -1, excludeFrom: true, excludeTo: true})), [42, 8]);
      assert.equals(Array.from(tree.values({
        from: 45, to: 7, direction: -1, excludeFrom: true, excludeTo: false})), [42, 8, 7]);
      assert.equals(Array.from(tree.values({
        from: 45, to: 7, direction: -1, excludeFrom: false, excludeTo: true})), [45, 42, 8]);
    });

    test('delete next while iterating', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 200, 50, 150, 250]);
      const iter = tree.nodes({from: 100, to: 250});
      assert.same(iter.next().value.value, 100);
      tree.delete(150);
      assert.same(iter.next().value, void 0);
    });

    test('delete prev while iterating', () => {
      const tree = new BTree();
      insertNodes(tree, [100, 200, 50, 150, 250]);
      const iter = tree.nodes({from: 250, to: 100, direction: -1});
      assert.same(iter.next().value.value, 250);
      tree.delete(200);
      assert.same(iter.next().value, void 0);
    });

    group('trivial delete', () => {
      test('delete node with two-non-leaf children', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 50, 150, 250]);
        assertTree(tree, `
100
l  50
r  200
l    150 *
r    250 *
`);
        const n200 = tree.nodeFrom(200);
        assert.same(tree.delete(200), n200);
        assertTree(tree, `
100
l  50
r  250
l    150 *
`);
        const n150 = tree.nodeFrom(150);
        assert.same(tree.delete(100).value, 100);
        assert.same(tree.root, n150);
        assertTree(tree, `
150
l  50
r  250
`);
      });

      test('deleteNode, addNode', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 50, 150, 250]);
        const n = tree.deleteNode(tree.root);
        assert.same(n.value, 100);
        assertTree(tree, `
150
l  50
r  200
r    250 *
`);
        tree.addNode(n);
        n.value = 99;
        assert.same(tree.deleteNode(n), n);
        assert.same(tree.addNode(n), n);
        assertTree(tree, `
150
l  50
r    99 *
r  200
r    250 *
`);
        assert.same(n[up$].value, 50);

        assert.same(tree.deleteNode(n), n);
        assert.same(tree.deleteNode(n), void 0);
      });

      test('deleteNode with two-children and right has left child', () => {
        const tree = new BTree();
        buildTree(tree, `
1703
l  498
l    469 *
l      404
r    546 *
l      506
r        545 *
`);
        tree.delete(498);
        assertTree(tree, `
1703
l  506
l    469 *
l      404
r    546 *
l      545
`);
      });

      test('delete root with no children', () => {
        const tree = new BTree();
        assert.same(tree.size, 0);
        insertNodes(tree, [100]);
        assert.same(tree.size, 1);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, '');
        assert.same(tree.size, 0);
      });

      test('delete red with no children', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 150, 250]);
        assertTree(tree, `
150
l  100
r  200
r    250 *
`);
        assert.same(tree.delete(250).value, 250);
        assertTree(tree, `
150
l  100
r  200
`);
      });

      test('delete black with one red child', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 150, 250]);
        assertTree(tree, `
150
l  100
r  200
r    250 *
`);
        assert.same(tree.delete(200).value, 200);
        assertTree(tree, `
150
l  100
r  250
`);
      });

      test('root with one red child', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 200]);
        assertTree(tree, `
100
r  200 *
`);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, `
200
`);
      });
    });

    group('complex delete black with no children', () => {
      test('dc1: root with no children', () => {
        const tree = new BTree();
        tree.add(100);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, ``);
      });

      test('dc1: N is the new root', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200]);
        const p = tree.root;
        p[left$][red$] = false;
        p[right$][red$] = false;
        assertTree(tree, `
150
l  100
r  200
`);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, `
150
r  200 *
`);
      });

      test('dc2.l: sibling is red and N left of P -> dc4: P red but S, Sl and Sr are black', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 220, 210, 230]);
        assertTree(tree, `
150
l  100
r  210 *
l    200
r    220
r      230 *
`);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, `
210
l  150
r    200 *
r  220
r    230 *
`);
      });

      test('dc2.r: sibling is red and N right of P', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 90, 80, 60, 70, 30]);
        assertTree(tree, `
90
l  70 *
l    60
l      30 *
r    80
r  100
`);
        assert.same(tree.delete(100).value, 100);
        assertTree(tree, `
70
l  60
l    30 *
r  90
l    80 *
`);
      });

      test('dc4 with no sibling', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 210]);
        const p = tree.root[right$];
        p[red$] = true;
        p[right$][red$] = false;
        assertTree(tree, `
150
l  100
r  200 *
r    210
`);
        assert.same(tree.delete(210).value, 210);
        assertTree(tree, `
150
l  100
r  200
`);
      });

      test('dc3: P, S, Sl and Sr are black', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 220, 210]);
        const p = tree.root[right$];
        p[left$][red$] = false;
        p[right$][red$] = false;
        assertTree(tree, `
150
l  100
r  210
l    200
r    220
`);
        assert.same(tree.delete(200).value, 200);
        assertTree(tree, `
150
l  100 *
r  210
r    220 *
`);
      });

      test('dc5.l: Sl is red but S and Sr are black and N left of P', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 220, 210, 215]);
        assertTree(tree, `
150
l  100
r  210 *
l    200
r    220
l      215 *
`);
        assert.same(tree.delete(200).value, 200);
        assertTree(tree, `
150
l  100
r  215 *
l    210
r    220
`);
      });

      test('dc5.r: Sr is red but S and Sl are black and N right of P', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 90, 80, 10, 70, 30]);
        assertTree(tree, `
90
l  70 *
l    10
r      30 *
r    80
r  100
`);
        assert.same(tree.delete(80).value, 80);
        assertTree(tree, `
90
l  30 *
l    10
r    70
r  100
`);
        assert.same(tree.delete(80), void 0);
        assert.same(tree.size, 5);
      });

      test('no S', () => {
        const tree = new BTree();
        insertNodes(tree, [100, 110]);
        const n = tree.root[right$];
        n[red$] = false;
        assertTree(tree, `
100
r  110
`);
        assert.same(tree.delete(110).value, 110);
        assertTree(tree, `
100
`);
      });
    });

    // test("random", ()=>{
    //   const tree = new BTree();
    //   const list = [];
    //   const cl = [];
    //   try {
    //     for(let i = 0; i < 100; ++i) {
    //       if (list.length && Math.random() < .4) {
    //         const value = list[Math.floor(Math.random() * list.length)];
    //         cl.push('-'+value);
    //         tree.delete(value);
    //       }
    //       const value = Math.floor(Math.random()*10000000);
    //       cl.push('+'+value);
    //       list.push(value);
    //       tree.add(value);
    //     }
    //     assert.equals(Array.from(tree), Array.from(tree).sort((a, b) => a - b));

    //   } catch(ex) {
    //     koru.info(`cl`, koru.util.inspect(cl));
    //     throw ex;
    //   }
    //   assertCheck(tree);
    // });
  });

  const assertTree = (tree, exp='') => {
    assert.elide(() => {
      try {
        tree._assertValid();
      } catch (ex) {
        if (ex.displayError) {
          assert(false, ex.displayError((n) => n));
        } else {
          throw ex;
        }
      }
      const act = tree._display().trim();
      assert(act === exp.trim(), `got
${act}

but expected
${exp}
             `);
    });
  };

  const insertNodes = (tree, list) => {list.forEach((k) => tree.add(k))};

  const buildTree = (tree, graph) => {
    let curr, cl = 0;
    graph.trim().split('\n').forEach((line) => {
      if (! curr) {
        curr = tree.add(+line);
      } else {
        const [left, levelStr, value, _1, star] = line.split(/(\s+)/);
        const level = levelStr.length / 2;
        while (level <= cl) {
          --cl;
          curr = curr[up$];
        }
        const node = {value: +value, [left$]: null, [right$]: null, [up$]: curr, [red$]: star === '*'};
        curr[left === 'l' ? left$ : right$] = node;
        cl = level;
        curr = node;
      }
    });
    tree._recalcSize();
  };

  const run = (list) => {
    const tree = new BTree();
    for (const i of list) {
      const value = +i.slice(1);
      if (i[0] === '-') {
        tree.delete(value);
      } else {
        tree.add(value);
      }
    }
    return tree;
  };
});
