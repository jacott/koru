var requirejs = require('requirejs');
var path = require('path');

requirejs.config({
    //Use node's special variable __dirname to
    //get the directory containing this file.
    //Useful if building a library that will
    //be used in node but does not require the
    //use of node outside
    baseUrl: path.resolve(__dirname+'/..'),

    //Pass the top-level main.js/index.js require
    //function to requirejs so that node modules
    //are loaded relative to the top-level JS file.
    nodeRequire: require
});

requirejs.onResourceLoad = function (context, map, depArray) {
  console.log('DEBUG onResourceLoad');
}



//foo and bar are loaded according to requirejs
//config, and if found, assumed to be an AMD module.
//If they are not found via the requirejs config,
//then node's require is used to load the module,
//and if found, the module is assumed to be a
//node-formatted module. Note: this synchronous
//style of loading a module only works in Node.
var bart = requirejs('package/bart/index');

//Now export a value visible to Node.
module.exports = function () {};
