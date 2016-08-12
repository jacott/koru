const path = require('path');
const fs = require('fs');
const {system, template, pathExists, findTop,
       skelDir, findFiles} = require('./script-utils');

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
    var topDir = process.cwd();
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

  console.log("\nCopying koru files\n");

  const optArgs = [
    "--info=NAME"+(options.force ? "2" : ""),
  ];

  options.force || optArgs.push("--ignore-existing");
  options.pretend && optArgs.push("--dry-run");

  const newAppSkel = skelDir('newApp');

  const files =
          (system("rsync", "-a", ...optArgs, '--exclude=.template.*',
                  newAppSkel+"/", "./").toString() +

           system("rsync", "-p", ...optArgs,
                  skelDir('default.gitignore'),
                  '.gitignore').toString())
          .split("\n")
          .filter(line => line !== '' && ! line.endsWith("/"))
          .map(line => line.replace(/^(newApp\/|default)/, ''));


  findFiles(newAppSkel, (dir, file) => {
    const match = /^\.template\.(.*$)/.exec(file);
    if (! match) return;
    const dest = path.join(dir.slice(newAppSkel.length+1), match[1]);
    if (options.force || ! pathExists(dest)) {
      files.push(dest);
      options.pretend || template(path.join(dir, file), dest, {
        force: true,
        appName: name,

      });
    }
  });

  console.log(files.sort().map(line => '  create '+line).join("\n"));
};

function filterName(name) {
  return name.replace(/([^\w-])/g, '-');
}
