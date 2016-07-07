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

        print("Downloading tarball...");
        package_file_name <- paste(body$name, "_" , body$version, ".tar.gz", sep="");
        package_path <- paste("packages/", package_file_name, sep="");
        download(package_path, body$path);

        print("Untar tarball...");
        untar(package_path, exdir = "packages/")

        pruneNotRdFiles(body$name);

        print("Parsing package...");
        process_package(body$name);

        print("Posting SQS jobs...");
        postDescriptionJob(to_queue, body$name, body$version);

        postTopicsJob(to_queue, body$name, body$version);

        print("Syncing S3..."); 
        syncS3(body$name, body$version);    

        print("Cleaning files..."); 
        delete_files(package_path, body$name);

        print("Deleting job from SQS"); 
        delete_msg(from_queue, message$ReceiptHandle);
      } 
    }
    
  }

  
}

main();

