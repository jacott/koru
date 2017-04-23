define(function(require, exports, module) {
  const util  = require('koru/util');

  function simpleCompare(a, b) {
    return a == b ? 0 : a < b ? -1 : 1;
  }

  class BTree {
    constructor(compare=simpleCompare) {
      this.root = null;
      this.compare = compare;
      BTree.tree = this;
    }

    _display() {return display(this.root)}

    each() {
      return each(this.root);
    }

    add(value) {
      const node = {value, left: null, right: null, up: null, red: true};
      if (! this.root) {
        this.root = node;
        node.red = false;
        return;
      }
      insert(this.root, this.compare, value, node);
      ic1(node);
      const g = this.root.up;
      if (g) {
        this.root = g;
      }
    }

    delete(value) {
      let {root} = this;
      const n = find(root, this.compare, value);
      if (! n) return null;

      const p = n.up;
      let {left, right: child} = n;
      if (left !== null && child !== null) {
        while (child.left) child = child.left;
        n.value = child.value;
        if (child.up === n)
          n.right = null;
        else
          child.up.left = null;
        return;
      }

      child = child || left;
      if (! child) {
        if (p) {
          n.red || dc1(n);
          if (root.up) {
            while (root.up) root = root.up;
            this.root = root;
          }
          if (p.left === n)
            p.left = null;
          else
            p.right = null;
        } else {
          this.root = null;
        }
        return;
      }
      if (p) {
        if (p.left === n) p.left = child; else p.right = child;
      } else {
        this.root = child;
      }
      child.up = p;
      if (! n.red)
        child.red = false;
    }

    [Symbol.iterator]() {
      const iter = each(this.root);
      return {
        next() {
          const node = iter.next();
          return {done: ! node, value: node && node.value};
        }
      };
    }
  };

  function sibling(n) {
    const p = n.up;
    return p && (n === p.left ? p.right : p.left);
  }

  function leftRed(n) {
    return n && n.left && n.left.red;
  }

  function rightRed(n) {
    return n && n.right && n.right.red;
  }

  function dc1(n) {
    if (n.up)
      dc2(n);
  }

  function dc2(n) {
    const p = n.up;
    const s = n === p.left ? p.right : p.left;

    if (s && s.red) {
      p.red = true;
      s.red = false;
      if (n === p.left)
        rotateLeft(p);
      else
        rotateRight(p);
    }
    dc3(n);
  }

  function dc3(n) {
    const p = n.up;
    const s = sibling(n);
    const sRed = s && s.red;
    if (! p.red && ! sRed && ! leftRed(s) && ! rightRed(s)) {
      if (s) s.red = true;
      dc1(p);
    } else {
      dc4(n);
    }
  }

  function dc4(n) {
    const p = n.up;
    const s = sibling(n);
    const sRed = s && s.red;


    if (p.red && ! sRed && ! leftRed(s) && ! rightRed(s)) {
      if (s) s.red = true;
      p.red = false;
    } else {
      dc5(n);
    }
  }

  function dc5(n) {
    const p = n.up;
    const s = sibling(n);
    const sRed = s && s.red;

    if  (! sRed) {
      if (n === p.left && leftRed(s) && ! rightRed(s)) {
        s.red = true;
        s.left.red = false;
        rotateRight(s);
      } else if (n === p.right && ! leftRed(s) && rightRed(s)) {
        s.red = true;
        s.right.red = false;
        rotateLeft(s);
      }
    }
    dc6(n);
  }

  function dc6(n) {
    const p = n.up;
    const s = sibling(n);
    const sRed = s && s.red;
    s.red = p.red;
    p.red = false;

    if (n === p.left) {
      s.right.red = false;
      rotateLeft(p);
    } else {
      s.left.red = false;
      rotateRight(p);
    }

  }

  function dc1x(n) {
    let p = n.up;
    if (! p) return;

    // dc2
    let s = n === p.left ? p.right : p.left;
    const sRed = s && s.red;
    const slRed = s && s.left && s.left.red;
    const srRed = s && s.right && s.right.red;

    if (sRed) {
      _koru_.info(n.value, BTree.tree._display());
      n.parent.red = true; // FIXME
      s.red = false;
      if (n === p.left)
        rotateLeft(p);
      else
        rotateRight(p);
      s = n === p.left ? p.right : p.left;
    }
    // dc3(n);
    if (! p.red && ! sRed && ! slRed && ! srRed) {
      if (s) s.red = true;
      dc1(p);
    } else if (p.red && ! sRed && ! slRed && ! srRed) {
      // dc4(n);
      if (! s) _koru_.info(n.value, BTree.tree._display());
      s.red = true;
      p.red = false;
    } else {
      // dc5(n)
      if  (! sRed) {
        if (n === p.left && ! srRed && slRed) {
          s.red = true;
          s.left.red = false;
          rotateRight(s);
          p = n.up;
          s = n === p.left ? p.right : p.left;
        } else if (n === p.right && ! slRed && srRed) {
          s.red = true;
          s.right.red = false;
          rotateLeft(s);
          p = n.up;
          s = n === p.left ? p.right : p.left;
        }
      }
      // dc6(n);
      s.red = p.red;
      p.red = false;

      if (n === p.left) {
        if (! s.right) _koru_.info(n.value, s.value, BTree.tree._display());
        s.right.red = false; // FIXME s null
        rotateLeft(p);
      } else {
        if (! s.left) _koru_.info(n.value, BTree.tree._display());
        s.left.red = false; // FIXME s null
        rotateRight(p);
      }
    }
  }

  function insert(parent, compare, value, node) {
    while (parent) {
      const field = compare(value, parent.value) < 0 ? 'left' : 'right';
      const fv = parent[field];
      if (! fv) {
        parent[field] = node;
        node.up = parent;
        break;
      }
      parent = fv;
    }
  }

  function find(n, compare, value) {
    while (n) {
      const cmp = compare(value, n.value);
      if (cmp === 0) return n;
      n = cmp < 0 ? n.left : n.right;
    }
    return null;
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
        if (n === p.right && p === g.left) { // FIXME no g
          rotateLeft(p);
          n = n.left;

        } else if (n === p.left && p === g.right) { // FIXME no g
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

  function each(node) {
    let dir = 1;

    return {
      next() {
        if (! node) return null;
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
    if (! node || level > 10) return '';
    return `
${pad(level, prefix)}${node.value}${node.red ? ' *' : ''}${display(
node.left, level+1, 'l')}${display(
node.right, level+1, 'r')}`;
  }

  return BTree;
});
