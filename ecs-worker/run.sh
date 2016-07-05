#!/bin/bash


Rscript scripts/get_jobs.R

cd packages && for a in `ls -1 *.tar.gz`; do gzip -dc $a | tar xf -; done && cd .. 

for a in `find jsons -name '[^(DESCRIPTION)]*.json'`; do 
  aws sqs send-message --queue-url https://sqs.us-west-1.amazonaws.com/352211034136/awseb-e-rgpnb8ixt5-stack-AWSEBWorkerQueue-20563PVPZ73Z \
    --message-body file://$a
    --message-attributes '{"type" : { "DataType":"String", "StringValue":"topic"}}'
done

for a in `find jsons -name 'DESCRIPTION.json'`; do 
  aws sqs send-message --queue-url https://sqs.us-west-1.amazonaws.com/352211034136/awseb-e-rgpnb8ixt5-stack-AWSEBWorkerQueue-20563PVPZ73Z \
    --message-body file://$a
    --message-attributes '{"type" : { "DataType":"String", "StringValue":"version"}}'
done

aws s3 sync jsons s3://assets.rdocumentation.org/rpackages/unarchived

Rscript scripts/generate.R