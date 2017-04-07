#!/usr/bin/env node
const bundleAll = require('koru/lib/bundle-all');

process.chdir(__dirname+'/..');
bundleAll.bundle();
