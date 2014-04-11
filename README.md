
# Cloud9 Analyst

Follow the [cloud9 specific build instructions](https://github.com/ajaxorg/cloud9) for your os, then run:

    make start

Since risk report files do not explicitly specify their associated apk or source folder by name yet, we use a folder convention to associate risk reports with the correct source code.

There is a sample folder structure in this repository (which make start uses as the workspace):

    cloud9-analyst/
        ucombinator/
            apps/ <- 'make start' sets this as the cloud9 workspace directory (and you should too)
              <App1Name>/
                  project/
                      src/
                      AndroidManifest.xml
                      <App1Name>.apk
                      ...
                  reports/
                      AnadroidRiskReport.json
                      TapasRiskReport.json
                      MyRiskReport.json
                      ...

You can also specify a custom workspace dir like this (make sure to have run the [install steps](https://github.com/ajaxorg/cloud9) below for your os first):

    cd cloud9-analyst
    ./bin/cloud9.sh -w <path-to-workspace>

Note that the custom workspace should follow the same convention as the apps/ directory in the sample folder structure.
If you use a custom workspace, then make start is unncessary.
