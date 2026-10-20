@echo off
chcp 65001 > nul
cd /d "%~dp0..\.."
setlocal enabledelayedexpansion

:: Set output file path
set "outputFile=songsData.json"

:: Create empty JSON structure
echo { > "%outputFile%"
echo     "categories": { >> "%outputFile%"

:: Loop through all subfolders in img folder (categories)
set "firstCategory=true"
for /d %%c in ("img\*") do (
    set "categoryName=%%~nxc"
    
    :: Add comma if not the first category
    if "!firstCategory!"=="false" (
        echo , >> "%outputFile%"
    )
    set "firstCategory=false"
    
    :: Start current category JSON structure
    echo         "!categoryName!": { >> "%outputFile%"
    echo             "songs": { >> "%outputFile%"
    
    :: Get all song files in current category
    set "fileCount=0"
    for %%f in ("%%c\*.jpeg" "%%c\*.jpg") do (
        set /a "fileCount+=1"
        set "file!fileCount!=%%~nf"
    )
    
    :: Process collected files
    set "processedIds="
    for /l %%i in (1,1,!fileCount!) do (
        set "filename=!file%%i!"
        
        :: Parse filename format: category_ID_title[_version]_page
        for /f "tokens=1-5 delims=_" %%a in ("!filename!") do (
            set "id=%%b"
            set "title=%%c"
            set "version=%%d"
            set "page=%%e"
        )
        
        :: Check if this ID has been processed
        echo !processedIds! | find "!id!" > nul
        if !errorlevel! neq 0 (
            :: New song ID, add to processed list
            set "processedIds=!processedIds! !id!"
            
            :: Add comma if not the first song
            if not "!processedIds!"==" !id!" (
                echo , >> "%outputFile%"
            )
            
            :: Start current song JSON structure
            echo                 "!id!": { >> "%outputFile%"
            echo                     "title": "!title!", >> "%outputFile%"
            
            :: Calculate original score pages (only count original score files)
            set /a "pageCount=0"
            for %%f in ("%%c\!categoryName!_!id!_!title!_*.jpeg" "%%c\!categoryName!_!id!_!title!_*.jpg") do (
                set "verFile=%%~nf"
                :: Check if it's original score file (4 parts: category_ID_title_page)
                for /f "tokens=1-4 delims=_" %%a in ("!verFile!") do (
                    set "fileCategory=%%a"
                    set "fileId=%%b"
                    set "fileTitle=%%c"
                    set "filePage=%%d"
                    
                    if "!fileId!"=="!id!" if "!fileTitle!"=="!title!" (
                        :: Check if 4th part is page number
                        if "!filePage!"=="1" (
                            set /a "pageCount+=1"
                        )
                    )
                )
            )
            
            :: Collect all versions (except original score and numeric pages)
            set "versions="
            for %%f in ("%%c\!categoryName!_!id!_!title!_*_*.jpeg" "%%c\!categoryName!_!id!_!title!_*_*.jpg") do (
                set "verFile=%%~nf"
                :: Parse version info: format is category_ID_title_version_page
                for /f "tokens=1-5 delims=_" %%a in ("!verFile!") do (
                    set "fileCategory=%%a"
                    set "fileId=%%b"
                    set "fileTitle=%%c"
                    set "fileVersion=%%d"
                    set "filePage=%%e"
                    
                    if "!fileId!"=="!id!" if "!fileTitle!"=="!title!" (
                        :: Check if version name is not numeric
                        if not "!fileVersion!"=="1" if not "!fileVersion!"=="2" (
                            :: Not numeric, so it's a version name
                            if not defined versions (
                                set "versions="!fileVersion!""
                            ) else (
                                echo !versions! | find "!fileVersion!" > nul
                                if !errorlevel! neq 0 (
                                    set "versions=!versions!,"!fileVersion!""
                                )
                            )
                        )
                    )
                )
            )
            
            :: Add versions field if exists, and decide whether to add comma
            if defined versions (
                echo                     "pages": !pageCount!, >> "%outputFile%"
                echo                     "versions": [!versions!] >> "%outputFile%"
            ) else (
                echo                     "pages": !pageCount! >> "%outputFile%"
            )
            
            echo                 } >> "%outputFile%"
        )
    )
    
    :: End current category JSON structure
    echo             } >> "%outputFile%"
    echo         } >> "%outputFile%"
)

:: End entire JSON structure
echo     } >> "%outputFile%"
echo } >> "%outputFile%"

echo Generated %outputFile% file
pause