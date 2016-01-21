#!/usr/bin/env node
var bundleAll = require('koru/lib/bundle-all');

process.chdir(__dirname+'/..');
bundleAll.bundle();
