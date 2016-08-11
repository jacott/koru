const path = require('path');
const fs = require('fs');
const {system, updateFile, pathExists, findTop} = require('./script-utils');

module.exports = function (name, options) {
  const existingDir = ! name;
  if (existingDir) {
    var topDir = findTop();
    process.chdir(topDir);
    name = filterName(path.basename(topDir));
    console.log("Initializing "+topDir);
  } else {
    name = filterName(name);
    console.log("Making new project directory "+name);
    fs.mkdirSync(name);
    process.chdir(name);
  }

  try {
    var package = JSON.parse(fs.readFileSync('package.json'));
  }
  catch(ex) {
    if (ex.code !== 'ENOENT')
      throw ex;
  }

  name = filterName(existingDir && package ? package.name : name);
  if (package) {
    package.name = name;
  } else {
    package = {
      name,
      description: "Koru application",
      version: '1.0.0',
      private: true,
    };
  }

  (package.dependencies || (package.dependencies = {}))
    .koru = "^"+options.koruVersion;

  fs.writeFileSync('package.json', JSON.stringify(package, null, 2)+"\n");


  if (! pathExists("node_modules/koru")) {
    console.log("installing koru");
    system("npm", options.link ? "link" : "install", "koru");
  }

  const koruTop = path.resolve(__dirname, '..');

  console.log("Copying koru files");

  const ignoreExisting = options.force ? "" : "--ignore-existing";

  system("rsync", "-a", ignoreExisting, `${koruTop}/skel/newApp/`, '.');
  system("rsync", "-p", ignoreExisting, `${koruTop}/skel/default-gitignore`, '.gitignore');

  updateFile("config/environ.sh", code => code.replace(/_\{app_name\}_/, name));
};

function filterName(name) {
  return name.replace(/([^\w-])/g, '-');
}
