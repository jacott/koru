define((require, exports, module) => {
  'use strict';
  /**
   * A double linked list. The list is iterable. Nodes can be deleted without needing this list.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, match: m} = TH;

  const DLinkedList = require('./dlinked-list');

  TH.testCase(module, ({beforeEach, afterEach, test, group}) => {
    test('constructor', () => {
      /**
       * Make an instance of DLinkedList
       *
       * @param {function} [listEmpty] method will be called when the list becomes empty.

       **/
      const DLinkedList = api.class();
      //[
      const listEmpty = stub();
      const subject = new DLinkedList(listEmpty);

      const node1 = subject.add('value1');
      const node2 = subject.add('value2');

      node1.delete();

      refute.called(listEmpty);
      node2.delete();
      assert.called(listEmpty);
      //]
      const subject2 = new DLinkedList();
      const node3 = subject2.add('value1');
      node3.delete();
    });

    test('head', () => {
      /**
       * Retrieve the node that is the head of the list
       **/
      api.protoProperty();

      //[
      const subject = new DLinkedList();

      assert.same(subject.head, null);

      subject.add(1);
      subject.add(2);

      assert.same(subject.head.value, 1);
      //]
    });

    test('tail', () => {
      /**
       * Retrieve the node that is the tail of the list
       **/
      api.protoProperty();

      //[
      const subject = new DLinkedList();

      assert.same(subject.tail, null);

      subject.add(1);
      subject.add(2);

      assert.same(subject.tail.value, 2);
      //]
    });

    test('add', () => {
      /**
       * add `value` to the end of the list.
       *
       * @param {any-type} value to add to the list
       *
       * @returns a node that has the methods
       * * `value` the object passed to `add`

       * * `delete` a function to delete the entry
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      const node1 = subject.add(1);
      const node2 = subject.add(2);

      assert.same(node1.value, 1);
      assert.same(node1, subject.head);
      assert.same(node2, subject.tail);

      assert.equals(Array.from(subject), [1, 2]);

      node1.delete();
      assert.equals(Array.from(subject), [2]);

      subject.add();
      assert.equals(Array.from(subject), [2, null]);

      node2.value = void 0; // undefined is coerced to null
      assert.equals(Array.from(subject), [null, null]);
      //]
    });

    test('addFront', () => {
      /**
       * add `value` to the front of the list.
       *
       * @param {any-type} value to add to the list
       *
       * @returns a node that has the methods
       * * `value` the object passed to `add`

       * * `delete` a function to delete the entry
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      const node1 = subject.add(1);
      const node2 = subject.addFront(2);

      assert.same(node1.value, 1);
      assert.same(node1, subject.tail);
      assert.same(node2, subject.head);

      assert.equals(Array.from(subject), [2, 1]);

      node1.delete();
      assert.equals(Array.from(subject), [2]);

      subject.addFront();
      assert.equals(Array.from(subject), [null, 2]);
      //]
    });

    test('forEach', () => {
      /**
       * visit each entry
       *
       * @param {function} visitor called for each observer with the `value` from {##add}.
       *
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      subject.add('a');
      subject.add('b');

      const ans = [];

      subject.forEach((v) => {ans.push(v)});

      assert.equals(ans, ['a', 'b']);
      //]
    });

    test('nodes', () => {
      /**
       * Return an iterator over the nodes added to the list. ({##add} returns the `node`)
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      const f = () => {};
      const exp = [
        m.is(subject.add(1)),
        m.is(subject.add(f)),
      ];
      subject.add('a');

      const ans = [];

      for (const h of subject.nodes()) {
        ans.push(h);
        if (h.value === f) break;
      }

      assert.equals(ans, exp);
      //]
    });

    test('node', () => {
      const subject = new DLinkedList();
      const n1 = subject.add(1);
      const n2 = subject.add(2);
      const n3 = subject.add(3);

      assert.same(n2.value, 2);

      assert.same(n1.prev, subject);
      assert.same(n1.next, n2);

      assert.same(n2.prev, n1);

      assert.same(n3.next, subject);
    });

    test('values', () => {
      /**
       * Return an iterator over the values added to the list.
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      const f = () => {};
      subject.add(1),
      subject.add(f),
      subject.add('a');

      const ans = [];

      for (const v of subject.values()) {
        ans.push(v);
        if (v === f) break;
      }

      assert.equals(ans, [1, m.is(f)]);
      //]
    });

    test('clear', () => {
      /**
       * clear all entries. (calls `listEmpty` if present)
       **/
      api.protoMethod();
      //[
      const subject = new DLinkedList();

      subject.add(1);
      subject.add(2);

      subject.clear();

      assert.equals(Array.from(subject), []);
      //]
    });
  });
});
