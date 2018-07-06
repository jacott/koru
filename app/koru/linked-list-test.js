define((require, exports, module)=>{
  const TH   = require('koru/test');

  const {stub, spy, onEnd, util} = TH;

  const LinkedList  = require('./linked-list');

  const listToString = (ll)=>{
    let ans = '';
    for (let node = ll.head; node !== undefined; node = node.next) {
      ans += node.value+' ';
    }
    return ans.trim();
  };

  const add = (ll, ...args)=>{args.forEach(a => ll.addBack(a))};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("addFront", ()=>{
      const ll = new LinkedList;
      ll.addFront(1);
      ll.addFront(2);
      ll.addFront(3);

      assert.equals(listToString(ll), "3 2 1");
    });

    test("addBack", ()=>{
      const ll = new LinkedList;
      ll.addBack(1);
      ll.addBack(2);
      ll.addBack(3);

      assert.equals(listToString(ll), "1 2 3");
    });

    test("removeNode", ()=>{
      const ll = new LinkedList;
      add(ll, 1, 2, 3, 4);

      let prev;
      for (let node = ll.head; node !== undefined; node = node.next) {
        if (node.value < 3)
          ll.removeNode(node, prev);
        else
          prev = node;
      }

      assert.equals(listToString(ll), "3 4");
    });
  });
});
