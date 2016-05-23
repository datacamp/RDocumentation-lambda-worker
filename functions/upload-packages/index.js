var AWS = require('aws-sdk'); 
var JSFtp = require('jsftp');
var Promise = require('bluebird');

var downloadPackageVersion = function(ftp, ftppath, cb) {
  var buffer = [];
  ftp.get(ftppath, function(err, socket) {
    if(err !== null) cb(err);
    else {
      socket.on('data', function(data) {
        buffer.push(data);
      });
      socket.on('close', function(err) {
        var b = Buffer.concat(buffer);
        console.info('Donwloaded: ' + ftppath);
        cb(err, b);
      });
      socket.resume();
    }
  });
};

var uploadPackage = function(s3, path, stream, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: 'rpackages/archived/' + path,
    Body: stream
  }, cb);
};


var listArchivedVersions = function(ftp, packageName, callback) {
 /* Download and upload Archives */
  var archiveDirectory = '/pub/R/src/contrib/Archive/';
  var packageArchiveDirectory = archiveDirectory + packageName;
  console.info('Listing version of ' + packageName);

  ftp.ls(packageArchiveDirectory, function(err, res) {
    if (err !== null) callback(err);
    else {
      callback(null, res.map(function(file) {
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

var fetchJSONFile = function(s3, bucket, key, cb) {
  var params = {
    Bucket: bucket, /* required */
    Key: key, /* required */
  };
  s3.getObject(params, cb);
};

var uploadJSONFile = function(s3, key, data, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: key,
    Body: data
  }, cb);
};


var checkInDynamoDB = function(dynDB, packageVersion, cb) {
  var params = {
    TableName: 'rdoc-packages',
    Key: {
        PackageVersion : {S: packageVersion.version },
        PackageName : {S: packageVersion.name }
    }
  };

  dynDB.getItem(params, cb);
};

var syncDynamoDB = function(dynDB, version, callback) {
  var packageVersion = extractPackageInfo(version.split('/')[1]);
  var params = {
    TableName: 'rdoc-packages',
    Item: {
        SyncedTimestamp: {N: '' + new Date().getTime()},
        ParsedTimestamp: {N: '0'},
        PackageVersion : {S: packageVersion.version },
        PackageName : {S: packageVersion.name }
    }
  };
  dynDB.putItem(params, callback);
};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var dynamodb = new AWS.DynamoDB({region: 'eu-west-1'});
  var bucketName = e.Records[0].s3.bucket.name;
  var objectKey = e.Records[0].s3.object.key;

  var packagesToBeDone = [];

  Promise.promisify(fetchJSONFile)(s3, bucketName, objectKey)
    .then(function(jsonFile) {
      packagesToBeDone = JSON.parse(jsonFile.Body);
      return packagesToBeDone;
    })
    .each(function(packageInfo) {
      console.info('Processing '  + packageInfo.name);
     
      return Promise.promisify(downloadPackageVersion)(ftp, packageInfo.fullFTPPath)
        .then(function(buffer) {
          return {
            S3Path: packageInfo.name + '/' + packageInfo.name + '_' + packageInfo.version + '.tar.gz',
            buffer: buffer
          };
        })
        .then(function(version) { //Upload
          return Promise.promisify(uploadPackage)(s3, version.S3Path, version.buffer)
            .then(function() {
               console.info('Uploaded: ' + version.S3Path);
               return version.S3Path;
            })
            .then(function(versionPath) {
              return Promise.promisify(syncDynamoDB)(dynamodb, versionPath)
                .then(function(v) {
                  console.info('Synced dyndb: ' + version.S3Path);
                  return v;
                });
            });
        })
        .catch(function(err) {
          console.warn(err);
          throw err;
        })
        .finally(function() {
          packagesToBeDone = packagesToBeDone.slice(1);
          return packagesToBeDone;
        });
    })
    .timeout(290 * 1000)
    .catch(Promise.TimeoutError, function(e) {
      return Promise.promisify(uploadJSONFile)(s3, objectKey, JSON.stringify(packagesToBeDone));
    })
    .then(function(val) {
      ctx.succeed();
    })
    .catch(function(err) {
      ctx.fail(err);
    });
  
};