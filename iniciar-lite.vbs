Option Explicit
Dim oShell, fso, rootDir, appPort, userDir, browserPath, altPath
Dim icoFile, shortcutPath, sc, chromeRunning, psWaitScript, pollResult, psFile, desktopLnk, icoPath, scDesktop, logFile, env, splashPath

Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
appPort = "4050"
userDir = fso.BuildPath(rootDir, ".chrome-profile-lite")
logFile = fso.BuildPath(fso.GetSpecialFolder(2), "nexus-lite-debug.log")

Sub Log(msg)
    Dim f: Set f = fso.OpenTextFile(logFile, 8, True)
    f.WriteLine Now & " - " & msg
    f.Close
End Sub

Log("Iniciando Nexus Lite desde: " & rootDir)

' ============================
' 1. Buscar navegador
' ============================
On Error Resume Next
browserPath = oShell.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
If Err.Number <> 0 Or browserPath = "" Then
    Err.Clear
    browserPath = oShell.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe\")
End If
On Error GoTo 0

If browserPath = "" Or Not fso.FileExists(browserPath) Then
    For Each altPath In Array( _
        "C:\Program Files\Google\Chrome\Application\chrome.exe", _
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", _
        oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe", _
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe")
        If fso.FileExists(altPath) Then browserPath = altPath: Exit For
    Next
End If

If browserPath = "" Then
    Log("ERROR: No se encontro navegador")
    MsgBox "No se encontro Chrome ni Edge.", vbExclamation, "Nexus Lite"
    WScript.Quit 1
End If
Log("Navegador: " & browserPath)

' ============================
' 2. Acceso directo escritorio
' ============================
icoPath = rootDir & "\icon.ico"
If Not fso.FileExists(icoPath) Then icoPath = fso.GetParentFolderName(rootDir) & "\icon.ico"
desktopLnk = oShell.SpecialFolders("Desktop") & "\Nexus Lite.lnk"
If Not fso.FileExists(desktopLnk) And fso.FileExists(icoPath) Then
    Set scDesktop = oShell.CreateShortcut(desktopLnk)
    scDesktop.TargetPath = WScript.ScriptFullName
    scDesktop.WorkingDirectory = rootDir
    scDesktop.IconLocation = icoPath & ", 0"
    scDesktop.Description = "Nexus Lite - Panel de Gestion"
    scDesktop.Save
    Log("Acceso directo creado")
End If

' ============================
' 3. Matar solo el proceso node que escucha en el puerto
' ============================
Log("Matando proceso node en puerto " & appPort)
oShell.Run "powershell -Command ""$c = Get-NetTCPConnection -LocalPort " & appPort & " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter ""ProcessId=$($c.OwningProcess)"" -ErrorAction SilentlyContinue; if ($p -and $p.Name -match 'node') { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }""", 0, True

' ============================
' 4. Matar Chrome kiosko previo (evita ventana vieja con logo anterior)
' ============================
Log("Matando instancias previas de Chrome kiosko")
On Error Resume Next
oShell.Run "powershell -Command ""Get-CimInstance Win32_Process -Filter 'Name=''chrome.exe'' or Name=''msedge.exe''' | Where-Object { $_.CommandLine -like '*" & userDir & "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }""", 0, True
On Error GoTo 0

' ============================
' 5. Crear splash HTML (preloader instantáneo)
' ============================
splashPath = oShell.ExpandEnvironmentStrings("%TEMP%") & "\nexus-lite-splash.html"
Dim splashFile: Set splashFile = fso.CreateTextFile(splashPath, True)
splashFile.WriteLine "<!DOCTYPE html><html><head><meta charset='UTF-8'><link rel='icon' type='image/png' href='http://localhost:" & appPort & "/logo.png'><meta http-equiv='refresh' content='3;url=http://localhost:" & appPort & "/'><title>Nexus Lite</title>"
splashFile.WriteLine "<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d0f14;color:#e2e8f0;font-family:system-ui,sans-serif}@keyframes s{to{transform:rotate(360deg)}}.sp{width:28px;height:28px;border:3px solid #2d3444;border-top-color:#f59e0b;border-radius:50%;animation:s .7s linear infinite}h1{font-size:1.8rem;font-weight:700;letter-spacing:-.02em;margin-bottom:1rem}p{color:#64748b;font-size:.8rem}</style></head>"
splashFile.WriteLine "<body><h1>Nexus Lite</h1><div class='sp'></div><p>Iniciando servidor...</p>"
splashFile.WriteLine "<script>!function e(){var t=new XMLHttpRequest;t.open('GET','http://localhost:" & appPort & "/api/status'),t.timeout=2e3,t.onload=function(){200===t.status&&(window.location='http://localhost:" & appPort & "/')},t.onerror=function(){setTimeout(e,1e3)},t.send()}()</script></body></html>"
splashFile.Close
Log("Splash creado: " & splashPath)

' ============================
' 5. Buscar Node.js
' ============================
Dim nodePath
nodePath = ""
On Error Resume Next
nodePath = oShell.RegRead("HKLM\SOFTWARE\Node.js\InstallPath\")
If Err.Number <> 0 Or nodePath = "" Then
    Err.Clear
    nodePath = oShell.RegRead("HKCU\SOFTWARE\Node.js\InstallPath\")
End If
On Error GoTo 0
If nodePath <> "" Then nodePath = fso.BuildPath(nodePath, "node.exe")

If nodePath = "" Or Not fso.FileExists(nodePath) Then
    For Each altPath In Array( _
        "C:\Program Files\nodejs\node.exe", _
        "C:\Program Files (x86)\nodejs\node.exe", _
        oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe", _
        oShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe")
        If fso.FileExists(altPath) Then nodePath = altPath: Exit For
    Next
End If


If nodePath = "" Or Not fso.FileExists(nodePath) Then
    Log("ERROR: No se encontro Node.js")
    MsgBox "Node.js no esta instalado o no se encuentra." & vbCrLf & vbCrLf & "Descarguelo desde: https://nodejs.org", vbExclamation, "Nexus Lite"
    WScript.Quit 1
End If
Log("Node.js: " & nodePath)

' ============================
' 6. Iniciar servidor
' ============================
Log("Iniciando servidor...")
Set env = oShell.Environment("PROCESS")
env("STANDALONE") = "true"
env("PORT") = appPort
env("BROWSER") = "none"
oShell.CurrentDirectory = rootDir
oShell.Run """" & nodePath & """ api-server.js", 0, False

' ============================
' 6b. Limpiar cache del perfil Chrome (evita JS viejo)
' ============================
On Error Resume Next
fso.DeleteFolder fso.BuildPath(userDir, "Default\Cache"), True
fso.DeleteFolder fso.BuildPath(userDir, "Default\Code Cache"), True
fso.DeleteFolder fso.BuildPath(userDir, "Default\Service Worker"), True
On Error GoTo 0
Log("Cache de perfil limpiada")

' ============================
' 7. Abrir Chrome inmediatamente (sin esperar health check)
' ============================
Log("Abriendo Chrome...")
shortcutPath = oShell.ExpandEnvironmentStrings("%TEMP%") & "\NexusLite-" & CStr(CLng(Timer * 100)) & ".lnk"
Set sc = oShell.CreateShortcut(shortcutPath)
sc.TargetPath = browserPath
sc.Arguments = "--app=file:///" & Replace(splashPath, "\", "/") & " --start-maximized --user-data-dir=""" & userDir & """ --no-first-run --no-default-browser-check --disable-sync --disable-features=Translate --disk-cache-size=1 --media-cache-size=1"
If fso.FileExists(icoPath) Then sc.IconLocation = icoPath & ", 0"
sc.Save
oShell.Run """" & shortcutPath & """", 1, False
fso.DeleteFile shortcutPath, True
Log("Chrome abierto con splash")

' ============================
' 8. Esperar cierre de Chrome
' ============================
psWaitScript = oShell.ExpandEnvironmentStrings("%TEMP%") & "\NexusLite-wait.ps1"
Set psFile = fso.CreateTextFile(psWaitScript, True)
psFile.WriteLine "$found = $false"
psFile.WriteLine "$procs = Get-CimInstance Win32_Process -Filter ""Name='chrome.exe' OR Name='msedge.exe'"" -ErrorAction SilentlyContinue"
psFile.WriteLine "ForEach ($p in $procs) {"
psFile.WriteLine "    if ($p.CommandLine -like '*" & userDir & "*') { $found = $true }"
psFile.WriteLine "}"
psFile.WriteLine "if ($found) { exit 0 } else { exit 1 }"
psFile.Close

Log("Esperando cierre de Chrome...")
Do While True
    chromeRunning = oShell.Run("powershell -ExecutionPolicy Bypass -File """ & psWaitScript & """", 0, True)
    If chromeRunning <> 0 Then Exit Do
    WScript.Sleep 500
Loop

' ============================
' 9. Cleanup
' ============================
Log("Chrome cerrado, limpiando...")
fso.DeleteFile psWaitScript, True
fso.DeleteFile splashPath, True
oShell.Run "powershell -Command ""$c = Get-NetTCPConnection -LocalPort " & appPort & " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter ""ProcessId=$($c.OwningProcess)"" -ErrorAction SilentlyContinue; if ($p -and $p.Name -match 'node') { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }""", 0, True
Log("Nexus Lite finalizado")
