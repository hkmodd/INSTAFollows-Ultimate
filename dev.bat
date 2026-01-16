@echo off
REM Dev script for INSTAFollows Ultimate
REM Sets required environment variables and runs tauri dev

set "PATH=%PATH%;C:\Program Files\NASM;C:\Program Files\LLVM\bin"
set "LIBCLANG_PATH=C:\Program Files\LLVM\bin"

npm run tauri dev
