@echo off
REM Build script for INSTAFollows Ultimate
REM Sets required environment variables for BoringSSL/rquest compilation

set "PATH=%PATH%;C:\Program Files\NASM;C:\Program Files\LLVM\bin"
set "LIBCLANG_PATH=C:\Program Files\LLVM\bin"

echo Environment set:
echo LIBCLANG_PATH=%LIBCLANG_PATH%

cargo check %*
