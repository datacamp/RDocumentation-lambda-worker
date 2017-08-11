var Promise = require('bluebird');
var common = require('lambda-common');

exports.handle = function(e, ctx) {
  Promise.promisify(common.getState)('rpackages/continuous-parser.state.json').then(function(state) {
    var currentParserVersion = state.parser_version;    

    return Promise.all(common.getOutdatedPackages(4, currentParserVersion).then(function(packages){
      return packages;
    }).map(function(package) {
      var p = {
        name: package.name,
        version: package.latest_version,
        path: `https://s3.amazonaws.com/assets.rdocumentation.org/rpackages/archived/${package.name}/${package.name}_${package.latest_version}.tar.gz`
      }
      return Promise.promisify(common.sendMessage)(p);
    }));
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err); 
    return ctx.fail();
  });

};
