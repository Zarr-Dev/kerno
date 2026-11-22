@echo off
setlocal
title Kerno - Windows Host Diagnostics
echo.
echo  KERNO WINDOWS HOST AND TOOLCHAIN CHECK
echo  ======================================
echo.
echo [HOST]
ver
echo.
echo [PYTHON 3.10+]
call :probe python --version
echo.
echo [ASSEMBLER]
call :probe nasm --version
echo.
echo [C CROSS COMPILER]
call :probe x86_64-elf-gcc --version
echo.
echo [C++ CROSS COMPILER]
call :probe x86_64-elf-g++ --version
echo.
echo [LINKER]
call :whereonly x86_64-elf-ld
echo.
echo [GRUB ISO BUILDER]
call :probe grub-mkrescue --version
echo.
echo [XORRISO]
call :probe xorriso --version
echo.
echo [QEMU]
call :probe qemu-system-x86_64 --version
echo.
echo Notes:
echo - This script only checks commands already available on PATH.
echo - It does not install packages or modify Windows environment variables.
echo - The current Kerno native ISO pipeline targets x86_64 + BIOS + GRUB + Multiboot2.
echo.
pause
exit /b 0

:probe
where %1 >nul 2>&1
if errorlevel 1 (
  echo [MISSING] %1
  exit /b 0
)
echo [FOUND] %1
%1 %2
exit /b 0

:whereonly
where %1 >nul 2>&1
if errorlevel 1 (
  echo [MISSING] %1
) else (
  echo [FOUND] %1
  where %1
)
exit /b 0
