define((require, exports, module)=>{
  /**
   * A single linked list.
   **/
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util, match: m} = TH;

  const LinkedList  = require('./linked-list');

  const listToString = (ll)=>{
    let ans = '';
    for (let node = ll.front; node !== undefined; node = node.next) {
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
    });

    test("removeNode", ()=>{
      /**
       * Search for and remove `node`
       *
       * @param node the  node to remove
       * @param [prev] where to start the search from. Defaults to `front`
       * @return the node removed or undefined if not found
       **/
      api.protoMethod();
      const ll = new LinkedList;

      //[
      add(ll, 1, 2, 3, 4);

      let prev;
      for (let node = ll.front; node !== undefined; node = node.next) {
        if (node.value % 2 == 1)
          ll.removeNode(node, prev);
        else
          prev = node;
      }

      assert.equals(listToString(ll), "2 4");

      ll.removeNode(ll.back);

      assert.equals(listToString(ll), "2");
      //]
    });
  });
});
