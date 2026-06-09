@echo off
:: ═══════════════════════════════════════════════════════════
::  Simpan file ini di folder proxy-server\
::  Lalu tambah folder proxy-server ke PATH Windows lo
::  Setelah itu ketik "claude" dari MANAPUN — otomatis works!
::
::  Setup PATH (jalanin sekali):
::    setx PATH "%PATH%;C:\path\ke\proxy-server"
:: ═══════════════════════════════════════════════════════════

:: Set CWD sebagai env var — proxy akan baca ini
set POSTMAN_CWD=%CD%

:: Set Claude Code ke proxy
set ANTHROPIC_BASE_URL=http://127.0.0.1:8020
set ANTHROPIC_API_KEY=NanzGabby

:: Pass CWD lewat header via env var khusus
set CLAUDE_PROJECT_DIR=%CD%

:: Jalanin claude dengan semua arg yang dikasih
claude %*
