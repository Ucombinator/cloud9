#!/usr/bin/env bash

set -e
set -u
set -o
set -x

#
# Usage: $./prep_apps.sh [src_dir] [target_dir]
#    src_dir    - path/to/tared/apps  (defaults to pwd)
#    target_dir - extract/to/path     (defaults to pwd/apps)
#   
       
# Expects tapas and anadroid to be on the path
#
# When unarchived, but before prep, the folder structure is assumed to be:
#
# AppName/
#   Foo/
#     src/
#     AndroidManifest.xml
#     ...
#   Bar.apk
#   ...
#
# After running the script the folder structure is transformed to:
#
# AppName/
#   project/
#     src/
#     AndroidManifest.xml
#     Bar.apk
#     ...
#   reports/
#     anadroid_risk.json
#     tapas_risk.json
#     appname_callgraph.json
#
# 
# The reason for this transformation is to iron out casing and folder naming inconsistencies 
# (see past generations of apps) so that downstream tools utilizing the source AND analysis 
# results can rely on a consistent convention
#
# An additional benefit is a sparser expansion of directories in ui tools with folder trees
#
# NOTE: 
#   IF the FOO folder has a sibling directory, such as a lib folder or a companion project or something,
#    the script will not successfully restructure the folders and will emit a message indicating such.

# the root directory of the prepared applications
# ready for starting cloud9 like so:
# cloud9-analyst/bin/cloud9.sh -w path/to/target_dir

script_dir=$(pwd)
src_dir="${1-$script_dir}"
src_dir=$(cd "${src_dir}"; pwd)

echo "src directory: ${src_dir}"

default_target_dir="apps"

target_dir="${2-$default_target_dir}"

mkdir "${target_dir}"
cd "${target_dir}"

target_dir=$(pwd)

echo "target directory: ${target_dir}"

for archive in ${src_dir}/*.tgz; do tar -xzvf $archive > /dev/null; done

# for each untared dir
#   rename the single inner dir to 'project'
#   copy remaining files (including apk) into the 'project' dir
#   add a 'reports' dir as a sibling to the 'project' dir

for app_dir in ./*; do 
   app_name=$(echo "${app_dir##*/}") # 
   
   echo "Restructuring ${app_name} directory tree"
   # assume there is one subdir for simplicity and any divergence can be manually fixed
   # *should* only be 1 directory here, but if there are more, then need to do more work 
   # earlier challenges had a less consistent directory structure, but hoping that's history....
   sub_dir_cnt=$(find ${app_dir} -mindepth 1 -maxdepth 1 -type d | wc -l)
   
   if [ $sub_dir_cnt -eq 1 ]; then
       # get the name of the only sub_dir - the parent of src/
       src_parent_dir=$(find ${app_dir} -mindepth 1 -maxdepth 1 -type d  | head -n 1)
       mv "${src_parent_dir}" "${app_dir}/project"

       # move the apk and other sibling files into the project dir
       # mv -n won't overwrite existing files, so leftovers indicate duplicates
       find "${app_dir}" -maxdepth 1 -type f -exec mv -n {} "${app_dir}/project" \; 
       
       ls "${app_dir}/project"
       ls ${app_dir}
        
    else
       echo "Too many subdirs in ${app_dir}. Please manually build folder structure."
    fi
    
    #mkdir "${app_dir}/reports"
    
    full_app_dir=$(cd "${app_dir}"; pwd)
    
    apk=$(find "${full_app_dir}" -name *.apk  | head -n 1)
       
    echo "Analyzing ${apk}"
    echo "Anadroid"
    ${script_dir}/anadroid "${apk}" # anadroid infers output path "${full_app_dir}/reports/"
    
    # adjust anadroid's placement of reports for what cloud9 expects
    mv "${apk%%.apk}/reports/" "${full_app_dir}/" 
    mv "${apk%%.apk}/statistics/" "${full_app_dir}/"
    mv "${apk%%.apk}/" "${full_app_dir}/out/"
    
    echo "Tapas"   
    # call graph and risk report 
    ${script_dir}/tapas "${apk}" "${full_app_dir}/reports/"

done

cd "${script_dir}"

echo "now run path/to/bin/cloud9.sh -w ${target_dir} to analyze results"

