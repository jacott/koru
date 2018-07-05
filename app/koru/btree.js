define((require, exports, module)=>{
  const util  = require('koru/util');

  const {inspect$, test$} = require('koru/symbols');

  const red$ = Symbol(), up$ = Symbol(), right$ = Symbol(), left$ = Symbol(),
        size$ = Symbol(), memo$ = Symbol();

  const simpleCompare = (a, b) => a == b ? 0 : a < b ? -1 : 1;
  const ident = n => n;
  const lowest = () => -1;
  const highest = () => 1;

  const iterNode = (a, b) => {
    const f1 = a, f2 = b;
    return node => {
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
    ++tree[size$];
    if (tree.root === null) {
      tree.root = node;
      node[red$] = false;
      return node;
    }
    insert(tree.root, tree.compare, node.value, node);
    ic1(node);
    const g = tree.root[up$];
    if (g !== null) {
      tree.root = g;
    }
    return node;
  };

  class BTreeCursor {
    constructor(tree, {from, to, direction=1, excludeFrom=false, excludeTo=false}) {
      this.container = tree;
      const {compare} = tree;
      const dir = direction;
      this[memo$] = {
        from: from ? (
          excludeFrom ?
            node => {
              const cmp = compare(from, node.value);
              return cmp === 0 ? dir : cmp;
            }
            : node => compare(from, node.value)
        ) : (dir == 1 ? lowest : highest),
        to: to ? (
          excludeTo ? (
            dir === 1 ?
              (node =>  compare(to, node.value) <= 0 ? null : node)
            : (node =>  compare(to, node.value) >= 0 ? null : node)
          ) : (
            dir === 1 ?
              (node =>  compare(to, node.value) < 0 ? null : node)
            : (node =>  compare(to, node.value) > 0 ? null : node)
          )
        ) : ident,
        dir,
        pos: undefined,
        state: 0,
      };
    }

    [Symbol.iterator]() {
      const cursor = this;
      return {
        next() {
          const node = cursor.next();
          return {done: node == null, value: node != null ? node.value : null};
        }
      };
    }

    next() {
      const memo = this[memo$];
      const {from, to, dir, state, chkTo} = memo;

      let node = memo.pos;
      if (node === null) return null;

      switch (state) {
      case 0:
        node = this.container.root;
        if (node === null) return null;
        while (node !== null) {
          const cmp = from(node);
          if (cmp === 0) break;
          const t = cmp < 0 ? node[left$] : node[right$];
          if (t !== null)
            node = t;
          else
            break;
        }
        const cmp = from(node);
        if (cmp*dir > 0) {
          node = node[up$];
        }
        memo.state = 3;
        return memo.pos = to(node);
      case 3:
        if (state == 3) {
          if (dir == 1) {
            if (node[right$] === null) {
              let up = null;
              while ((up = node[up$]) !== null) {
                if (up[left$] === node) {
                  node = up;
                  return memo.pos = to(node);
                }
                node = up;
              }
              return node = null;
            }
            node = node[right$];
          } else {
            if (node[left$] === null) {
              let up = null;
              while ((up = node[up$]) !== null) {
                if (up[right$] === node) {
                  node = up;
                  return memo.pos = to(node);
                }
                node = up;
              }
              return node = null;
            }
            node = node[left$];
          }
        }
        // fall through
      case 1:
        if (dir == 1) {
          while (node[left$] !== null)
            node = node[left$];
        } else {
          while (node[right$] !== null)
            node = node[right$];
        }
        memo.state = 3;
        return memo.pos = to(node);
      }
    }
  }

  class BTree {
    constructor(compare=simpleCompare) {
      this.root = null;
      this.compare = compare;
      BTree.tree = this;
      this[size$] = 0;
    }

    get size() {return this[size$]};

    cursor(opts={}) {
      return new BTreeCursor(this, opts);
    }

    find(value) {
      const node = this.findNode(value);
      return node == null ? undefined : node.value;
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
      let {root} = this;
      if (n === null) return null;

      --this[size$];
      let p = n[up$];
      let {[left$]: left, [right$]: child} = n;

      if (left !== null && child !== null) {
        while (child[left$] !== null) child = child[left$];
        // fully swap nodes (rather than just value) because node
        // exposed outside of module

        if (p === null)
          root = this.root = child;
        else if (p[right$] === n)
          p[right$] = child;
        else
          p[left$] = child;

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
          if (p[left$] === n) p[left$] = null; else p[right$] = null;
        } else {
          this.root = null;
        }
        return n;
      }
      if (p !== null) {
        if (p[left$] === n) p[left$] = child; else p[right$] = child;
      } else {
        this.root = child;
      }
      child[up$] = p;
      if (! n[red$])
        child[red$] = false;

      return n;
    }

    get firstNode() {
      let n = this.root;
      if (n === null) return null;
      while(n[left$] !== null) n = n[left$];
      return n;
    }

    get lastNode() {
      let n = this.root;
      if (n === null) return null;
      while(n[right$] !== null) n = n[right$];
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

    _display(formatter=n => n) {return display(formatter, this.root)}

    [inspect$]() {
      return `<BTree: ${this.size}>`;
    }

    _assertValid() {
      const {root, compare} = this;
      let prev = null;
      const cursor= this.cursor();
      let node, max = 0;
      let blackExp = -1;
      let nodeCount = 0;
      while (node = cursor.next()) {
        let text = '';
        const displayError = dv => `${text} at ${dsp(node, dv, 3)}\n`+
                `prev: ${prev && dsp(prev, dv, 3)}\n${this._display(dv)}`;
        ++nodeCount;
        text = 'links invalid';
        assertTrue(node[up$] || node === this.root, displayError);
        assertTrue(node[up$] == null || node[up$][right$] === node || node[up$][left$] === node, displayError);
        text = 'out of order';
        assertTrue(! prev || compare(prev.value, node.value) < 0 , displayError);
        let count = 1;
        let bc = node[left$] || node[right$] ? -1 : 0;
        for (let p = node; p !== root; p = p[up$]) {
          ++count;
          if (p[red$]) {
            assertTrue(! p[up$][red$],
                       dv => `dup red at ${p.value} leaf: ${dsp(node, dv)}\n${this._display(dv)}`);
          } else if (bc >=0) ++bc;
        }
        if (bc < 0 || blackExp === -1)
          blackExp = bc;
        else
          assertTrue(
            blackExp === bc,
            dv => `back exp: ${blackExp}, act: ${bc}, at ${dsp(node, dv)}\n${this._display(dv)}`);

        max = Math.max(max, count);

        prev = node;
      }
      assertTrue(this.size === nodeCount,
                 dv => `tree size ${this.size} !== node count ${nodeCount}\n${this._display(dv)}`);
      return max;
    }

    [Symbol.iterator]() {
      return new BTreeCursor(this, {})[Symbol.iterator]();
    }

    forEach(body) {
      const cursor = new BTreeCursor(this, {});
      for (let node = cursor.next(); node !== null; node = cursor.next()) {
        body(node.value);
      }
    }
  }

  BTree.prototype.nextNode = nextNode;
  BTree.prototype.previousNode = previousNode;

  const dc1 = n =>{
    let p = null;
    while ((p = n[up$]) !== null) {
      if (p === null) return;

      // dc2(n);
      let s = n === p[left$] ? p[right$] : p[left$];

      if (s !== null && s[red$]) {
        p[red$] = true;
        s[red$] = false;
        if (n === p[left$])
          rotateLeft(p);
        else
          rotateRight(p);
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
          if  (! sRed) {
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

  const insert = (parent, compare, value, node)=>{
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

  const find = (n, compare, value)=>{
    while (n !== null) {
      const cmp = compare(value, n.value);
      if (cmp === 0) return n;
      n = cmp < 0 ? n[left$] : n[right$];
    }
    return null;
  };

  const ic1 = n =>{
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
          if (n === p[left$])
            rotateRight(g);
          else
            rotateLeft(g);
        }

        return;
      }
    }
    n[red$] = false;
  };

  const rotateLeft = n =>{
    const p = n[up$];
    const r = n[right$];
    const rl = r[left$];
    n[right$] = rl; if (rl !== null) rl[up$] = n;
    if (p !== null) {
      if (p[left$] === n)
        p[left$] = r;
      else
        p[right$] = r;
    }
    r[up$] = p;
    r[left$] = n; n[up$] = r;
  };

  const rotateRight = n =>{
    const p = n[up$];
    const l = n[left$];
    const lr = l[right$];
    n[left$] = lr; if (lr !== null) lr[up$] = n;
    if (p !== null) {
      if (p[left$] === n)
        p[left$] = l;
      else
        p[right$] = l;
    }
    l[up$] = p;
    l[right$] = n; n[up$] = l;
  };

  const pad = (level, pad)=>{
    for(let i = 0; i < level; ++i) pad+= '  ';
    return pad;
  };

  const display = (formatter, node, level=0, prefix='')=>{
    if (node === null || level > 10) return '';
    return `
${pad(level, prefix)}${formatter(node.value)}${node[red$] ? ' *' : ''}${display(
formatter, node[left$], level+1, 'l')}${display(
formatter, node[right$], level+1, 'r')}`;
  };

  const dsp = (node, dv, l=2)=>{
    if (! node) return 'null';
    return --l == 0 ? `${dv(node.value)}` :
      `{value: ${dv(node.value)}, up: ${dsp(node[up$], dv, l)}, `+
      `l: ${dsp(node[left$], dv, l)}, r: ${dsp(node[right$], dv, l)}}`;
  };

  const assertTrue = (truthy, displayError)=>{
    if (truthy) return;
    const err = new Error('tree invalid');
    err.displayError = displayError;
    err.name = 'TreeError';
    throw err;
  };

  BTree[test$] = {left$, right$, up$, red$};

  return BTree;
});
