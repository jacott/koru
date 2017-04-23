define(function (require, exports, module) {
  const koru = require('koru');
  const TH   = require('koru/test-helper');

  const BTree = require('./btree');
  var v;

  function assertCheck(tree) {
    const {root, compare} = tree;
    let prev = null;
    const iter = tree.each();
    let node, max = 0;
    let blackExp = -1;
    while (node = iter.next()) {
      assert.msg(() => `out of order at ${node.value}\n${tree._display()}`)
      (! prev || compare(prev, node) > 0 , ' ');
      let count = 1;
      let bc = node.left || node.right ? -1 : 0;
      for (let p = node; p !== root; p = p.up) {
        ++count;
        if (p.red) {
          assert.msg(() => `dup red at ${p.value} leaf: ${node.value}\n${tree._display()}`)
          (! p.up.red, ' ');
        } else if (bc >=0) ++bc;
        }
      if (bc < 0 || blackExp === -1)
        blackExp = bc;
      else
        assert.msg(() => `back exp: ${blackExp}, act: ${bc}, at ${node.value}\n${tree._display()}`)
      (blackExp === bc, ' ');

      max = Math.max(max, count);

      prev = node;
    }
    return max;
  }

  function assertTree(tree, exp='') {
    assertCheck(tree);
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
    },

    "test case 4 left"() {
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
    },

    "test rotate root right"() {
      const tree = new BTree();
      insertNodes(tree, [100, 50, 20]);
      assertTree(tree, `
50
l  20 *
r  100 *
`);
    },

    "test rotate root left"() {
      const tree = new BTree();
      insertNodes(tree, [100, 150, 170]);
      assertTree(tree, `
150
l  100 *
r  170 *
`);
    },

    "test iterator"() {
      /**
       * iterator tree in order
       **/
      const tree = new BTree();
      insertNodes(tree, [123, 456, 53]);
      assert.equals(Array.from(tree), [53, 123, 456]);
    },

    "trivial delete": {
      "test delete node with two-non-leaf children"() {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 50, 150, 250]);
        assertTree(tree, `
100
l  50
r  200
l    150 *
r    250 *
`);
        tree.delete(200);
        assertTree(tree, `
100
l  50
r  250
l    150 *
`);
        tree.delete(100);
        assertTree(tree, `
150
l  50
r  250
`);
      },

      "test delete red with no children"() {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 150, 250]);
        assertTree(tree, `
150
l  100
r  200
r    250 *
`);
        tree.delete(250);
        assertTree(tree, `
150
l  100
r  200
`);
      },

      "test delete black with one red child"() {
        const tree = new BTree();
        insertNodes(tree, [100, 200, 150, 250]);
        assertTree(tree, `
150
l  100
r  200
r    250 *
`);
        tree.delete(200);
        assertTree(tree, `
150
l  100
r  250
`);
      },

      "test root with one red child"() {
        const tree = new BTree();
        insertNodes(tree, [100, 200]);
        assertTree(tree, `
100
r  200 *
`);
        tree.delete(100);
        assertTree(tree, `
200
`);
      },
    },

    "complex delete black with no children": {
      "test dc1: root with no children"() {
        const tree = new BTree();
        tree.add(100);
        tree.delete(100);
        assertTree(tree, ``);
      },

      "test dc1: N is the new root"() {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200]);
        const p = tree.root;
        p.left.red = false;
        p.right.red = false;
        assertTree(tree, `
150
l  100
r  200
`);
        tree.delete(100);
        assertTree(tree, `
150
r  200 *
`);
      },

      "test dc2.l: sibling is red and N left of P -> dc4: P red but S, Sl and Sr are black"() {
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
        tree.delete(100);
        assertTree(tree, `
210
l  150
r    200 *
r  220
r    230 *
`);
      },

      "test dc2.r: sibling is red and N right of P"() {
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
        tree.delete(100);
        assertTree(tree, `
70
l  60
l    30 *
r  90
l    80 *
`);
      },

      "test dc4 with no sibling"() {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 210]);
        const p = tree.root.right;
        p.red = true;
        p.right.red = false;
        assertTree(tree, `
150
l  100
r  200 *
r    210
`);
        tree.delete(210);
        assertTree(tree, `
150
l  100
r  200
`);
      },


      "test dc3: P, S, Sl and Sr are black"() {
        const tree = new BTree();
        insertNodes(tree, [100, 150, 200, 220, 210]);
        const p = tree.root.right;
        p.left.red = false;
        p.right.red = false;
        assertTree(tree, `
150
l  100
r  210
l    200
r    220
`);
        tree.delete(200);
        assertTree(tree, `
150
l  100 *
r  210
r    220 *
`);
      },

      "test dc5.l: Sl is red but S and Sr are black and N left of P"() {
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
        tree.delete(200);
        assertTree(tree, `
150
l  100
r  215 *
l    210
r    220
`);
      },

      "test dc5.r: Sr is red but S and Sl are black and N right of P"() {
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
        tree.delete(80);
        assertTree(tree, `
90
l  30 *
l    10
r    70
r  100
`);
      },

      "test no S"() {
        const tree = new BTree();
        insertNodes(tree, [100, 110]);
        const n = tree.root.right;
        n.red = false;
        assertTree(tree, `
100
r  110
`);
        tree.delete(110);
        assertTree(tree, `
100
`);
      },
    },

    // "test random"() {
    //   const tree = new BTree();
    //   const list = [];
    //   const cl = [];
    //   try {
    //   for(let i = 0; i < 100000; ++i) {
    //     if (list.length && Math.random() < .4) {
    //       const value = list[Math.floor(Math.random() * list.length)];
    //       cl.push('-'+value);
    //       tree.delete(value);
    //     }
    //     const value = Math.floor(Math.random()*10000000);
    //       cl.push('+'+value);
    //       list.push(value);
    //       tree.add(value);
    //   }
    //   } catch(ex) {
    //     koru.info(`cl`, koru.util.inspect(cl));
    //     throw ex;
    //   }
    //   assertCheck(tree);
    // },
  });

  function run(list) {
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
  }
});
