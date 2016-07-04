library(staticdocs);
library(jsonlite);
library(stringr);

packages = list.files("packages")

for (package_name in packages) {

  package_path =  paste("packages/", package_name, sep="")

  out_dir = paste("jsons/", package_name, sep="")
  dir.create(out_dir, recursive= TRUE)

  pkg <- as.sd_package(package_path, site_path=out_dir)

  index <- pkg$rd_index
  index$file_out <- str_replace(index$file_out, "\\.html$", ".json")
  paths <- file.path(pkg$site_path, index$file_out)


  for (i in seq_along(index$name)) {
    message("Generating ", basename(paths[[i]]))

    rd <- pkg$rd[[i]]
    html <- staticdocs:::to_html.Rd_doc(rd,
      env = new.env(parent = globalenv()),
      topic = pkg$rd_index$name[i],
      pkg = pkg)

    html$pagetitle <- html$name

    html$package <- pkg[c("package", "version")]

    out <- toJSON(html, auto_unbox= TRUE, pretty=TRUE)
    graphics.off()

    cat(out, file = paths[[i]])
  }

  desc_path = paste(package_path, "DESCRIPTION", sep="/")
  out_path = paste(out_dir, "DESCRIPTION.json", sep="/")
  desc_json = toJSON(as.list(read.dcf(desc_path)[1, ]), pretty= TRUE, auto_unbox= TRUE)

  cat(desc_json, file = out_path)

}