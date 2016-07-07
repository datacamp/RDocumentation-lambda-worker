library("jsonlite");
source("scripts/package.R")
source("scripts/aws.R")

pruneNotRdFiles <- function(package_name) {
  package_path <- paste("packages", package_name, "man", sep="/")
  files <- list.files(path=package_path, recursive=TRUE, full.names = TRUE, include.dirs = TRUE)
  for (filename in rev(files)) {
    if (!(endsWith(filename, ".Rd") || endsWith(filename, ".rd"))) {
      file.remove(filename)
    }
  }
}

handle_package_version <- function(name, version, path) {
  print("Downloading tarball...");
  package_file_name <- paste(name, "_" , version, ".tar.gz", sep="");
  package_path <- paste("packages/", package_file_name, sep="");
  download(package_path, path);

  print("Untar tarball...");
  untar(package_path, exdir = "packages/")

  pruneNotRdFiles(name);

  print("Parsing package...");
  process_package(name);

  print("Posting SQS jobs...");
  postDescriptionJob(to_queue, name, version);

  postTopicsJob(to_queue, name, version);

  print("Syncing S3..."); 
  syncS3(name, version);    

  print("Cleaning files..."); 
  delete_files(package_path, name);
}

main <- function() {
  to_queue <- "RdocWorkerQueue";
  queue <- create_queue(to_queue);
  from_queue <- "RdocRWorkerQueue";
  queue <- create_queue(from_queue);


  while(1) {
    print("Polling for messages...");
    messages <- getMessages(from_queue);
    if(nrow(messages) > 0) {

      for (i in 1:nrow(messages)) {
        message <- as.list(messages[i, ])

        body <- fromJSON(message$Body)

        handle_package_version(body$name, body$version, body$path);

        print("Deleting job from SQS"); 
        delete_msg(from_queue, message$ReceiptHandle);
      } 
    }
    
  }

  
}

handle_package_version();

#main():

