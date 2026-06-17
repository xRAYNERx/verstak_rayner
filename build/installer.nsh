; Verstak — кастомный NSIS-установщик (Nord UI, nsDialogs)
; Подключается в заголовок NSIS-скрипта electron-builder.

!addincludedir "${PROJECT_DIR}\build"

!include "LogicLib.nsh"
!ifndef BUILD_UNINSTALLER
!include "verstak-ui.nsh"
!endif

!ifdef BUILD_UNINSTALLER
  !define MUI_HEADERIMAGE_UNBITMAP "${PROJECT_DIR}\build\uninstallerHeader.bmp"
!endif

; ── Nord palette ──
!define MUI_BGCOLOR "2E3440"
!define MUI_TEXTCOLOR "ECEFF4"
!define MUI_DIRECTORYPAGE_BGCOLOR "2E3440"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "ECEFF4"
!define MUI_INSTFILESPAGE_COLORS "2E3440 D8DEE9"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_INSTALLCOLORS "88C0D0 2E3440"

!define MUI_ABORTWARNING
!define MUI_BUTTONTEXT_FINISH "Готово"
!define MUI_BUTTONTEXT_NEXT "Далее"
!define MUI_BUTTONTEXT_BACK "Назад"
!define MUI_BUTTONTEXT_CANCEL "Отмена"
!define MUI_BUTTONTEXT_INSTALL "Установить"
!define MUI_BUTTONTEXT_CLOSE "Закрыть"

; UI-ассеты в архив установщика (нужны до первой страницы)
!macro customHeader
  ReserveFile "${PROJECT_DIR}\build\installerSidebar.bmp"
  ReserveFile "${PROJECT_DIR}\build\titlebar.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-next.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-back.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-cancel.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-install.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-finish.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-close.bmp"
  ReserveFile "${PROJECT_DIR}\build\btn-browse.bmp"
!macroend

!macro customInit
  InitPluginsDir
  SetOutPath $PLUGINSDIR
  File "${PROJECT_DIR}\build\installerSidebar.bmp"
  File "${PROJECT_DIR}\build\titlebar.bmp"
  File "${PROJECT_DIR}\build\btn-next.bmp"
  File "${PROJECT_DIR}\build\btn-back.bmp"
  File "${PROJECT_DIR}\build\btn-cancel.bmp"
  File "${PROJECT_DIR}\build\btn-install.bmp"
  File "${PROJECT_DIR}\build\btn-finish.bmp"
  File "${PROJECT_DIR}\build\btn-close.bmp"
  File "${PROJECT_DIR}\build\btn-browse.bmp"
!macroend

; Пропускаем страницу «для кого ставить» — всегда current user
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER

Function StartApp
  ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
FunctionEnd
!macro customWelcomePage
  !insertmacro MUI_PAGE_INIT
  PageEx custom
    PageCallbacks VerstakWelcomeCreate VerstakWelcomeLeave
  PageExEnd
!macroend

!define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakDirectoryMuiShow

!macro customFinishPage
  PageEx custom
    PageCallbacks VerstakFinishCreate VerstakFinishLeave
  PageExEnd
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakInstFilesShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerstakInstFilesLeave
  !define MUI_PAGE_HEADER_TEXT "Установка Verstak"
  !define MUI_PAGE_HEADER_SUBTEXT "Копирование файлов на диск"
!macroend
!endif

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Удаление Verstak"
  !define MUI_UNWELCOMEPAGE_TEXT "Мастер удалит Verstak с вашего компьютера.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend