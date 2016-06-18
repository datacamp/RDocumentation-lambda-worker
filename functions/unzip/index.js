var AWS = require('aws-sdk'); 
var targz = require('tar.gz');
var es = require('event-stream');
var Promise = require('bluebird');
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

var extractPackageInfo = function(filename) {
  var matches = filename.match(/.*\/(.*)_(.*)\.tar\.gz$/);
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

var syncDynamoDB = function(dynDB, item, value, callback) {
  var key = {
    PackageName : {S: item.name }
  };
  key[item.versionKey] = {S: item.version };
  var params = {
    TableName: item.dynDBTable,
    Key: key,
    AttributeUpdates: {
      ParsedTimestamp: {
        Action: 'PUT',
        Value: {N: value}
      }
    }
  };
  dynDB.updateItem(params, callback);
};

var descFileParserUploaderPipe = function(s3, bucketName, packageVersion) {
  return es.through(function (fileStream) {
    var self = this;
    var completePath = fileStream.path.split('/');
    var filePath = completePath.slice(1).join('/');
    var path = [packageVersion.s3ParsedPrefix, filePath].join('/') + '.json';

    var control = controlParser(fileStream);
    var json = {};
   
    control.on('stanza', function(stanza) {
      json = stanza;
    });
    control.on('done', function() {
      console.log(json);
      uploadData(s3, bucketName, path, JSON.stringify(json, null, 4), function(err, data) {
        if(err) {
          self.emit('error', err);
        } else {
          self.emit('data', data);
          self.emit('end');
        }
      });
    });

  });
};

var parsePackageVersion = function(s3, dynamodb, bucketName, packageVersion, cb) {
  var version = packageVersion.version;
  var name = packageVersion.name;
  var tarballObjectKey = packageVersion.s3ZippedKey;
  console.info('Version being extracted: ' + packageVersion.name + ' ' + version);

  var req = s3.getObject({
    Bucket: bucketName, 
    Key: tarballObjectKey
  });

  var objectStream = req.createReadStream();
  var unzippingPipe = targz().createParseStream();

  var unzippedStream = objectStream.pipe(unzippingPipe);

  var rdFileStream = es.through();
  var descFileStream = es.through();

  unzippedStream.on('entry', function(file) {
    if (file.type === 'File') {
      var path = file.path.split('/');
      if ((/\.Rd$/.test(file.path) || /\.rd$/.test(file.path))&& path[1] === 'man') {
        console.info('Found Rd file: ' + file.path);
        rdFileStream.emit('data', file);
      } else if (/DESCRIPTION$/.test(file.path)) {
        console.info('Found DESC file: ' + file.path);
        descFileStream.emit('data', file);  
      }
    }

  })
  .on('error', function(err){
    console.log('invalid archive for ' + name);
    rdFileStream.emit('end');
  })
  .on('finish', function() {
    rdFileStream.emit('finish');
  }).on('end', function() {
    rdFileStream.emit('end');
  });

  var rdFileToJsonToS3Stream = es.map(function (data, callback) {
    var p = new RDocParser();
    var completePath = data.path.split('/');
    var filePath = completePath.slice(1).join('/').replace(/Rd$/, 'json').replace(/rd$/, 'json');
    console.log(data.path);
    var path = [packageVersion.s3ParsedPrefix, filePath].join('/');
    try { 
      data
        .pipe(p).on('error', function(e){
          console.log('Failed during: ' + data.path + ' parsing');
          syncDynamoDB(dynamodb, packageVersion, '-1', function(err, res) {
            if (err !== null) {
              console.warn('failed to update dynamodb');
            }
            cb('failed during parsing of' + data.path);
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

  var descResultStream = descFileStream.pipe(descFileParserUploaderPipe(s3, bucketName, packageVersion));

  var rdResultStream = rdFileStream.pipe(rdFileToJsonToS3Stream)
    .on('data', function(data) {
      console.info('Uploaded to: ' + data);
    });
    


  es.merge(descResultStream, rdResultStream).on('error', function(err) {
    console.log('Pipe error ' + err);
    syncDynamoDB(dynamodb, packageVersion, '-1', function(err, res) {
      if (err !== null) {
        console.log('failed to update dynamodb');
      }
      cb(err, res);
    });
  })
  .on('end', function() {
    syncDynamoDB(dynamodb, packageVersion, '' + new Date().getTime(), function(err, res) {
      if (err !== null) {
        console.log('failed to update dynamodb');
        cb(err);
      } else {
        console.log('done');
        cb(null, res);
      }
    });
  });

};

var putObject = function(s3, key, body, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: key,
    Body: body
  }, cb);
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
        return Promise.map(packagesToBeDone, function(packageVersion) {
          return Promise.promisify(parsePackageVersion)(s3, dynamodb, bucketName, packageVersion)
            .then(function() {
              return { status: 'succeed'};
            })
            .catch(function(err) {
              console.warn('failed');
              return { status: 'failed', reason: err};
            });
        }, {concurrency : 10 })
        .then(function(result) {
          console.info(result);
          return Promise.promisify(putObject)(s3, objectKey.replace('toParse', 'toSync'), jsonFile.Body);
        })
        .then(function(result) {
          ctx.succeed();
        })
        .catch(function(err) {
          ctx.fail(err);
        });
      });
      

  } else if (objectKey.endsWith('.tar.gz')) {
    var infos = extractPackageInfo(objectKey);
    var name = infos.name;
    var version = infos.version;
    var packageVersion = {
      name: name,
      s3ZippedKey: 'rpackages/archived/'+ name + '/' + name + '_' + version + '.tar.gz',
      s3ParsedPrefix: 'rpackages/unarchived/' + name + '/' + version ,
      version: version,
      versionKey: 'PackageVersion',
      dynDBTable: 'rdoc-packages'
    };
    parsePackageVersion(s3, dynamodb, bucketName, packageVersion, function(err, res) {
      if (err !== null) ctx.fail(err);
      else ctx.succeed(); 
    });
  }

  
};

