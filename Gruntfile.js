module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-aws-lambda');
  grunt.initConfig({
    lambda_invoke: {
      default: {
        options: {
          file_name: 'functions/upload-packages/index.js',
          event: 'functions/upload-packages/event.json'
        },
      },
    },
    lambda_package: {
      default: {
        options: {
          include_files: ['.env', './app/**'],
        },
      },
    },
    lambda_deploy: {
      default: {
        arn: process.env.DEPLOY_ARN,
        options: {},
      },
    },
  });

  grunt.registerTask('check', ['jscs']);

  grunt.registerTask('run', ['lambda_invoke']);

  grunt.registerTask('build', ['lambda_package']);

  grunt.registerTask('deploy', ['build', 'lambda_deploy']);
};