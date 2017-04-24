define(function(require, exports, module) {
  const util  = require('koru/util');

  function simpleCompare(a, b) {return a == b ? 0 : a < b ? -1 : 1}

  const sizeSym = Symbol();

  class BTree {
    constructor(compare=simpleCompare) {
      this.root = null;
      this.compare = compare;
      BTree.tree = this;
      this[sizeSym] = 0;
    }

    get size() {return this[sizeSym]};

    _display(formatter=n => n) {return display(formatter, this.root)}

    cursor(opts={}) {
      return cursor(this.root, opts, this.compare);
    }

    add(value) {
      const node = {value, left: null, right: null, up: null, red: true};
      ++this[sizeSym];
      if (this.root === null) {
        this.root = node;
        node.red = false;
        return;
      }
      insert(this.root, this.compare, value, node);
      ic1(node);
      const g = this.root.up;
      if (g !== null) {
        this.root = g;
      }
    }

    delete(value) {
      let {root} = this;
      const n = find(root, this.compare, value);
      if (n === null) return false;

      --this[sizeSym];
      const p = n.up;
      let {left, right: child} = n;
      if (left !== null && child !== null) {
        while (child.left !== null) child = child.left;
        n.value = child.value;
        if (child.up === n)
          n.right = null;
        else
          child.up.left = null;
        return true;
      }

      if (child === null) child = left;
      if (child === null) {
        if (p !== null) {
          n.red || dc1(n);
          if (root.up !== null) {
            while (root.up !== null) root = root.up;
            this.root = root;
          }
          if (p.left === n) p.left = null; else p.right = null;
        } else {
          this.root = null;
        }
        return true;
      }
      if (p !== null) {
        if (p.left === n) p.left = child; else p.right = child;
      } else {
        this.root = child;
      }
      child.up = p;
      if (! n.red)
        child.red = false;

      return true;
    }

    [Symbol.iterator]() {
      return cursor(this.root, {})[Symbol.iterator]();
    }
  };

  function dc1(n) {
    let p = null;
    while ((p = n.up) !== null) {
      if (p === null) return;

      // dc2(n);
      let s = n === p.left ? p.right : p.left;

      if (s !== null && s.red) {
        p.red = true;
        s.red = false;
        if (n === p.left)
          rotateLeft(p);
        else
          rotateRight(p);
        s = n === p.left ? p.right : p.left;
      }
      // dc3(n);
      let sRed = s !== null && s.red;
      const slRed = s !== null && s.left !== null && s.left.red;
      const srRed = s !== null && s.right !== null && s.right.red;
      if (! p.red && ! sRed && ! slRed && ! srRed) {
        if (s !== null) s.red = true;
        n = p;
      } else {
        // dc4(n);
        if (p.red && ! sRed && ! slRed && ! srRed) {
          if (s !== null) s.red = true;
          p.red = false;
        } else {
          // dc5(n);
          if  (! sRed) {
            if (n === p.left && slRed && ! srRed) {
              s.red = true;
              s.left.red = false;
              rotateRight(s);
            } else if (n === p.right && ! slRed && srRed) {
              s.red = true;
              s.right.red = false;
              rotateLeft(s);
            }
            s = n === p.left ? p.right : p.left;
            sRed = s !== null && s.red;
          }
          // dc6(n);
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
        return;
      }
    }
  }

  function insert(parent, compare, value, node) {
    while (parent !== null) {
      const field = compare(value, parent.value) < 0 ? 'left' : 'right';
      const fv = parent[field];
      if (fv === null) {
        parent[field] = node;
        node.up = parent;
        break;
      }
      parent = fv;
    }
  }

  function find(n, compare, value) {
    while (n !== null) {
      const cmp = compare(value, n.value);
      if (cmp === 0) return n;
      n = cmp < 0 ? n.left : n.right;
    }
    return null;
  }

  function ic1(n) {
    while (n.up !== null) {
      // ic2
      if (! n.up.red) return;
      // ic3

      const p = n.up;
      const g = p === null ? null : p.up;
      const u = g !== null ? n.up === g.left ? g.right : g.left : null;
      if (u !== null && u.red) {
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
    const p = n.up;
    const r = n.right;
    const rl = r.left;
    n.right = rl; if (rl !== null) rl.up = n;
    if (p !== null) {
      if (p.left === n)
        p.left = r;
      else
        p.right = r;
    }
    r.up = p;
    r.left = n; n.up = r;
  }

  function rotateRight(n) {
    const p = n.up;
    const l = n.left;
    const lr = l.right;
    n.left = lr; if (lr !== null) lr.up = n;
    if (p !== null) {
      if (p.left === n)
        p.left = l;
      else
        p.right = l;
    }
    l.up = p;
    l.right = n; n.up = l;
  }

  function cursor(node, {from, to}, compare) {
    let dir = from ? 0 : 1;
    const chkTo = to && (() =>  compare(to, node.value) < 0 ? (node = null) : node);

    const iter = {
      [Symbol.iterator]() {
        return {
          next() {
            const node = iter.next();
            return {done: node === null, value: node !== null ? node.value : null};
          }
        };
      },
      next() {
        if (node === null) return null;
        switch (dir) {
        case 0:
          while (node !== null) {
            const cmp = compare(from, node.value);
            if (cmp === 0) break;
            const t = cmp < 0 ? node.left : node.right;
            if (t !== null)
              node = t;
            else
              break;
          }
          dir = 3;
          return to ? chkTo() : node;;
        case 3:
          if (node.right === null) {
            let up = null;
            while ((up = node.up) !== null) {
              if (up.left === node) {
                node = up;
                return to ? chkTo() : node;
              }
              node = up;
            }
            return node = null;
          }
          node = node.right;
          dir = 1;
          // fall through
        case 1:
          while (node.left !== null)
            node = node.left;
          dir = 3;
          return to ? chkTo() : node;
        }
      },
    };
    return iter;
  }

  function pad(level, pad) {
    for(let i = 0; i < level; ++i) pad+= '  ';
    return pad;
  }

  function display(formatter, node, level=0, prefix='') {
    if (node === null || level > 10) return '';
    return `
${pad(level, prefix)}${formatter(node.value)}${node.red ? ' *' : ''}${display(
formatter, node.left, level+1, 'l')}${display(
formatter, node.right, level+1, 'r')}`;
  }

  return BTree;
});
