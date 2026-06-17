; Verstak — NSIS-установщик (Nord MUI + фирменные sidebar/header BMP)
; Стандартный assisted installer electron-builder.

!ifdef BUILD_UNINSTALLER
  !define MUI_HEADERIMAGE_UNBITMAP "${PROJECT_DIR}\build\uninstallerHeader.bmp"
!endif

; ── Nord palette (src/styles/theme.css) ──
!define MUI_BGCOLOR "2E3440"
!define MUI_TEXTCOLOR "ECEFF4"
!define MUI_DIRECTORYPAGE_BGCOLOR "2B313C"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "ECEFF4"
!define MUI_DIRECTORYPAGE_TEXT_TOP "Укажите папку, в которую будет установлен Verstak. Рекомендуется оставить путь по умолчанию."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Папка установки"
!define MUI_INSTFILESPAGE_COLORS "2E3440 D8DEE9"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_INSTALLCOLORS "88C0D0 2E3440"

!define MUI_WELCOMEPAGE_BGCOLOR "2E3440"
!define MUI_WELCOMEPAGE_TEXT_COLOR "ECEFF4"
!define MUI_FINISHPAGE_BGCOLOR "2E3440"
!define MUI_FINISHPAGE_TEXT_COLOR "ECEFF4"
!define MUI_FINISHPAGE_LINK_COLOR "88C0D0"
!define MUI_UNWELCOMEPAGE_BGCOLOR "2E3440"
!define MUI_UNWELCOMEPAGE_TEXT_COLOR "ECEFF4"
!define MUI_UNFINISHPAGE_BGCOLOR "2E3440"
!define MUI_UNFINISHPAGE_TEXT_COLOR "ECEFF4"

!define MUI_ABORTWARNING
!define MUI_BUTTONTEXT_FINISH "Готово"
!define MUI_BUTTONTEXT_NEXT "Далее"
!define MUI_BUTTONTEXT_BACK "Назад"
!define MUI_BUTTONTEXT_CANCEL "Отмена"
!define MUI_BUTTONTEXT_INSTALL "Установить"
!define MUI_BUTTONTEXT_CLOSE "Закрыть"

; Всегда установка для текущего пользователя (perMachine: false)
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Добро пожаловать в Verstak"
  !define MUI_WELCOMEPAGE_TEXT "Мастер установит Verstak — IDE для AI-агентов — на ваш компьютер.$\r$\n$\r$\nРекомендуется закрыть другие приложения перед продолжением.$\r$\n$\r$\nНажмите «Далее», чтобы выбрать папку установки."
  !insertmacro MUI_PAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "Папка установки"
  !define MUI_PAGE_HEADER_SUBTEXT "Выберите расположение Verstak"
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Установка Verstak"
  !define MUI_PAGE_HEADER_SUBTEXT "Копирование файлов на диск"
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Verstak установлен"
  !define MUI_FINISHPAGE_TEXT "IDE для AI-агентов готова к работе. Ярлык появится в меню «Пуск» и на рабочем столе."
  !define MUI_FINISHPAGE_RUN_TEXT "Запустить Verstak"

  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Удаление Verstak"
  !define MUI_UNWELCOMEPAGE_TEXT "Мастер удалит Verstak с вашего компьютера.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."
  !insertmacro MUI_UNPAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "Удаление файлов"
  !define MUI_PAGE_HEADER_SUBTEXT "Verstak будет удалён с диска"
!macroend