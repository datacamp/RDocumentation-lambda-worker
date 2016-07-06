library(staticdocs);
library(jsonlite);
library(stringr);

packages = list.dirs("packages", recursive = FALSE, full.names = FALSE)
wd = getwd()

print(packages)
parse_topic_and_write <- function(rd, topic, pkg, path, package_path) {
  
  html <- staticdocs:::to_html.Rd_doc(rd,
  env = new.env(parent = globalenv()),
  topic = topic,
  pkg = pkg)
  

  html$pagetitle <- html$name

  html$package <- pkg[c("package", "version")]

  out <- toJSON(html, auto_unbox= TRUE, pretty=TRUE)
  graphics.off()

  cat(out, file = path)
}

for (package_name in packages) {

  package_path =  paste("packages/", package_name, sep="")

  p <- devtools::as.package(package_path)

  out_dir = paste("jsons", package_name, p$version ,"man", sep="/")
  dir.create(out_dir, recursive= TRUE)

  pkg <- as.sd_package(package_path, site_path=out_dir)

  index <- pkg$rd_index
  index$file_out <- str_replace(index$file_out, "\\.html$", ".json")
  paths <- file.path(pkg$site_path, index$file_out)

  for (i in seq_along(index$name)) {
    message("Generating ", basename(paths[[i]]))

    rd <- pkg$rd[[i]]
    topic = pkg$rd_index$name[i]
    path = paste("../../", paths[[i]], sep = "")
    setwd(package_path)
    try(parse_topic_and_write(rd, topic, pkg, path, package_path))
    setwd(wd)
  }
  
  readme <- staticdocs:::readme(pkg)
  out_path_readme = paste("jsons", package_name, p$version,"Readme.html", sep="/")
  cat(readme, file= out_path_readme)

  desc_path = paste(package_path, "DESCRIPTION", sep="/")
  out_path = paste("jsons", package_name, p$version,"DESCRIPTION.json", sep="/")
  desc_json = toJSON(as.list(read.dcf(desc_path)[1, ]), pretty= TRUE, auto_unbox= TRUE)

  cat(desc_json, file = out_path)

}