define(function (require, exports, module) {
  const TH = require('koru/test-helper');

  const BTree = require('./btree');
  var v;

  function assertCheck(tree) {
    const {root, compare} = tree;
    let prev = null;
    const iter = tree.each();
    let node, max = 0;
    let blackExp = -1;
    while (node = iter.next()) {
      assert(! prev || compare(prev, node) > 0,
             () => `out of order at ${node.key}\n${tree._display()}`);
      let count = 1;
      let bc = node.left || node.right ? -1 : 0;
      for (let p = node; p !== root; p = p.up) {
        ++count;
        if (p.red) {
          assert(! p.up.red,
                 () => `dup red at ${p.key}\n${tree._display()}`);
        } else if (bc >=0) ++bc;
        }
      if (bc < 0 || blackExp === -1)
        blackExp = bc;
      else
        assert(blackExp === bc,
               () => `back exp: ${blackExp}, act: ${bc}, at ${node.key}\n${tree._display()}`);

      max = Math.max(max, count);

      prev = node;
    }
    return max;
  }

  function assertTree(tree, exp) {

    const act = tree._display().trim();
    assert.elideFromStack(act === exp.trim(), `got
${act}

but expected
${exp}
`);
  }

  function insertNodes(tree, list) {
    list.forEach(k => tree.add(k));
  }

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test compare"() {
      function myCompare(a, b) {
        a = a.key; b = b.key;
        return a == b ? 0 : a < b ? 1 : -1;
      }
      const tree = new BTree(myCompare);
      tree.add({key: 100, value: "v100"});
      tree.add({key: 50, value: "v50"});
      tree.add({key: 150, value: "v150"});

      assert.equals(Array.from(tree), [
        {key: 150, value: 'v150'},
        {key: 100, value: 'v100'},
        {key: 50, value: 'v50'}]);
    },

    "test insert balancing case 1,2,3"() {
      /**
       * ensure correct coloring of tree
       **/
      const tree = new BTree();
      assert.equals(tree.root, null);
      tree.add(123);
      assertTree(tree, `
123
`);
      tree.add(456);
      assertTree(tree, `
123
r  456 *
`);
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
      assertCheck(tree);
    },

    "test case 4 left"() {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20, 110, 120, 130, 95]);
      assertCheck(tree);
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
      assertCheck(tree);
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
    },

    "test case 4 right"() {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 200, 20, 10, 5, 105]);
      assertCheck(tree);
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
      assertCheck(tree);
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
    },

    "test rotate sub left"() {
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
      assertCheck(tree);
    },

    "test rotate sub right"() {
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
      assertCheck(tree);
    },

    "test rotate root right"() {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20]);
      assertTree(tree, `
50
l  20 *
r  100 *
`);
      assertCheck(tree);
    },

    "test rotate root left"() {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 170]);
      assertTree(tree, `
150
l  100 *
r  170 *
`);
      assertCheck(tree);
    },

    "test iterator"() {
      /**
       * iterator tree in order
       **/
      const tree = new BTree();
      [123, 456, 53].forEach(i => {tree.add(i)});
      assert.equals(Array.from(tree), [53, 123, 456]);
    },
  });
});
