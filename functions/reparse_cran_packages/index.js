var Promise = require('bluebird');
var common = require('lambda-common');

var createFileName = function(name, version) {
  return `${name}_${version}.tar.gz`;
}

exports.handle = function(e, ctx) {
  Promise.promisify(common.getState)('rpackages/continuous-parser.state.json')
  .then(function(state) {
    var currentParserVersion = state.parser_version;    

    return Promise.all(common.getOutdatedPackages(1, currentParserVersion)
    .then(function(packages){
      return packages;
    }).map(function(package) {
      var p = {
        name: package.name,
        version: package.latest_version,
        path: `ftp://cran.r-project.org/pub/R/src/contrib/${createFileName(package.name, package.latest_version)}`
      }
      return Promise.promisify(common.sendMessage)(p);
    })
    );
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};
