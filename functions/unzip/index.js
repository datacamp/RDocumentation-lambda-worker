var AWS = require('aws-sdk'); 
var fs = require('fs');
var targz = require('tar.gz');
var es = require('event-stream');
var Promise = require("bluebird");
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

var extractPackageInfo = function(filename) {
  var matches = filename.match(/(.*)\/(.*)_(.*)\.tar\.gz$/);
  return {
    name: matches[2],
    version: matches[3]
  };
};

var fetchJSONFile = function(s3, bucket, key, cb) {
  var params = {
    Bucket: bucket, /* required */
    Key: key, /* required */
  };
  s3.getObject(params, cb);
};

var syncDynamoDB = function(dynDB, packageInfo, value, callback) {
  var params = {
    TableName: 'rdoc-packages',
    Key: {
        PackageVersion : {S: packageInfo.version },
        PackageName : {S: packageInfo.name }
    },
    AttributeUpdates: {
      ParsedTimestamp: {
        Action: 'PUT',
        Value: {N: value}
      }
    }
  };
  dynDB.updateItem(params, callback);
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

var parsePackageVersion = function(s3, dynamodb, bucketName, objectKey, cb) {
  var packageInfo = extractPackageInfo(objectKey);
  var version = packageInfo.version;
  console.info('Version being extracted: ' + packageInfo.name + ' ' + version);
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
      var path = file.path.split('/');
      if (/\.Rd$/.test(file.path) && path[1] === 'man') {
        console.info('Found Rd file: ' + file.path);
        rdFileStream.emit('data', file);
      } else if (/DESCRIPTION$/.test(file.path)) {
        console.info('Found DESC file: ' + file.path);
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
    try { 
      data
        .pipe(p).on('error', function(e){
          console.log('Failed during: ' + data.path + ' parsing');
          syncDynamoDB(dynamodb, packageInfo, '-1', function(err, res) {
            if (err !== null) {
              console.warn('failed to update dynamodb');
            }
            cb(err);
          });
        })
        .pipe(es.wait(function(err, body) {
          uploadData(s3, bucketName, path, body, function(err, data) {
            if (err !== null) {
              console.log('failed to upload to s3 ' + err);
            }
            callback(err, path);
          });
        }));
    } catch (err) {
      console.log('Stream error ' + err);
      cb(err);
    }
  });

  descFileStream.pipe(descFileParserUploaderPipe(s3, bucketName, dirPath, version));

  rdFileStream.pipe(rdFileToJsonToS3Stream)
    .on('data', function(data) {
      console.info('Uploaded to: ' + data);
    })
    .on('error', function(err) {
      console.log('Pipe error ' + err);
      syncDynamoDB(dynamodb, packageInfo, '-1', function(err, res) {
        if (err !== null) {
          console.log('failed to update dynamodb');
        }
        cb(err);
      });
    })
    .on('end', function() {
      syncDynamoDB(dynamodb, packageInfo, '' + new Date().getTime(), function(err, res) {
        if (err !== null) {
          console.log('failed to update dynamodb');
          cb(err);
        } else {
          cb(null);
        }
      });
    });
};

exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();
  var dynamodb = new AWS.DynamoDB({region: 'eu-west-1'});

  var bucketName = e.Records[0].s3.bucket.name;
  var objectKey = e.Records[0].s3.object.key;

  if (objectKey.endsWith('json')) {

    Promise.promisify(fetchJSONFile)(s3, bucketName, objectKey)
      .then(function(jsonFile) {
        var packagesToBeDone = JSON.parse(jsonFile.Body);
        return packagesToBeDone;
      })
      .map(function(packageVersion) {
        return Promise.promisify(parsePackageVersion)(s3, dynamodb, packageVersion.s3bucket, packageVersion.s3key)
          .then(function() {
            return { status: 'succeed'};
          })
          .catch(function(err) {
            console.warn('failed');
            return { status: 'failed', reason: err};
          });
      }, {concurrency : 5})
      .then(function(result) {
        console.info(result);
        ctx.succeed();
      })
      .catch(function(err) {
        ctx.fail(err);
      });

  } else if (objectKey.endsWith('.tar.gz')) {
    parsePackageVersion(s3, dynamodb, bucketName, objectKey, function(err, res) {
      if (err !== null) ctx.fail(err);
      else ctx.succeed(); 
    });
  }

  
};

