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

var listFailedPackageVersions = function(dynDB, callback) {
  console.info('Fetching package list');
  var params = {
    TableName: 'rdoc-packages',
    IndexName: 'ParsedTimestamp-index',
    KeyConditionExpression: 'ParsedTimestamp = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 0
    }
  };

  dynDB.query(params, callback);
};

var extractPackageInfo = function(filename) {
  var matches = filename.match(/(.*)_(.*)\.tar\.gz$/);
  return {
    name: matches[1],
    version: matches[2]
  };
};


exports.handle = function(e, ctx) {
  var dynamodb = new AWS.DynamoDB.DocumentClient({region: 'eu-west-1'});

  var buffer = [];
  var bufferId = 0;
  
  Promise.promisify(listFailedPackageVersions)(dynamodb)
    .then(function(packageList) {
      if (!packageList.Items) throw 'Nothing failed !';
      else return packageList.Items.map(function(packageVersion) {
        var name = packageVersion.PackageName;
        var version = packageVersion.PackageVersion;
        return {
          name: name,
          version: version,
          s3bucket: 'assets.rdocumentation.org',
          s3key: 'rpackages/archived/' + name + '/' + name + '_' + version + '.tar.gz'
        };
      });
    })
    .each(function(packageVersion) {
      buffer.push(packageVersion);
      if (buffer.length >= 200) {
        var json = JSON.stringify(buffer, null, 2);
        return Promise.promisify(fs.open)('failed/toParse' + bufferId + '.json', 'w')
          .then(function(fd) {
            return Promise.promisify(fs.writeFile)(fd, json);
          })
          .then(function(res) {
            bufferId++;
            buffer = [];
            console.info('Wrote buffer');
          });
      }
    })
    .then(function() {
      ctx.succeed();
    })
    .catch(function(err) {
      console.warn(err);
      ctx.fail(err);
    });
  
};