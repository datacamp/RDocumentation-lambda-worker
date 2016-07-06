#!/bin/bash
set -e

trap "echo Exited!; exit;" SIGINT SIGTERM

echo "Downloading new packages..."
Rscript scripts/get_jobs.R $1

echo "Extracting new packages..."
cd packages && for a in `ls -1 *.tar.gz`; do gzip -dc $a | tar xf -; done  
cd .. 

echo "Building jsons..."
Rscript scripts/generate.R

echo "Posting version jobs..."
for a in `find jsons -name 'DESCRIPTION.json'`; do 
  aws sqs send-message --queue-url https://sqs.us-west-1.amazonaws.com/352211034136/RdocWorkerQueue \
    --message-body file://$a \
    --message-attributes '{"type" : { "DataType":"String", "StringValue":"version"}}'
done

echo "Posting topic jobs..."
for a in `find jsons -name '[^(DESCRIPTION)]*.json'`; do 
  aws sqs send-message --queue-url https://sqs.us-west-1.amazonaws.com/352211034136/RdocWorkerQueue \
    --message-body file://$a \
    --message-attributes '{"type" : { "DataType":"String", "StringValue":"topic"}}'
done


echo "Sync with s3"
aws s3 sync jsons s3://assets.rdocumentation.org/rpackages/unarchived

