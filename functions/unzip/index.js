var AWS = require('aws-sdk'); 
var fs = require('fs');
var targz = require('tar.gz');
var through = require('through');


var uploadPipe = function(s3Client, version, bucketName, returnStream) {
  var dirPath = 'rpackages/unarchived';
  return through(function write(data) {
    var paths = data.path.split('/');
    var packageName = paths[0];
    var filePath = paths.slice(1).join('/');
    var path = [dirPath, packageName, version, filePath].join('/');
    s3Client.putObject({
      Bucket: bucketName, 
      Key: path,
      Body: data
    }, function(err, body) {
      if (err) {
        returnStream.emit('error', err);
      }
      else {
        body.path = path;
        returnStream.emit('data', body);
      }
    });
  });
};

var extractVersion = function(objectKey) {
  var matches = objectKey.match(/_(.*).tar.gz/);    
  return matches[1];
};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var bucketName = e.Records[0].s3.bucket.name;
  var objectKey = e.Records[0].s3.object.key;
  var version = extractVersion(objectKey);

  var req = s3.getObject({
    Bucket: bucketName, 
    Key: objectKey
  });

  var objectStream = req.createReadStream();
  var unzippingPipe = targz().createParseStream();

  var unzippedStream = objectStream.pipe(unzippingPipe);

  var fileStream = through();

  unzippedStream.on('entry', function(file) {
    if (file.type === 'File') {
      return fileStream.emit('data', file);
    }

  }).on('finish', function() {
    fileStream.emit('end');
  });

  var resultStream = through();

  fileStream.pipe(uploadPipe(s3, version, bucketName, resultStream));

  resultStream.on('data', function(data) {
    console.info('Uploaded: to ' + data.path);
  });

  resultStream.on('error', function(err) {
    console.error(err);
  });
};

