@echo off
setlocal enabledelayedexpansion
title Nexus Lite - Analizador de Diseno
cd /d "%~dp0.."

set "IMG=%~1"
if not defined IMG (
    echo.
    echo   Nexus Lite - Analizador de Diseno
    echo   ---------------------------------
    echo   - Arrastra una imagen de tu diseno sobre este archivo .bat
    echo   - O escribi una ruta de archivo
    echo   - O escribi una direccion web de referencia
    echo.
    set /p "IMG=Entrada: "
)
if not defined IMG goto :sinimg

if not "%IMG:https://=%"=="%IMG%" goto :esurl
if not "%IMG:http://=%"=="%IMG%" goto :esurl
if not "%IMG:www.=%"=="%IMG%" goto :esurl
if exist "%IMG%" goto :esimg

echo.
echo   No existe el archivo y tampoco parece una URL: %IMG%
goto :fin

:esurl
set "NAME=%IMG%"
set "NAME=!NAME:*https://=!"
set "NAME=!NAME:*http://=!"
set "NAME=!NAME:*www.=!"
for /f "tokens=1 delims=/:?&" %%A in ("!NAME!") do set "NAME=%%A"
set "NAME=!NAME:.=_!"
if not defined NAME set "NAME=sitio"
echo.
echo   Capturando y analizando la web (diseño + paleta): "%IMG%"
echo.
node "herramientas\rediseno.mjs" analizar-web "%IMG%" "--nombre=%NAME%"
if errorlevel 1 goto :fin
goto :despues

:esimg
if not exist "%IMG%" (
    echo.
    echo   No existe el archivo: %IMG%
    goto :fin
)
for %%F in ("%IMG%") do set "NAME=%%~nF"
set "NAME=!NAME: =_!"
set "NAME=!NAME:.=_!"
echo.
echo   Analizando: "%IMG%"
echo.
node "herramientas\rediseno.mjs" analizar-imagen "%IMG%" "--nombre=%NAME%"
if errorlevel 1 goto :fin

:despues
echo.
choice /c SN /n /m "[S] Aplicar tema al storefront y validar?  [N] Solo analizar: "
if errorlevel 2 goto :preview

node "herramientas\rediseno.mjs" aplicar-tema "herramientas\disenos\%NAME%.tema.json"
if errorlevel 1 goto :fin
echo.
node "herramientas\rediseno.mjs" validar

:preview
echo.
set /p PRE="Abrir vista previa en Chrome? [S/N]: "
if /i not "%PRE%"=="S" goto :fin
netstat -ano | findstr ":4060 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo   Iniciando servidor de vista previa en el puerto 4060...
    start "Nexus Preview" /min cmd /c "set PORT=4060&& set STANDALONE=true&& set BROWSER=none&& node api-server.js"
    timeout /t 5 /nobreak >nul
)
start "" "http://localhost:4060/web/"
goto :fin

:sinimg
echo.
echo   No se ingreso ninguna entrada.
:fin
echo.
echo   Terminado. Tema en herramientas\disenos\%NAME%.tema.json
pause
endlocal