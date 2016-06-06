var AWS = require('aws-sdk'); 
var Promise = require('bluebird');
var request = require('request');


var listJSONS = function(s3, bucket, packageName, packageVersion, cb) {
  var params = {
    Bucket: bucket,
    Prefix: 'rpackages/unarchived/' + packageName + '/' + packageVersion
  };
  s3.listObjects(params, cb);
};

var getJSON = function(s3, bucket, key, cb) {
  var params = {
    Bucket: bucket, /* required */
    Key: key, /* required */
    ResponseContentType: 'application/json'
  };
  s3.getObject(params, cb);
};

var postJSON= function(url, body, cb) {
  var options = {
    uri: url,
    method: 'POST',
    json: body
  };

  request(options, function (error, response, body) {
    if (error) {
      console.log(error);
      cb(error);
    } else {
      if(response.statusCode !== 200) console.log(url + ' ' + response.statusCode + '\n' + response.body);
      cb(null, {response: response, body: body});
    }
  });
};


var syncDynamoDB = function(dynDB, packageName, packageVersion, value, callback) {
  console.log(value);
  var params = {
    TableName: 'rdoc-packages',
    Key: {
        PackageVersion : {S: packageVersion },
        PackageName : {S: packageName }
    },
    AttributeUpdates: {
      SyncResult: {
        Action: 'PUT',
        Value: {N: '' + value}
      }
    }
  };
  dynDB.updateItem(params, callback);
};


exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();

  var dynamodb = new AWS.DynamoDB({region: 'eu-west-1'});

  var eventBucketName = e.Records[0].s3.bucket.name;
  var eventObjectKey = e.Records[0].s3.object.key;

  var bucketName = 'assets.rdocumentation.org';

  var postURL = 'http://rdocs-v2.herokuapp.com/api/';

  Promise.promisify(getJSON)(s3, eventBucketName, eventObjectKey)
    .then(function(jsonFile) {
      var packagesToBeDone = JSON.parse(jsonFile.Body);
      return packagesToBeDone;
    }).then(function(packageList){
    console.log(packageList);
    return Promise.map(packageList, function(package) {
      var packageName = package.name;
      var packageVersion = package.version;
      return Promise.promisify(listJSONS)(s3, bucketName, packageName, packageVersion)
        .then(function(s3Result) {
          var descriptionIndex = s3Result.Contents.findIndex(function(item) {
            return item.Key.endsWith('DESCRIPTION.json');
          });
          var description = s3Result.Contents[descriptionIndex];
          var topicList = s3Result.Contents.filter(function(item) {
            return !item.Key.endsWith('DESCRIPTION.json') && !item.Key.endsWith('NEWS.json');
          });
          return Promise.promisify(getJSON)(s3, bucketName, description.Key)
            .then(function(object) {
              return Promise.promisify(postJSON)(postURL + 'versions', JSON.parse(object.Body.toString('utf8')));
            })
            .then(function(postDescriptionResult) {
              if (postDescriptionResult.response.statusCode !== 200) throw postDescriptionResult;
              return Promise.map(topicList, function(item) {
                return Promise.promisify(getJSON)(s3, bucketName, item.Key)
                  .then(function(object) {
                    var url = postURL + 'packages/' + packageName + '/versions/' + packageVersion + '/topics';
                    return Promise.promisify(postJSON)(url, JSON.parse(object.Body.toString('utf8')));
                  }); 
              }).then(function(postTopicsResult) {
                return postTopicsResult.concat(postDescriptionResult);
              });
            })
            .then(function(resultList) {
              var error = resultList.find(function(response) {
                return response.response.statusCode !== 200 && response.response.statusCode !== 409;
              });
              var val;
              if (error) {
                console.log(error.response.statusCode);
                console.log(error.response.body);
                val = error.response.statusCode;
              } else {
                val = 200;
              }
              console.log(packageName + '-' + packageVersion + ' ' + val);
              return Promise.promisify(syncDynamoDB)(dynamodb, packageName, packageVersion, val);
            });
          
        })
        .then(function(dynDBResult) {
          return dynDBResult;
        })
        .catch(function(error) {
          console.warn(error);
          return error;
        });
    }, {concurrency: 3})
    .then(function() {
      ctx.succeed();
    })
    .catch(function(error) {
      ctx.succeed(error);
    });
    
  });
  
};