var AWS = require('aws-sdk'); 
var fs = require('fs');
var targz = require('tar.gz');
var es = require('event-stream');
var RDocParser = require('rd-to-json-parser');
var controlParser = require('debian-control-parser');


var uploadData = function(s3Client, bucketName, key, body, callback) {
  console.log('Uploading: ' + key);
  s3Client.putObject({
    Bucket: bucketName, 
    Key: key,
    Body: body
  }, callback);
};

var computeJSONPath = function(rdPath, destDir, version) {
  var paths = rdPath.split('/');
  var packageName = paths[0];
  paths[1] = 'topics';
  paths[paths.length - 1] = paths[paths.length - 1].replace('Rd', 'json');
  var filePath = paths.slice(1).join('/');  
  return [destDir, packageName, version, filePath].join('/');
};

var extractVersion = function(objectKey) {
  var matches = objectKey.match(/_(.*).tar.gz/);    
  return matches[1];
};

var descFileParserUploaderPipe = function(s3, bucketName, destDir, version) {
  return es.map(function (fileStream, callback) {
    var completePath = fileStream.path.split('/');
    var packageName = completePath[0];
    completePath[completePath.length - 1] = completePath[completePath.length - 1] += '.json';
    var filePath = completePath.slice(1).join('/');
    var path = [destDir, packageName, version, filePath].join('/');

    var control = controlParser(fileStream);
    var json = {};
    control.on('stanza', function(stanza) {
      json = stanza;
    });
    control.on('done', function() {
      uploadData(s3, bucketName, path, JSON.stringify(json, null, 4), function(err, data) {
        callback(err, path);
      });
    });

  });
};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var bucketName = e.Records[0].s3.bucket.name;
  var objectKey = e.Records[0].s3.object.key;
  var version = extractVersion(objectKey);
  var dirPath = 'rpackages/unarchived';

  var req = s3.getObject({
    Bucket: bucketName, 
    Key: objectKey
  });

  var objectStream = req.createReadStream();
  var unzippingPipe = targz().createParseStream();

  var unzippedStream = objectStream.pipe(unzippingPipe);

  var rdFileStream = es.through();
  var descFileStream = es.through();

  unzippedStream.on('entry', function(file) {
    if (file.type === 'File') {
      if (/\.Rd$/.test(file.path)) {
        rdFileStream.emit('data', file);
      } else if (/DESCRIPTION$/.test(file.path)) {
        descFileStream.emit('data', file);  
      }
    }

  }).on('finish', function() {
    rdFileStream.emit('finish');
  }).on('end', function() {
    rdFileStream.emit('end');
  });

  var rdFileToJsonToS3Stream = es.map(function (data, callback) {
    var p = new RDocParser();
    var path = computeJSONPath(data.path, dirPath, version);
    data
      .pipe(p)
      .pipe(es.wait(function(err, body) {
        uploadData(s3, bucketName, path, body, function(err, data) {
          callback(err, path);
        });
      }));
  });

  descFileStream.pipe(descFileParserUploaderPipe(s3, bucketName, dirPath, version));

  rdFileStream.pipe(rdFileToJsonToS3Stream)
    .on('data', function(data) {
      console.info('Uploaded to: ' + data);
    })
    .on('error', function(err) {
      console.error(err);
    });
};

