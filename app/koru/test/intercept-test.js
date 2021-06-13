define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const Intercept = require('./intercept');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    class Mode {
      constructor(type) {
        this.type = type;
      }
    };

    const nightMode = new Mode('night');
    const dayMode = new Mode('day');

    class Literature {
      constructor() {
        this.mode = dayMode;
      }
      find(text, chapter) {
        return [12,56332];
      }

      static readingLevel() {
        return -1;
      }

      get pageCount() {return this.pages.length}

      set readingMode(v) {this.mode = v == 'night' ? nightMode : dayMode}
    }

    class PictureBook extends Literature {
      static readingLevel() {
        return 2;
      }

      drawPicture(n, chapter) {
        return this.draw(this.pictures[n]);
      }
    }

    afterEach(() => {
      Intercept.interceptObj = Intercept.locals = void 0;
    });

    group("lookup", ()=>{
      test("object", ()=>{
        const object = new Mode({day: 'sunny'});
        assert.equals(Intercept.lookup(object, 'type'), {
          object, value: object.type, propertyType: 'value',
        });
      });

      test("static function", ()=>{
        assert.equals(Intercept.lookup(PictureBook, 'readingLevel'), {
          object: PictureBook, value: PictureBook.readingLevel, propertyType: 'value'
        });

        assert.equals(Intercept.lookup(Literature, 'readingLevel'), {
          object: Literature, value: Literature.readingLevel, propertyType: 'value'
        });
      });

      test("constructor function", ()=>{
        const object = new PictureBook();
        assert.equals(Intercept.lookup(object, 'mode'), {
          object, value: object.mode, propertyType: 'value',
        });
      });

      test("prototype function", ()=>{
        const object = new PictureBook();
        assert.equals(Intercept.lookup(object, 'drawPicture'), {
          object: PictureBook.prototype, value: object.drawPicture, propertyType: 'value'
        });
      });

      test("nested prototype function", ()=>{
        const object = new PictureBook();
        assert.equals(Intercept.lookup(object, 'find'), {
          object: Literature.prototype, value: object.find, propertyType: 'value'
        });
      });

      test("getter", ()=>{
        const object = new PictureBook();
        assert.equals(Intercept.lookup(object, 'pageCount'), {
          object: Literature.prototype,
          value: Object.getOwnPropertyDescriptor(Literature.prototype, 'pageCount').get,
          propertyType: 'get'
        });
      });

      test("setter", ()=>{
        const object = new PictureBook();
        assert.equals(Intercept.lookup(object, 'readingMode'), {
          object: Literature.prototype,
          value: Object.getOwnPropertyDescriptor(Literature.prototype, 'readingMode').set,
          propertyType: 'set'
        });
      });
    });

    group("objectSource", ()=>{
      test("not function", ()=>{
        Intercept.interceptObj = new Mode('day');
        assert.equals(Intercept.objectSource('type'), {
          object: 'Mode.prototype',
          name: 'type',
          propertyType: 'value',
          value: "'day'",
          valueType: 'string',
        });
      });

      test("static function", ()=>{
        Intercept.interceptObj = PictureBook;
        assert.equals(Intercept.objectSource('readingLevel'), {
          object: 'PictureBook',
          name: 'readingLevel',
          propertyType: 'value',
          value: '',
          valueType: 'function',
          signature: 'readingLevel()',
          source: PictureBook.readingLevel.toString(),
        });
      });

      test("constructor function", ()=>{
        Intercept.interceptObj =  new PictureBook();
        assert.equals(Intercept.objectSource('mode'), {
          object: 'PictureBook.prototype',
          name: 'mode',
          propertyType: 'value',
          value: "Mode({type: 'day'})",
          valueType: 'object',
          source: Mode.toString(),
        });
      });

      test("prototype function", ()=>{
        Intercept.interceptObj = new PictureBook();
        assert.equals(Intercept.objectSource('drawPicture'), {
          object: 'PictureBook.prototype',
          name: 'drawPicture',
          propertyType: 'value',
          value: '',
          valueType: 'function',
          signature: 'drawPicture(n, chapter)',
          source: Intercept.interceptObj.drawPicture.toString(),
        });
      });

      test("getter with error", ()=>{
        Intercept.interceptObj = new PictureBook();
        const pageCount = Object.getOwnPropertyDescriptor(Literature.prototype, 'pageCount').get;
        assert.equals(Intercept.objectSource('pageCount'), {
          object: 'Literature.prototype',
          name: 'pageCount',
          propertyType: 'get',
          value: "TypeError: Cannot read property 'length' of undefined",
          valueType: 'error',
          signature: 'get pageCount()',
          source: pageCount.toString(),
        });
      });

      test("native method Array", ()=>{
        Intercept.interceptObj = [1,2,3];
        assert.equals(Intercept.objectSource('copyWithin'), {
          object: 'Array.prototype',
          name: 'copyWithin',
          propertyType: 'native value',
          value: '',
          valueType: 'function',
          signature: 'copyWithin(arg0, arg1)',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/'+
            'Array/copyWithin',
        });
      });

      test("native method Math", ()=>{
        Intercept.interceptObj = globalThis;
        assert.equals(Intercept.objectSource('Math'), {
          object: '',
          name: 'Math',
          propertyType: 'native value',
          value: '{}',
          valueType: 'object',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/'+
            'Math',
        });
      });

      test("native method Math max", ()=>{
        Intercept.interceptObj = Math;
        assert.equals(Intercept.objectSource('max'), {
          object: 'Math',
          name: 'max',
          propertyType: 'native value',
          value: '',
          valueType: 'function',
          signature: 'max(arg0, arg1)',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/'+
            'Math/max',
        });
      });

      test("native object", ()=>{
        Intercept.interceptObj = {date: new Date(1622635200000)};
        assert.equals(Intercept.objectSource('date'), {
          object: 'Object.prototype',
          name: 'date',
          propertyType: 'native value',
          value: 'Date("2021-06-02T12:00:00.000Z")',
          valueType: 'object',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date',
        });
      });
    });
  });
});
