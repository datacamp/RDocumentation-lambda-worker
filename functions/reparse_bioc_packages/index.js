var Promise = require('bluebird');
var common = require('lambda-common');

exports.handle = function(e, ctx) {
  Promise.promisify(common.getState)('rpackages/continuous-parser.state.json').then(function(state) {
    var currentParserVersion = state.parser_version; 
    common.githubAuth(state.GITHUB_TOKEN);

    return common.getOutdatedPackages(2, currentParserVersion);
  })
  .map(function(package) {      
    return common.githubGetBranches('Bioconductor-mirror', package.name)
      .filter(function(branch) {
        return /release-(([0-9]+\.?)+)/.test(branch.name);
      })
      .map(function(branch) {
        branch.version = branch.name.match(/release-(([0-9]+\.?)+)/)[1];
        return branch;
      }).then(function(branches){
        var branch = branches.sort(common.compareVersions('desc', 'version'))[0];
        var job = {
          name: package.name,
          version: branch.version,
          repoType: 'bioconductor',
          path: `https://api.github.com/repos/Bioconductor-mirror/${package.name}/tarball/${branch.name}`,
        };
        return Promise.promisify(common.sendMessage)(job);
    })   
  })
  .then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};
