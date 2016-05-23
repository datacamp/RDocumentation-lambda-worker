var AWS = require('aws-sdk'); 
var JSFtp = require('jsftp');
var Promise = require('bluebird');
var fs = require('fs');

var listArchivedVersions = function(ftp, packageName, callback) {
 /* Download and upload Archives */
  var archiveDirectory = '/pub/R/src/contrib/Archive/';
  var packageArchiveDirectory = archiveDirectory + packageName;
  console.info('Listing version of ' + packageName);

  ftp.ls(packageArchiveDirectory, function(err, res) {
    if (err !== null) callback(err);
    else {
      callback(null, res
        .filter(function(file) {
          return /.*\.tar\.gz$/.test(file.name);
        })
        .map(function(file) {
        var packageInfo = extractPackageInfo(file.name);
        return {
          name: packageInfo.name,
          version: packageInfo.version,
          packageVersion: packageInfo.name + '_' +  packageInfo.version,
          fullFTPPath: packageArchiveDirectory + '/' + file.name
        };
      }));
    }
  });
};

var listAllPackages = function(ftp, dir, callback) {
  console.info('Fetching package list');
  ftp.ls(dir, function(err, res) {
    callback(err, res.map(function(file) {return file.name; }).filter(function(filename) {
      return /.*\.tar\.gz$/.test(filename);
    }));
  });
};

var extractPackageInfo = function(filename) {
  var matches = filename.match(/(.*)_(.*)\.tar\.gz$/);
  return {
    name: matches[1],
    version: matches[2]
  };
};


exports.handle = function(e, ctx) {
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var directory = '/pub/R/src/contrib/';

  var buffer = [];
  var bufferId = 0;
  
  Promise.promisify(listAllPackages)(ftp, directory)
    .then(function(packageList) {
      return packageList.map(extractPackageInfo);
    })
    .each(function(packageInfo) {
      console.info('Processing '  + packageInfo.name);
      return Promise.promisify(listArchivedVersions)(ftp, packageInfo.name)
        .then(function(archivedVersions) { //list package version
          archivedVersions.push({ //add current version
            name: packageInfo.name,
            version: packageInfo.version,
            packageVersion: packageInfo.name + '_' +  packageInfo.version,
            fullFTPPath: directory + packageInfo.name + '_' +  packageInfo.version + '.tar.gz'
          });
          return archivedVersions;
        })
        .then(function(allVersions) {
          buffer = buffer.concat(allVersions);
          if (buffer.length >= 50) {
            var json = JSON.stringify(buffer);
            return Promise.promisify(fs.open)('packages/toDownload' + bufferId + '.json', 'w')
              .then(function(fd) {
                return Promise.promisify(fs.writeFile)(fd, json);
              })
              .then(function(res) {
                bufferId++;
                buffer = [];
                console.info('Wrote buffer');
              });
          }
        });
    })
    .then(function(val) {
      console.log(val);
      ctx.succeed();
    })
    .catch(function(err) {
      console.warn(err);
      ctx.fail(err);
    });
  
};