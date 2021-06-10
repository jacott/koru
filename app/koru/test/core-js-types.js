define((require, exports, module)=>{
  'use strict';

  const WebAPI = 'Web/API/';
  const MDNDOC_URL = 'https://developer.mozilla.org/en-US/docs/';
  const MDN_GLOBAL_PATH = 'Web/JavaScript/Reference/Global_Objects/';

  const CORE_TYPES = {
    Array: true,
    ArrayBuffer: true,
    Boolean: true,
    Date: true,
    Element: WebAPI,
    HTMLDocument: WebAPI,
    HTMLCollection: WebAPI,
    Error: true,
    EvalError: true,
    Generator: true,
    Float32Array: true,
    Float64Array: true,
    Function: true,
    Int16Array: true,
    Int32Array: true,
    Int8Array: true,
    Map: true,
    Math: true,
    Null: true,
    Number: true,
    Object: true,
    Primitive: 'Glossary/',
    Promise: true,
    RangeError: true,
    ReferenceError: true,
    RegExp: true,
    Set: true,
    String: true,
    Symbol: true,
    SyntaxError: true,
    TypeError: true,
    Uint16Array: true,
    Uint32Array: true,
    Uint8Array: true,
    Uint8ClampedArray: true,
    Undefined: true,
    URIError: true,
    WeakMap: true,
    WeakSet: true,
    TemplateLiteral: 'Web/JavaScript/Reference/Template_literals',
  };

  const Generator = (function *() {})().constructor;

  const typeSet =  new Map([
    [Array, 'Array'],
    [ArrayBuffer, 'ArrayBuffer'],
    [Boolean, 'Boolean'],
    [Date, 'Date'],
    [Error, 'Error'],
    [EvalError, 'EvalError'],
    [Generator, 'Generator'],
    [Float32Array, 'Float32Array'],
    [Float64Array, 'Float64Array'],
    [Function, 'Function'],
    [Int16Array, 'Int16Array'],
    [Int32Array, 'Int32Array'],
    [Int8Array, 'Int8Array'],
    [Map, 'Map'],
    [Math, 'Math'],
    [Number, 'Number'],
    [Object, 'Object'],
    [Promise, 'Promise'],
    [RangeError, 'RangeError'],
    [ReferenceError, 'ReferenceError'],
    [RegExp, 'RegExp'],
    [Set, 'Set'],
    [String, 'String'],
    [Symbol, 'Symbol'],
    [SyntaxError, 'SyntaxError'],
    [TypeError, 'TypeError'],
    [Uint16Array, 'Uint16Array'],
    [Uint32Array, 'Uint32Array'],
    [Uint8Array, 'Uint8Array'],
    [Uint8ClampedArray, 'Uint8ClampedArray'],
    [URIError, 'URIError'],
    [WeakMap, 'WeakMap'],
    [WeakSet, 'WeakSet'],
  ]);

  const addHtml = () => {
    if (typeof HTMLCollection !== 'undefined') typeSet.set(HTMLCollection, 'HTMLCollection');
    if (typeof HTMLDocument !== 'undefined') typeSet.set(HTMLDocument, 'HTMLDocument');
    if (typeof Element !== 'undefined') typeSet.set(Element, 'Element');
  };

  addHtml();

  return {
    objectName: (object)=>typeSet.get(object),
    addHtml,
    Generator,
    typeSet,
    MDNDOC_URL,
    mdnUrl: (cType, listGlobals=false)=>{
      const ct = CORE_TYPES[cType];
      if (ct !== void 0) {
        return MDNDOC_URL+
          (ct === true ? MDN_GLOBAL_PATH : ct) + (ct === true || ct.endsWith('/') ? cType : '');
      } else if (listGlobals) {
        return MDNDOC_URL + MDN_GLOBAL_PATH;
      }
    },
  };
});
