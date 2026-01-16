@echo off
REM Production build script for INSTAFollows Ultimate
REM Sets required environment variables and builds release

set "PATH=%PATH%;C:\Program Files\NASM;C:\Program Files\LLVM\bin"
set "LIBCLANG_PATH=C:\Program Files\LLVM\bin"

echo Building production release...
npm run tauri build
