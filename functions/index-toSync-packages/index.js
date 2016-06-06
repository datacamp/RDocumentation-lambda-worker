var AWS = require('aws-sdk'); 
var Promise = require('bluebird');
var fs = require('fs');

var listToSyncPackageVersions = function(dynDB, lastKey, callback) {
  console.info('Fetching package list');
  var params = {
    TableName: 'rdoc-packages',
    FilterExpression: 'attribute_not_exists(SyncResult)',
    ProjectionExpression: 'PackageName, PackageVersion',
    ExclusiveStartKey: lastKey
  };
  return dynDB.scan(params, callback);
};


exports.handle = function(e, ctx) {
  var dynamodb = new AWS.DynamoDB.DocumentClient({region: 'eu-west-1'});

  var buffer = [];
  var bufferId = 0;

  var getToSyncPackages = function(list, lastKey) {
    return Promise.promisify(listToSyncPackageVersions)(dynamodb, lastKey)
      .then(function(packageList) {
        console.log(packageList.Count);
        var mappedList = packageList.Items.map(function(packageVersion) {
          var name = packageVersion.PackageName;
          var version = packageVersion.PackageVersion;
          return {
            name: name,
            version: version
          };
        });
        if (packageList.LastEvaluatedKey) {
          return getToSyncPackages(mappedList, packageList.LastEvaluatedKey);
        }
        else return list.concat(mappedList);
      });
  };
  
  getToSyncPackages([], null)
    .each(function(packageVersion) {
      buffer.push(packageVersion);
      if (buffer.length >= 100) {
        var json = JSON.stringify(buffer, null, 2);
        return Promise.promisify(fs.open)('toSync/toSync' + bufferId + '.json', 'w')
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
      var json = JSON.stringify(buffer, null, 2);
      return Promise.promisify(fs.open)('toSync/toSync' + bufferId + '.json', 'w')
        .then(function(fd) {
          return Promise.promisify(fs.writeFile)(fd, json);
        })
        .then(function(res) {
          bufferId++;
          buffer = [];
          console.info('Wrote buffer');
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