define((require, exports, module)=>{
  /**
   * Utility methods for displaying date and time and for updating times relative to now
   **/
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const Template        = require('koru/dom/template');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const api             = require('koru/test/api');
  const uDate           = require('koru/util-date');
  const TH              = require('./test-helper');

  const {stub, spy, util, intercept, stubProperty} = TH;

  const Time = require('./time');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      if (uDate.defaultLang !== 'en-US') {
        const origLang = uDate[isTest].defaultLang;
        after(()=>{uDate[isTest].defaultLang = origLang});
        uDate[isTest].defaultLang = 'en-US';
      }

      const origTZ = Time.getTZ();
      if (origTZ !== "UTC") {
        after(()=>{Time.setTZ(origTZ)});
        Time.setTZ("UTC");
      }
    });

    afterEach(()=>{
      TH.domTearDown();
    });

    test("relTime", ()=>{
      /**
       * Print date and time in shortish locale format with times with 24 hours from now also
       * showing relative time.. Also can be used as a template helper:
       *
       * ```html
       * {{relTime updatedAt}}
       * ```

       * @param date the date to print
       **/
      api.method();
      let now = 1534527890000; intercept(util, 'dateNow', ()=>now);
      //[
      assert.equals(Time.relTime(util.dateNow() - 20*60*60*1000),
                    'Aug 16, 2018 9:44 PM; 20 hours ago');

      assert.same(Time.relTime(Date.UTC(2014, 3, 4, 6, 5)), 'Apr 4, 2014 6:05 AM');
      //]
    });

    test("fromNow", ()=>{
      /**
       * Print relative time in locale format. Also can be used as a template helper:
       *
       * ```html
       * {{fromNow updatedAt}}
       * ```

       * @param date the date to print relatively
       **/
      api.method();
      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);
      //[
      assert.same(Time.fromNow(util.dateNow() + util.DAY), 'tomorrow');
      assert.same(Time.fromNow(new Date(util.dateNow() - 2*util.DAY)), '2 days ago');
      //]
    });

    test("startDynTime", ()=>{
      /**
       * Start a recurring minute timer to update all elements of class `dynTime`. Updating is done
       * by calling {#koru/ctx#updateElement;(element)} for each {#koru/dom.ctx;(element)}
       **/
      api.method();
      after(Time.stopDynTime);

      //[
      stub(koru, 'setTimeout').returns(123);
      let now = +Date.UTC(2019, 10, 3, 14, 35, 12); intercept(util, 'dateNow', ()=>now);
      Time.startDynTime();

      const html = `
<ul>
  <li class="dynTime">{{relTime time1}}</li>
  <li class="dynTime">{{fromNow time2}}</li>
</ul>`;

      const Tpl = Dom.newTemplate(TemplateCompiler.toJavascript(html, 'DynTimeTest').toHash());

      document.body.appendChild(Tpl.$autoRender({
        time1: new Date(now +5*60*1000),
        time2: new Date(now -2*60*1000),
      }));

      const li1 = Dom('ul>li:first-child');
      const li2 = Dom('ul>li:last-child');

      assert.equals(li1.textContent, "Nov 3, 2019 2:40 PM; in 5 minutes");
      assert.equals(li2.textContent, "2 minutes ago");

      now += 60*1000;
      koru.setTimeout.yieldAndReset();
      assert.equals(li1.textContent, "Nov 3, 2019 2:40 PM; in 4 minutes");
      assert.equals(li2.textContent, "3 minutes ago");

      now += 10*60*1000;
      koru.setTimeout.yieldAndReset();
      assert.equals(li1.textContent, "Nov 3, 2019 2:40 PM; 6 minutes ago");
      assert.equals(li2.textContent, "13 minutes ago");
      //]
    });

    test("stopDynTime", ()=>{
      /**
       * Cancel dynamic time updates (See {#.startDynTime})
       **/
      api.method();
      after(Time.stopDynTime);

      //[
      stub(koru, 'setTimeout').returns(123); stub(koru, 'clearTimeout');
      Time.startDynTime();
      assert.called(koru.setTimeout);
      Time.stopDynTime();
      assert.calledWith(koru.clearTimeout, 123);
      //]
    });
  });
});
