var AWS = require('aws-sdk'); 
var JSFtp = require('jsftp');
var sync = require('synchronize');
var Promise = require('bluebird');

var downloadPackageVersion = function(ftp, ftppath, file, cb) {
  var filename = ftppath + '/' + file;
  var buffer = [];
  ftp.get(filename, function(err, socket) {
    socket.on('data', function(data) {
      buffer.push(data);
    });
    socket.on('close', function(err) {
      var b = Buffer.concat(buffer);
      console.info('Donwloaded: ' + filename);
      cb(err, b);
    });
    socket.resume();
  });
};

var uploadPackage = function(s3, path, stream, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: 'rpackages/archived/' + path,
    Body: stream
  }, cb);
};

var downloadAllPackageVersions = function(ftp, s3, packageName, currentVersion, callback) {
  var archiveDirectory = '/pub/R/src/contrib/Archive/';
  var currentVersionDirectory = '/pub/R/src/contrib';
  var packageArchiveDirectory = archiveDirectory + packageName;

  sync.fiber(function() {
    var versionArray = [];
    /* Donwload and upload current version */
    var currentVersionFilename = packageName + '_' + currentVersion + '.tar.gz';
    try {
      var version =  sync.await(downloadPackageVersion(ftp, currentVersionDirectory, currentVersionFilename, sync.defer()));
      versionArray.push({
        path: packageName + '/' + currentVersionFilename,
        buffer: version
      });
    } catch (err) {
      console.warn(err);
    }

    /* Download and upload Archives */
    ftp.ls(packageArchiveDirectory, function(err, res) {
      if (err !== null) callback(err);
      else {
        sync.fiber(function() {
          res.forEach(function(file) {
            var version = sync.await(downloadPackageVersion(ftp, packageArchiveDirectory, file.name, sync.defer()));
            versionArray.push({
              path: packageName + '/' + file.name,
              buffer: version
            });
          });
          callback(null, versionArray);
        });
      }
    });

  });

};

var listAllPackages = function(ftp, dir, callback) {
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
    currentVersion: matches[2]
  };
};

var syncDynamoDB = function(dynDB, version, callback) {
  var packageVersion = version.split('/')[1];
  var params = {
    TableName: 'rdoc-packages',
    Item: {
        PackageVersion: {S: packageVersion},
        SyncedTimestamp: {N: '' + new Date().getTime()},
        ParsedTimestamp: {N: '0'}
    }
  };
  dynDB.putItem(params, callback);
};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var dynamodb = new AWS.DynamoDB({region: 'us-east-1'});
  var directory = '/pub/R/src/contrib/';


  sync.fiber(function() {
    var packageList = sync.await(listAllPackages(ftp, directory, sync.defer()));
    var packageInfos = packageList.map(extractPackageInfo);
    Promise.map(packageInfos, function(packageInfo) {

      return Promise.promisify(downloadAllPackageVersions)(ftp, s3, packageInfo.name, packageInfo.currentVersion)
        .map(function(version) {
          return Promise.promisify(uploadPackage)(s3, version.path, version.buffer)
            .then(function() {
               console.info('Uploaded: ' + version.path);
               return version.path;
            })
            .then(function(versionPath) {
              console.info('Synced dyndb: ' + version.path);
              return Promise.promisify(syncDynamoDB)(dynamodb, versionPath);
            })
            .catch(function(err) {
              console.warn(err);
            });
        });

    })
    .then(function() {
      ctx.succeed();
    })
    .catch(function(err) {
      ctx.fail(err);
    });
  });

 // downloadAndUploadAllPackageVersions(ftp, s3, packageToGet, '1.0.0');
  
};