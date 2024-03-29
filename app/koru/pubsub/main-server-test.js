define((require, exports, module) => {
  'use strict';
  const Val             = require('koru/model/validation');
  const Publication     = require('koru/pubsub/publication');
  const session         = require('koru/session');
  const ConnTH          = require('koru/session/conn-th-server');
  const api             = require('koru/test/api');

  return ({TH, module}) => {
    const {stub, spy, util, match: m} = TH;

    TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
      let conn, gDict;
      before(() => {
        api.module({pseudoModule: 'Overview'});

        conn = ConnTH.mockConnection();
        gDict = session.globalDict;
      });

      after(() => {
        ConnTH.stopAllSubs(conn);
      });

      test('server-publish', async () => {
        api.topic();

        const query = {forEach: stub(async () => {})};
        const Book = {
          create: stub(async () => {}),
          where: () => query, onChange: stub().returns({stop: stub()})};
        //[
        // Step 1 - Register the publication
        class LibraryPub extends Publication {
          constructor(options) {
            super(options);
          }
          async init({shelf}) {
            // step 3 from below calls this
            Val.ensureString(shelf);
            // Send relavent documents to client
            await Book.where({shelf})
              .forEach((doc) => conn.added('Book', doc.attributes));

            // Listen for relavent document changes
            this.listeners = [
              Book.onChange(Publication.buildUpdate)];
          }

          stop() {
            super.stop();
            for (const listener of this.listeners)
              listener.stop();
          }
        }
        LibraryPub.pubName = 'Library'; // Server listens from Library Subscriptions
        // Can also use: LibraryPub.module = module
        //]

        const args = [{shelf: 'mathematics'}];
        const thirtyDaysAgo = Date.now() - 30 * util.DAY;
        const lastSubscribed = new Date(thirtyDaysAgo);

        //[
        // Step 3 receive connect request from client
        // with data: 's123', 1, 'Library', args, lastSubscribed;
        const sub = new LibraryPub({id: 's123', conn, lastSubscribed});
        await sub.init(...args);
        // after init, server informs client of success and updates lastSubscribed
        // ['s123', 1, 200, new Date(thirtyDaysAgo)]
        //]

        //[
        // Step 5 - another client adds a book
        await Book.create({shelf: 'mathematics', name: "Euclid's Elements"});
        // book is sent to subscribed clients
        //]

        assert.same(LibraryPub.pubName, 'Library');
        assert.calledWith(query.forEach, m.func);

        assert.calledOnce(Book.create);

        await query.forEach.yieldAll({attributes: {shelf: 'mathematics', name: "Euclid's Elements"}});
        assert.calledOnceWith(conn.added, 'Book', {shelf: 'mathematics', name: "Euclid's Elements"});

        //[
        // Step 8 close recieved from client
        sub.stop();
        //]
      });
    });
  };
});
