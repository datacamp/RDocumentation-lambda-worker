var AWS = require('aws-sdk'); 
var _ = require('lodash');
var JSFtp = require('jsftp');
var sync = require('synchronize');
var through = require('through');

var downloadPackageVersion = function(ftp, ftppath, file, cb) {
  var uploadStream = through();
  var filename = ftppath + '/' + file;
  ftp.get(filename, function(err, socket) {
    socket.on('data', function(data) {
      uploadStream.emit('data', data);
    });
    socket.on('close', function(err) {
      uploadStream.emit('end');
      console.info('Donwloaded: ' + filename);
      cb(err, uploadStream);
    });
    socket.resume();
  });
  return uploadStream;
};

var uploadPackage = function(s3, packageName, filename, stream, size, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: 'rpackages/archived-test/' + packageName + '/' + filename,
    Body: stream,
    ContentLength: size
  }, cb);
};

var downloadAndUploadAllPackageVersions = function(ftp, s3, packageName, currentVersion) {
  var archiveDirectory = '/pub/R/src/contrib/Archive/';
  var currentVersionDirectory = '/pub/R/src/contrib';
  var packageArchiveDirectory = archiveDirectory + packageName;

  sync.fiber(function() {

    /* Donwload and upload current version */
    var currentVersionFilename = packageName + '_' + currentVersion + '.tar.gz';
    try {
      var filesize = sync.await(ftp.raw.size(currentVersionDirectory + '/' + currentVersionFilename, sync.defer())).text;
      var parsedSize = filesize.split(' ')[1]; // we get size in this format '213 filesize';
      var uploadStream = downloadPackageVersion(ftp, currentVersionDirectory, currentVersionFilename, sync.defer());
      uploadPackage(s3, packageName, currentVersionFilename, uploadStream, parsedSize, function(err, res) {
        if (err) console.warn(err);
        else console.info('Uploaded: ' + currentVersionFilename);
      });
      sync.await();
    } catch (err) {
      console.warn(err);
    }

    /* Download and upload Archives */
    ftp.ls(packageArchiveDirectory, function(err, res) {
      sync.fiber(function() {
        res.forEach(function(file) {
          var uploadStream = downloadPackageVersion(ftp, packageArchiveDirectory, file.name, sync.defer());
          uploadPackage(s3, packageName, file.name, uploadStream, file.size, function(err, res) {
            if (err) console.warn(err);
            else console.info('Uploaded: ' + file.name);
          });
          sync.await();
        });
      });
      
    });

  });

};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var directory = '/pub/R/src/contrib/';

  var params = {
    Bucket: 'assets.rdocumentation.org', 
    EncodingType: 'url'
  };

  var packageToGet = 'A3';

  downloadAndUploadAllPackageVersions(ftp, s3, packageToGet, '1.0.0');
  
};