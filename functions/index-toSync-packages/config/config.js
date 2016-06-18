module.exports = {
  limit: 10000,
  limitPerBuffer: 50,
  cran: {
    dynamoDBQueryParams: function(limit, lastKey){
      return {
        TableName: 'rdoc-packages',
        FilterExpression: 'ParsedTimestamp > :x',
        ExpressionAttributeValues: {
          ':x': 1466252501000
        },
        Limit: limit,
        ProjectionExpression: 'PackageName, PackageVersion',
        ExclusiveStartKey: lastKey
      };
    },

    lastEvaluatedKeyS3Key: 'rpackages/lastKey.json',
    mapper: function (packageVersion) {
      var name = packageVersion.PackageName;
      var version = packageVersion.PackageVersion;
      return {
        name: name,
        s3ZippedKey: 'rpackages/archived/'+ name + '/' + name + '_' + version + '.tar.gz',
        s3ParsedPrefix: 'rpackages/unarchived/' + name + '/' + version ,
        version: version,
        versionKey: 'PackageVersion',
        dynDBTable: 'rdoc-packages'
      };
    }
  },

  bioc: {
    dynamoDBQueryParams: function(limit, lastKey){
      return {
        TableName: 'bioc-packages',
        FilterExpression: 'SyncResult <> :success',
        ExpressionAttributeValues: {
          ':success': 200,
        },
        Limit: limit,
        ProjectionExpression: 'PackageName, BiocRelease',
        ExclusiveStartKey: lastKey
      };
    },

    lastEvaluatedKeyS3Key: 'rpackages/bioc/lastKey.json',
    mapper: function (packageVersion) {
      var name = packageVersion.PackageName;
      var biocRelease = packageVersion.BiocRelease;
      return {
        name: name,
        s3ZippedKey: 'rpackages/bioc/'+ biocRelease + '/' + name + '.tar.gz',
        s3ParsedPrefix: 'rpackages/bioc/' + biocRelease + '/parsed/' + name,
        version: biocRelease,
        versionKey: 'BiocRelease',
        dynDBTable: 'bioc-packages'
      };
    }
  }
};