define((require, exports, module)=>{
  'use strict';
  /**
   * A single linked list. The list is iterable.
   **/
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const {stub, spy, util, match: m} = TH;

  const LinkedList  = require('./linked-list');

  const listToString = (ll)=>{
    let ans = '';
    for (let node = ll.front; node !== void 0; node = node.next) {
      ans += node.value+' ';
    }
    return ans.trim();
  };

  const add = (ll, ...args)=>{args.forEach(a => ll.addBack(a))};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("push", ()=>{
      /**
       * Push `value` to front of list.
       *
       * @alias addFront
       **/
      assert.same(LinkedList.prototype.push, LinkedList.prototype.addFront);
      api.protoMethod();

      //[
      const ll = new LinkedList;

      ll.push(1);
      ll.push(2);
      ll.push(3);

      assert.equals(listToString(ll), "3 2 1");
      //]
      assert.same(ll.size, 3);
    });

    test("pop", ()=>{
      /**
       * Remove and return `value` from front of list.
       **/
      assert.same(LinkedList.prototype.push, LinkedList.prototype.addFront);
      api.protoMethod();

      //[
      const ll = new LinkedList;

      ll.push(1);
      ll.push(2);
      ll.push(3);

      assert.same(ll.pop(), 3);
      assert.same(ll.pop(), 2);

      assert.equals(listToString(ll), "1");
      //]
      assert.same(ll.size, 1);
    });

    test("popNode", ()=>{
      /**
       * Remove and return `node` from front of list.
       **/
      assert.same(LinkedList.prototype.push, LinkedList.prototype.addFront);
      api.protoMethod();

      //[
      const ll = new LinkedList;

      ll.push(1);
      ll.push(2);
      ll.push(3);

      assert.equals(ll.popNode(), {value: 3, next: m.object});

      assert.equals(listToString(ll), "2 1");
      //]
      assert.same(ll.size, 2);
    });

    test("addBack", ()=>{
      /**
       * Add `value` to back of list.
       **/
      api.protoMethod();
      //[
      const ll = new LinkedList;

      ll.addBack(1);
      ll.addBack(2);
      ll.addBack(3);

      assert.equals(listToString(ll), "1 2 3");
      //]
      assert.same(ll.size, 3);
    });

    test("front, back", ()=>{
      const ll = new LinkedList;

      ll.addBack(1);
      ll.addBack(2);
      ll.addBack(3);

      api.protoProperty('front', {info: `the front node in the list`}, ll);
      assert.same(ll.front.value, 1);

      api.protoProperty('frontValue', {info: `the front value in the list`});
      assert.same(ll.frontValue, 1);

      api.protoProperty('back', {info: `the back node in the list`}, ll);
      assert.same(ll.back.value, 3);

      api.protoProperty('backValue', {info: `the back value in the list`});
      assert.same(ll.backValue, 3);
    });

    test("removeNode", ()=>{
      /**
       * Search for and remove `node`
       *
       * @param node the  node to remove
       * @param [prev] where to start the search from. Defaults to `front`
       * @return the node removed or void 0 if not found
       **/
      api.protoMethod();
      const ll = new LinkedList;

      //[
      add(ll, 1, 2, 3, 4);

      let prev;
      for (let node = ll.front; node !== void 0; node = node.next) {
        if (node.value % 2 == 1)
          ll.removeNode(node, prev);
        else
          prev = node;
      }

      assert.equals(listToString(ll), "2 4");

      ll.removeNode(ll.back);

      assert.equals(listToString(ll), "2");
      //]
      assert.same(ll.size, 1);
    });

    test("forEach", ()=>{
      /**
       * visit each entry from front to back
       *
       * @param {function} visitor called for each observer with the `value` from {##add}.
       *
       **/
       api.protoMethod();
      //[
      const subject = new LinkedList();

      subject.push('b');
      subject.push('a');

      const ans = [];

      subject.forEach(v => {ans.push(v)});

      assert.equals(ans, ['a', 'b']);
      //]
    });

    test("nodes", ()=>{
      /**
       * Return an iterator over the nodes from font to back. ({##add} returns the `node`)
       **/
      api.protoMethod();
      //[
      const subject = new LinkedList();

      const f = ()=>{};
      const exp = [
        m.is(subject.addBack(1)),
        m.is(subject.addBack(f))
      ];
      subject.addBack('a');

      const ans = [];

      for (const h of subject.nodes()) {
        ans.push(h);
        if (h.value === f) break;
      }

      assert.equals(ans, exp);
      //]
    });

    test("values", ()=>{
      /**
       * Return an iterator over the values from front to back.

       * @alias [symbol.iterator]
       **/
      api.protoMethod();
      //[
      const subject = new LinkedList();

      const f = ()=>{};
      subject.push('a');
      subject.push(f);
      subject.push(1);

      const ans = [];

      for (const v of subject.values()) {
        ans.push(v);
        if (v === f) break;
      }

      assert.equals(ans, [1, m.is(f)]);
      //]

      api.done();

      // check alias
      assert.same(subject[Symbol.iterator], subject.values);
    });

    test("clear", ()=>{
      /**
       * clear all entries. (calls `listEmpty` if present)
       **/
      api.protoMethod();
      //[
      const subject = new LinkedList();

      subject.push(1);
      subject.push(2);

      assert.equals(subject.size, 2);

      subject.clear();

      assert.equals(subject.size, 0);
      assert.equals(Array.from(subject), []);
      //]
    });

    test("size", ()=>{
      api.protoProperty('size', {info: `The number of nodes in the list`});

      const subject = new LinkedList();

      assert.same(subject.size, 0);

      subject.push(1);
      assert.same(subject.size, 1);

      subject.push(2);
      assert.same(subject.size, 2);

      subject.pop();
      assert.same(subject.size, 1);

      subject.pop();
      assert.same(subject.size, 0);

      subject.pop();
      assert.same(subject.size, 0);
    });
  });
});
