@echo off
chcp 65001 > nul
cd /d "%~dp0..\.."
setlocal enabledelayedexpansion

:: 设置输出文件路径
set "outputFile=songsData.json"

:: 创建空的JSON结构
echo { > "%outputFile%"
echo     "categories": [ >> "%outputFile%"

:: 遍历img文件夹下的所有子文件夹（分类）
set "firstCategory=true"
for /d %%c in ("img\*") do (
    set "categoryName=%%~nxc"
    
    :: 如果不是第一个分类，添加逗号
    if "!firstCategory!"=="false" (
        echo , >> "%outputFile%"
    )
    set "firstCategory=false"
    
    :: 开始当前分类的JSON结构
    echo         { >> "%outputFile%"
    echo             "name": "!categoryName!", >> "%outputFile%"
    echo             "songs": [ >> "%outputFile%"
    
    :: 获取当前分类下的所有歌曲文件
    set "firstSong=true"
    set "prevId="
    set "prevTitle="
    
    :: 先收集所有文件信息，以便处理多页和版本
    set "fileCount=0"
    for %%f in ("%%c\*.jpeg" "%%c\*.jpg") do (
        set /a "fileCount+=1"
        set "file!fileCount!=%%~nf"
    )
    
    :: 处理收集到的文件
    set "processedIds="
    for /l %%i in (1,1,!fileCount!) do (
        set "filename=!file%%i!"
        
        :: 解析文件名格式：分类_ID_标题[_版本][_页码]
        for /f "tokens=1-5 delims=_" %%a in ("!filename!") do (
            set "id=%%b"
            set "title=%%c"
            set "version=%%d"
            set "page=%%e"
        )
        
        :: 检查是否已经处理过这个ID
        echo !processedIds! | find "!id!" > nul
        if !errorlevel! neq 0 (
            :: 新歌曲ID，添加到处理列表
            set "processedIds=!processedIds! !id!"
            
            :: 如果不是第一个歌曲，添加逗号
            if "!firstSong!"=="false" (
                echo , >> "%outputFile%"
            )
            set "firstSong=false"
            
            :: 开始当前歌曲的JSON结构
            echo                 { >> "%outputFile%"
            echo                     "id": "!id!", >> "%outputFile%"
            echo                     "title": "!title!", >> "%outputFile%"
            
            :: 计算这个歌曲的页数（原谱）
            set /a "pageCount=0"
            for %%f in ("%%c\!id!_!title!_*.jpeg" "%%c\!id!_!title!_*.jpg") do (
                set /a "pageCount+=1"
            )
            
            :: 如果没有找到原谱，可能是版本文件，尝试其他模式
            if !pageCount! equ 0 (
                set /a "pageCount=0"
                for %%f in ("%%c\!id!_!title!*.jpeg" "%%c\!id!_!title!*.jpg") do (
                    set /a "pageCount+=1"
                )
            )
            
            echo                     "pages": !pageCount!, >> "%outputFile%"
            echo                     "filename": "!categoryName!_!id!_!title!", >> "%outputFile%"
            
            :: 收集所有版本（除了原谱）
            set "versions="
            for %%f in ("%%c\!id!_!title!_*_*.jpeg" "%%c\!id!_!title!_*_*.jpg") do (
                set "verFile=%%~nf"
                for /f "tokens=4 delims=_" %%v in ("!verFile!") do (
                    if not "!versions!"=="" (
                        set "versions=!versions!,"
                    )
                    set "versions=!versions!"%%v""
                )
            )
            
            echo                     "versions": [!versions!] >> "%outputFile%"
            echo                 } >> "%outputFile%"
        )
    )
    
    :: 结束当前分类的JSON结构
    echo             ] >> "%outputFile%"
    echo         } >> "%outputFile%"
)

:: 结束整个JSON结构
echo     ] >> "%outputFile%"
echo } >> "%outputFile%"


echo 已生成 %outputFile% 文件
pause