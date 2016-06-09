var AWS = require('aws-sdk'); 
var Promise = require('bluebird');

var listToSyncPackageVersions = function(dynDB, lastKey, limit, callback) {
  console.info('Fetching package list');
  var params = {
    TableName: 'rdoc-packages',
    FilterExpression: 'SyncResult <> :success',
    ExpressionAttributeValues: {
      ':success': 200
    },
    Limit: limit,
    ProjectionExpression: 'PackageName, PackageVersion',
    ExclusiveStartKey: lastKey
  };
  return dynDB.scan(params, callback);
};

var getObject = function(s3, bucket, key, cb) {
  var params = {
    Bucket: bucket, /* required */
    Key: key, /* required */
    ResponseContentType: 'application/json'
  };
  s3.getObject(params, cb);
};

var putObject = function(s3, key, body, cb) {
  s3.putObject({
    Bucket: 'assets.rdocumentation.org', 
    Key: key,
    Body: body
  }, cb);
};



exports.handle = function(e, ctx) {
  var dynamodb = new AWS.DynamoDB.DocumentClient({region: 'eu-west-1'});
  var s3 = new AWS.S3();

  var buffer = [];
  var bufferId = 0;
  var bucketName = 'assets.rdocumentation.org';
  var lastEvaluatedKeyS3Key = 'rpackages/lastKey.json';
  var newLastKey = null;

  var getToSyncPackages = function(list, lastKey, limit) {
    return Promise.promisify(listToSyncPackageVersions)(dynamodb, lastKey, limit)
      .then(function(packageList) {
        console.log(packageList.Count);
        var mappedList = packageList.Items.map(function(packageVersion) {
          var name = packageVersion.PackageName;
          var version = packageVersion.PackageVersion;
          return {
            name: name,
            s3bucket: bucketName,
            s3key: 'rpackages/archived/' + name + '/' + name + '_' + version + '.tar.gz',
            version: version
          };
        });
        newLastKey = packageList.LastEvaluatedKey;
        if (list.length + mappedList.length < limit) {
          return getToSyncPackages(list.concat(mappedList), packageList.LastEvaluatedKey, limit);
        }
        else return list.concat(mappedList);
      });
  };
  
  Promise.promisify(getObject)(s3, bucketName, lastEvaluatedKeyS3Key)
    .then(function(s3Object) {
      try {
        return JSON.parse(s3Object.Body);
      } catch(err) {
        return null;
      }
    })
    .then(function(lastKey) {
      return getToSyncPackages([], lastKey, 300);
    })
    .then(function(list) {
      console.log(newLastKey);
      return Promise.promisify(putObject)(s3, lastEvaluatedKeyS3Key, JSON.stringify(newLastKey, null, 2))
      .then(function() {
        return list;
      });
    })
    .each(function(packageVersion) {
      buffer.push(packageVersion);
      if (buffer.length >= 100) {
        var json = JSON.stringify(buffer, null, 2);
        return Promise.promisify(putObject)(s3, 'rpackages/toParse/toParse' + bufferId + '.json', json)
          .then(function() {
            bufferId++;
            buffer = [];
            console.info('Wrote buffer');
            return 0;
          });
      } else return 1;
    })
    .then(function() {
      var json = JSON.stringify(buffer, null, 2);
        return Promise.promisify(putObject)(s3, 'rpackages/toParse/toParse' + bufferId + '.json', json)
          .then(function() {
            bufferId++;
            buffer = [];
            console.info('Wrote buffer');
            return 0;
          });
    })
    .then(function() {
      ctx.succeed();
    })
    .catch(function(err) {
      console.warn(err);
      ctx.fail(err);
    });
  
};