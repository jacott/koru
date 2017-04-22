define(function(require, exports, module) {
  const util  = require('koru/util');

  function simpleCompare(a, b) {
    return a == b ? 0 : a < b ? -1 : 1;
  }

  class BTree {
    constructor(compare=simpleCompare) {
      this.root = null;
      this.compare = compare;
    }

    _display() {return display(this.root)}

    each() {
      return each(this.root);
    }

    add(key) {
      const node = {key, left: null, right: null, up: null, red: true};
      if (! this.root) {
        this.root = node;
        node.red = false;
        return;
      }
      insert(this.root, this.compare, key, node);
      ic1(node);
      const g = this.root.up;
      if (g) {
        this.root = g;
      }
    }

    [Symbol.iterator]() {
      const iter = each(this.root);
      return {
        next() {
          const node = iter.next();
          return {done: ! node, value: node && node.key};
        }
      };
    }
  };

  function insert(parent, compare, key, node) {
    while (parent) {
      const field = compare(key, parent.key) < 0 ? 'left' : 'right';
      const fv = parent[field];
      if (! fv) {
        parent[field] = node;
        node.up = parent;
        break;
      }
      parent = fv;
    }
  }

  function ic1(n) {
    while (n.up) {
      // ic2
      if (! n.up.red) return;
      // ic3

      const p = n.up;
      const g = p && p.up;
      const u = g ? n.up === g.left ? g.right : g.left : null;
      if (u && u.red) {
        n.up.red = false;
        u.red = false;
        g.red = true;
        n = g;
      } else { // ic4
        if (n === p.right && p === g.left) {
          rotateLeft(p);
          n = n.left;

        } else if (n === p.left && p === g.right) {
          rotateRight(p);
          n = n.right;
        }

        { // ic5
          const p = n.up, g = p.up;
          p.red = false;
          g.red = true;
          if (n === p.left)
            rotateRight(g);
          else
            rotateLeft(g);
        }

        return;
      }
    }
    n.red = false;
  }

  function rotateLeft(n) {
    const g = n.up;
    const r = n.right;
    const rl = r.left;
    n.right = rl; if (rl) rl.up = n;
    if (g) {
      if (g.left === n)
        g.left = r;
      else
        g.right = r;
    }
    r.up = g;
    r.left = n; n.up = r;
  }

  function rotateRight(n) {
    const g = n.up;
    const l = n.left;
    const lr = l.right;
    n.left = lr; if (lr) lr.up = n;
    if (g) {
      if (g.left === n)
        g.left = l;
      else
        g.right = l;
    }
    l.up = g;
    l.right = n; n.up = l;
  }

  function grandparent(node) {
    return node && node.up && node.up.up;
  }

  function uncle(node, g=grandparent(node)) {
    return g ? node.up === g.left ? g.right : g.left : null;
  }

  function each(node) {
    let dir = 1;

    return {
      next() {
        switch (dir) {
        case 3:
          if (node.right)
            node = node.right;
          dir = 1;
          // fall through
        case 1:
          while (node.left)
            node = node.left;
          dir = 2;
          return node;
        case 2:
          while (node.up && node.up.right === node)
            node = node.up;
          const {up} = node;
          if (! up)
            return null;
          if (up.right)
            dir = 3;
          return node = up;
        }
      },
    };
  }

  function pad(level, pad) {
    for(let i = 0; i < level; ++i) pad+= '  ';
    return pad;
  }

  function display(node, level=0, prefix='') {
    if (! node || level > 5) return '';
    return `
${pad(level, prefix)}${node.key}${node.red ? ' *' : ''}${display(
node.left, level+1, 'l')}${display(
node.right, level+1, 'r')}`;
  }

  return BTree;
});
