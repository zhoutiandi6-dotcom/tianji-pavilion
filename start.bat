@echo off
chcp 65001 >nul
echo.
echo ╔═══════════════════════════════════════════╗
echo ║     天机阁 (TianJi Pavilion) 一键启动      ║
echo ╚═══════════════════════════════════════════╝
echo.

REM 检测 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js 22 LTS
    echo    下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js 版本:
node --version

REM 安装依赖
if not exist "node_modules\.prisma" (
    echo.
    echo 📦 安装依赖中...
    call npm install
) else (
    echo ✅ 依赖已安装
)

REM 数据库初始化
if not exist "apps\server\prisma\dev.db" (
    echo.
    echo 🗄️  初始化数据库...
    cd apps\server
    call npx prisma generate
    call npx prisma migrate dev --name init --skip-seed
    call npx ts-node prisma\seed.ts
    cd ..\..
    echo ✅ 数据库初始化完成
) else (
    echo ✅ 数据库已存在
)

echo.
echo 🚀 启动服务...
echo.
echo   前端: http://localhost:3000
echo   后端: http://localhost:3001/api
echo   健康: http://localhost:3001/api/health
echo.

REM 启动后端（新窗口）
start "天机阁-后端" cmd /c "cd /d %CD%\apps\server && npx nest start --watch"

REM 启动前端（新窗口）
start "天机阁-前端" cmd /c "cd /d %CD%\apps\web && npx next dev --port 3000"

echo.
echo ✅ 服务启动完成！
echo.
echo ⚠️  首次登录请使用:
echo     管理员: admin / admin123
echo.
pause
