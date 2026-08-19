@echo off
title Nexus Lite - Panel de Gestión
cd /d "%~dp0"

:MENU
cls
echo =================================================================
echo        NEXUS LITE - PANEL DE GESTION
echo =================================================================
echo.
echo   [1] Iniciar servidor (produccion)
echo       - Puerto 4050
echo       - Requiere build previo
echo.
echo   [2] Construir para produccion (build)
echo.
echo   [3] Salir
echo.
echo =================================================================
echo.
set /p OPCION="Seleccione opcion (1, 2 o 3): "

if "%OPCION%"=="1" goto PROD
if "%OPCION%"=="2" goto BUILD
if "%OPCION%"=="3" exit /b
goto MENU

:BUILD
cls
echo =================================================================
echo        NEXUS LITE - CONSTRUYENDO...
echo =================================================================
echo.

if not exist node_modules (
    echo [INFO] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo al instalar dependencias.
        pause
        exit /b
    )
)

echo [INFO] Construyendo para produccion...
call npm run build

if errorlevel 1 (
    echo [ERROR] Fallo la construccion.
    pause
    exit /b
)

echo.
echo [INFO] Build completado. Archivos en dist/
echo.
pause
goto MENU

:PROD
cls
echo =================================================================
echo        NEXUS LITE - PRODUCCION
echo =================================================================
echo.
echo   Admin:       http://localhost:4050
echo   Tienda Web:  http://localhost:4050/web
echo.
echo =================================================================
echo.

if not exist node_modules (
    echo [INFO] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo al instalar dependencias.
        pause
        exit /b
    )
)

if not exist dist\index.html (
    echo [ADVERTENCIA] No se encontro dist/. Ejecute la opcion 2 (build) primero.
    echo.
    set /p CONTINUAR="Desea construir ahora? (S/N): "
    if /i "!CONTINUAR!"=="S" (
        call npm run build
        if errorlevel 1 (
            echo [ERROR] Fallo la construccion.
            pause
            exit /b
        )
    ) else (
        pause
        exit /b
    )
)

echo [INFO] Iniciando servidor de produccion...
set STANDALONE=true
set PORT=4050
set BROWSER=none
call npm start

echo.
echo [INFO] Servidor detenido.
pause
exit /b
