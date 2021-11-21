define((require) => {
  'use strict';
  const {inspect$}      = require('koru/symbols');

  const red$ = Symbol(), void$ = Symbol(), up$ = Symbol(), right$ = Symbol(), left$ = Symbol(),
        size$ = Symbol(), memo$ = Symbol();

  const simpleCompare = (a, b) => a == b ? 0 : a < b ? -1 : 1;
  const ident = (n) => n;
  const lowest = () => -1;
  const highest = () => 1;

  const iterNode = (a, b) => {
    const f1 = a, f2 = b;
    return (node) => {
      if (node == null) return null;
      if (node[f2] !== null) {
        node = node[f2];
        while (node[f1] !== null) node = node[f1];
        return node;
      }
      for (let n = node[up$]; n !== null; n = n[up$]) {
        if (n[f1] === node) return n;
        node = n;
      }
      return null;
    };
  };

  const nextNode = iterNode(left$, right$);
  const previousNode = iterNode(right$, left$);

  const addNode = (tree, node) => {
    if (tree.root === null) {
      ++tree[size$];
      tree.root = node;
      node[red$] = false;
      return node;
    }
    if (tree.unique) {
      const cn = insertUnique(tree.root, tree.compare, node.value, node);
      if (cn !== void 0) return cn;
    } else {
      insert(tree.root, tree.compare, node.value, node);
    }
    ++tree[size$];
    ic1(node);
    const g = tree.root[up$];
    if (g !== null) {
      tree.root = g;
    }
    return node;
  };

  class BTree {
    constructor(compare=simpleCompare, unique=false) {
      this.compare = compare;
      this.unique = !! unique;
      this.clear();
    }

    clear() {
      this.root = null;
      this[size$] = 0;
    }

    get size() {return this[size$]}

    find(value) {
      const node = this.findNode(value);
      return node === void 0 ? void 0 : node.value;
    }

    add(value) {
      const node = {value, [left$]: null, [right$]: null, [up$]: null, [red$]: true};
      return addNode(this, node);
    }

    addNode(node) {
      node[up$] = node[right$] = node[left$] = null;
      node[red$] = true;
      return addNode(this, node);
    }

    delete(value) {
      return this.deleteNode(find(this.root, this.compare, value));
    }

    deleteNode(n) {
      if (n === void 0 || n[up$] === void$) return;

      let {root} = this;
      --this[size$];
      let p = n[up$];
      let {[left$]: left, [right$]: child} = n;

      if (left !== null && child !== null) {
        while (child[left$] !== null) child = child[left$];
        // fully swap nodes (rather than just value) because node
        // exposed outside of module

        if (p === null) {
          root = this.root = child;
        } else if (p[right$] === n) {
          p[right$] = child;
        } else {
          p[left$] = child;
        }

        left = n[left$];
        const {[right$]: right, [red$]: red} = n;
        n[red$] = child[red$]; child[red$] = red;
        const childUp = child[up$];

        n[left$] = null; n[right$] = child[right$];
        n[up$] = childUp === n ? child : childUp;

        child[up$] = p;
        child[right$] = right === child ? n : right;
        child[left$] = left === child ? n : left;
        if (child[left$] !== null) child[left$][up$] = child;
        if (child[right$] !== null) child[right$][up$] = child;
        if (n[right$] !== null) n[right$][up$] = n;
        if (childUp !== n) n[up$][left$] = n;

        p = n[up$]; left = null; child = n[right$];
      }

      if (child === null) child = left;
      if (child === null) {
        if (p !== null) {
          n[red$] || dc1(n);
          if (root[up$] !== null) {
            while (root[up$] !== null) root = root[up$];
            this.root = root;
          }
          if (p[left$] === n) {
            p[left$] = null;
          } else {
            p[right$] = null;
          }
        } else {
          this.root = null;
        }
      } else {
        if (p !== null) {
          if (p[left$] === n) {
            p[left$] = child;
          } else {
            p[right$] = child;
          }
        } else {
          this.root = child;
        }
        child[up$] = p;
        if (! n[red$]) {
          child[red$] = false;
        }
      }

      n[up$] = void$;
      return n;
    }

    get firstNode() {
      let n = this.root;
      if (n === null) return null;
      while (n[left$] !== null) n = n[left$];
      return n;
    }

    get lastNode() {
      let n = this.root;
      if (n === null) return null;
      while (n[right$] !== null) n = n[right$];
      return n;
    }

    findNode(value) {return find(this.root, this.compare, value)}

    nodeFrom(value) {
      const {compare} = this;
      let n = this.root;
      while (n !== null) {
        const cmp = compare(value, n.value);
        if (cmp === 0) return n;
        if (cmp < 0) {
          if (n[left$] === null) return n;
          n = n[left$];
        } else {
          if (n[right$] === null) {
            n = n[up$];
            return n !== null && compare(value, n.value) < 0 ? n : null;
          }
          n = n[right$];
        }
      }
      return n;
    }

    nodeTo(value) {
      const {compare} = this;
      let n = this.root;
      while (n !== null) {
        const cmp = compare(value, n.value);
        if (cmp === 0) return n;
        if (cmp < 0) {
          if (n[left$] === null) {
            n = n[up$];
            return n !== null && compare(value, n.value) > 0 ? n : null;
          }
          n = n[left$];
        } else {
          if (n[right$] === null) return n;
          n = n[right$];
        }
      }
      return n;
    }

    _recalcSize() {
      let size = 0;
      for (let n = this.firstNode; n !== null; n = this.nextNode(n))
        ++size;
      return this[size$] = size;
    }

    _display(formatter=(n) => n) {return display(formatter, this.root)}

    [inspect$]() {
      return `BTree(${this.size})`;
    }

    _assertValid() {
      const {root, compare} = this;
      let prev = null;
      let max = 0;
      let blackExp = -1;
      let nodeCount = 0;
      for (const node of this.nodes()) {
        let text = '';
        const displayError = (dv) => `${text} at ${dsp(node, dv, 3)}\n` +
              `prev: ${prev && dsp(prev, dv, 3)}\n${this._display(dv)}`;
        ++nodeCount;
        text = 'links invalid';
        assertTrue(node[up$] || node === this.root, displayError);
        assertTrue(node[up$] == null || node[up$][right$] === node || node[up$][left$] === node, displayError);
        text = 'out of order';
        assertTrue(! prev || compare(prev.value, node.value) <= 0, displayError);
        let count = 1;
        let bc = node[left$] || node[right$] ? -1 : 0;
        for (let p = node; p !== root; p = p[up$]) {
          ++count;
          if (p[red$]) {
            assertTrue(! p[up$][red$],
                       (dv) => `dup red at ${p.value} leaf: ${dsp(node, dv)}\n${this._display(dv)}`);
          } else if (bc >= 0) {
            ++bc;
          }
        }
        if (bc < 0 || blackExp === -1) {
          blackExp = bc;
        } else {
          assertTrue(
            blackExp === bc,
            (dv) => `back exp: ${blackExp}, act: ${bc}, at ${dsp(node, dv)}\n${this._display(dv)}`);
        }

        max = Math.max(max, count);

        prev = node;
      }
      assertTrue(this.size === nodeCount,
                 (dv) => `tree size ${this.size} !== node count ${nodeCount}\n${this._display(dv)}`);
      return max;
    }

    *nodes({from, to, direction=1, excludeFrom=false, excludeTo=false}={}) {
      const {compare} = this;
      if (direction == 1) {
        let node, nn;
        if (from === void 0) {
          node = this.firstNode;
        } else {
          node = this.nodeFrom(from);
          if (node == null) return;
          if (excludeFrom && compare(from, node.value) == 0) {
            node = nextNode(node);
          }
        }
        for (;node != null; node = nn) {
          nn = nextNode(node);
          if (to !== void 0) {
            const res = compare(to, node.value);
            if (excludeTo ? res <= 0 : res < 0) return;
          }
          yield node;
        }
      } else if (direction == -1) {
        let node, nn;
        if (from === void 0) {
          node = this.lastNode;
        } else {
          node = this.nodeTo(from);
          if (node == null) return;
          if (excludeFrom && compare(from, node.value) == 0) {
            node = previousNode(node);
          }
        }
        for (;node != null; node = nn) {
          nn = previousNode(node);
          if (to !== void 0) {
            const res = compare(to, node.value);
            if (excludeTo ? res >= 0 : res > 0) return;
          }
          yield node;
        }
      }
    }

    *values(opts) {
      if (opts === void 0) {
        yield* this[Symbol.iterator]();
      } else {
        for (const node of this.nodes(opts)) yield node.value;
      }
    }

    *[Symbol.iterator]() {
      let node = this.firstNode;
      while (node != null) {
        const {value} = node;
        node = nextNode(node);
        yield value;
      }
    }

    forEach(visitor) {
      let node = this.firstNode;
      while (node != null) {
        const {value} = node;
        node = nextNode(node);
        visitor(value);
      }
    }
  }

  BTree.prototype.nextNode = nextNode;
  BTree.prototype.previousNode = previousNode;

  const dc1 = (n) => {
    let p = null;
    while ((p = n[up$]) !== null) {
      if (p === null) return;

      // dc2(n);
      let s = n === p[left$] ? p[right$] : p[left$];

      if (s !== null && s[red$]) {
        p[red$] = true;
        s[red$] = false;
        if (n === p[left$]) {
          rotateLeft(p);
        } else {
          rotateRight(p);
        }
        s = n === p[left$] ? p[right$] : p[left$];
      }
      // dc3(n);
      let sRed = s !== null && s[red$];
      const slRed = s !== null && s[left$] !== null && s[left$][red$];
      const srRed = s !== null && s[right$] !== null && s[right$][red$];
      if (! p[red$] && ! sRed && ! slRed && ! srRed) {
        if (s !== null) s[red$] = true;
        n = p;
      } else {
        // dc4(n);
        if (p[red$] && ! sRed && ! slRed && ! srRed) {
          if (s !== null) s[red$] = true;
          p[red$] = false;
        } else {
          // dc5(n);
          if (! sRed) {
            if (n === p[left$] && slRed && ! srRed) {
              s[red$] = true;
              s[left$][red$] = false;
              rotateRight(s);
            } else if (n === p[right$] && ! slRed && srRed) {
              s[red$] = true;
              s[right$][red$] = false;
              rotateLeft(s);
            }
            s = n === p[left$] ? p[right$] : p[left$];
            sRed = s !== null && s[red$];
          }
          // dc6(n);
          s[red$] = p[red$];
          p[red$] = false;

          if (n === p[left$]) {
            s[right$][red$] = false;
            rotateLeft(p);
          } else {
            s[left$][red$] = false;
            rotateRight(p);
          }
        }
        return;
      }
    }
  };

  const insert = (parent, compare, value, node) => {
    while (parent !== null) {
      const field = compare(value, parent.value) < 0 ? left$ : right$;
      const fv = parent[field];
      if (fv === null) {
        parent[field] = node;
        node[up$] = parent;
        break;
      }
      parent = fv;
    }
  };

  const insertUnique = (parent, compare, value, node) => {
    while (parent !== null) {
      const cmp = compare(value, parent.value);
      if (cmp == 0) return parent;
      const field = cmp < 0 ? left$ : right$;
      const fv = parent[field];
      if (fv === null) {
        parent[field] = node;
        node[up$] = parent;
        break;
      }
      parent = fv;
    }
  };

  const find = (n, compare, value) => {
    while (n !== null) {
      const cmp = compare(value, n.value);
      if (cmp === 0) return n;
      n = cmp < 0 ? n[left$] : n[right$];
    }
    return void 0;
  };

  const ic1 = (n) => {
    while (n[up$] !== null) {
      // ic2
      if (! n[up$][red$]) return;
      // ic3

      const p = n[up$];
      const g = p === null ? null : p[up$];
      const u = g !== null ? n[up$] === g[left$] ? g[right$] : g[left$] : null;
      if (u !== null && u[red$]) {
        n[up$][red$] = false;
        u[red$] = false;
        g[red$] = true;
        n = g;
      } else { // ic4
        if (n === p[right$] && p === g[left$]) {
          rotateLeft(p);
          n = n[left$];
        } else if (n === p[left$] && p === g[right$]) {
          rotateRight(p);
          n = n[right$];
        }

        { // ic5
          const p = n[up$], g = p[up$];
          p[red$] = false;
          g[red$] = true;
          if (n === p[left$]) {
            rotateRight(g);
          } else {
            rotateLeft(g);
          }
        }

        return;
      }
    }
    n[red$] = false;
  };

  const rotateLeft = (n) => {
    const p = n[up$];
    const r = n[right$];
    const rl = r[left$];
    n[right$] = rl; if (rl !== null) rl[up$] = n;
    if (p !== null) {
      if (p[left$] === n) {
        p[left$] = r;
      } else {
        p[right$] = r;
      }
    }
    r[up$] = p;
    r[left$] = n; n[up$] = r;
  };

  const rotateRight = (n) => {
    const p = n[up$];
    const l = n[left$];
    const lr = l[right$];
    n[left$] = lr; if (lr !== null) lr[up$] = n;
    if (p !== null) {
      if (p[left$] === n) {
        p[left$] = l;
      } else {
        p[right$] = l;
      }
    }
    l[up$] = p;
    l[right$] = n; n[up$] = l;
  };

  const pad = (level, pad) => {
    for (let i = 0; i < level; ++i) pad += '  ';
    return pad;
  };

  const display = (formatter, node, level=0, prefix='') => {
    if (node === null || level > 10) return '';
    return `\n${
    pad(level, prefix)}${formatter(node.value)}${node[red$] ? ' *' : ''}${
    display(
      formatter, node[left$], level + 1, 'l')}${
    display(
      formatter, node[right$], level + 1, 'r')}`;
  };

  const dsp = (node, dv, l=2) => {
    if (! node) return 'null';
    return --l == 0
      ? `${dv(node.value)}`
      : `{value: ${dv(node.value)}, up: ${dsp(node[up$], dv, l)}, ` +
      `l: ${dsp(node[left$], dv, l)}, r: ${dsp(node[right$], dv, l)}}`;
  };

  const assertTrue = (truthy, displayError) => {
    if (truthy) return;
    const err = new Error('tree invalid');
    err.displayError = displayError;
    err.name = 'TreeError';
    throw err;
  };

  if (isTest) BTree[isTest] = {left$, right$, up$, red$};

  return BTree;
});
