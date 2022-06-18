# RDocumentation-lambda-worker

_Note:_ Please read this [confluence page](https://datacamp.atlassian.net/wiki/spaces/PRODENG/pages/2314469377/RDocumentation) which explains the complete architecture of how RDocumentation works.

Set up an AWS Lambda pipeline in Node.js that every hour:

1. Reads all packages and their versions from CRAN, Bioconductor, and Github.
2. If the package doesn't already exist in the S3 bucket [assets.rdocumentation.org](https://s3.console.aws.amazon.com/s3/buckets/assets.rdocumentation.org?region=us-east-1&tab=objects), it extracts the package information, and sends a job to the [rdocs-r-worker](https://us-east-1.console.aws.amazon.com/sqs/v2/home?region=us-east-1#/queues/https%3A%2F%2Fsqs.us-east-1.amazonaws.com%2F301258414863%2Frdoc-r-worker) SQS queue with basic information about the package.
3. The [rdocs-r-worker](https://us-east-1.console.aws.amazon.com/sqs/v2/home?region=us-east-1#/queues/https%3A%2F%2Fsqs.us-east-1.amazonaws.com%2F301258414863%2Frdoc-r-worker) will be processed by the [RPackageParser service](https://github.com/datacamp/r-package-parser).
4. The lambdas also update the JSON state files in the S3 bucket.

# Installation (deprecated)

TODO: replace these instructions because apex doesn't work anymore.

Use [apex](http://apex.run) command to deploy and invoke the lambda functions

Examples:

- `apex deploy unzip`
- `apex invoke unzip`
- `apex metrics unzip`

## License

See the [LICENSE](LICENSE.md) file for license rights and limitations (MIT).
