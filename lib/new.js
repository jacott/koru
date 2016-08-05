const path = require('path');
const fs = require('fs');
const execFileSync = require('child_process').execFileSync;


function exec(cmd, ...args) {
  return execFileSync(cmd, args);
}

module.exports = function (name, options) {
  const existingDir = ! name;
  name = filterName(name);
  if (existingDir) {
    console.log("Initializing "+name);
  } else {
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

  fs.writeFileSync('package.json', JSON.stringify(package, null, 2));


  if (! exists("node_modules/koru")) {
    console.log("installing koru");
    exec("npm", options.link ? "link" : "install", "koru");
  }

  const koruTop = path.resolve(__dirname, '..');

  console.log("Copying koru files");

  exec("rsync", "-a", "--ignore-existing", `${koruTop}/skel/newApp/`, '.');

  updateFile("config/environ.sh", code => code.replace(/_\{app_name\}_/, name));
};

function exists(filename) {
  try {
    fs.accessFileSync(filename);
  } catch(ex) {
    return false;
  }
  return true;
}

function updateFile(filename, func) {
  fs.writeFileSync(filename, func(fs.readFileSync(filename).toString()));
}

function filterName(name) {
  if (! name)
    name = path.basename(process.cwd());

  return name.replace(/([^\w-])/g, '-');
}
