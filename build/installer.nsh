; Verstak — фирменный NSIS-установщик (Nord-тема, русский UI)
; !define здесь (не в macro) — до вставки MUI_PAGE_* в assistedInstaller.nsh

; Отдельный header для деинсталлятора (electron-builder не экспонирует uninstallerHeader)
!ifdef BUILD_UNINSTALLER
  !define MUI_HEADERIMAGE_UNBITMAP "${PROJECT_DIR}\build\uninstallerHeader.bmp"
!endif

; ── Nord palette (src/styles/theme.css) ──
!define MUI_BGCOLOR "2E3440"
!define MUI_TEXTCOLOR "ECEFF4"
!define MUI_INSTFILESPAGE_COLORS "2E3440 D8DEE9"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_INSTALLCOLORS "88C0D0 2E3440"

!define MUI_DIRECTORYPAGE_BGCOLOR "2B313C"
!define MUI_DIRECTORYPAGE_TEXT_TOP "Укажите папку, в которую будет установлен Verstak. Рекомендуется оставить путь по умолчанию."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Папка установки"

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

; Тёмный title bar Windows 10/11 + тёмные контролы на каждой странице
!define MUI_CUSTOMFUNCTION_GUIINIT VerstakGuiInit
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.VerstakGuiInit
!endif

Function VerstakGuiInit
  Call VerstakApplyDarkChrome
FunctionEnd

!ifdef BUILD_UNINSTALLER
Function un.VerstakGuiInit
  Call un.VerstakApplyDarkChrome
FunctionEnd
!endif

Function VerstakApplyDarkChrome
  Push $0
  Push $1
  Push $2

  ; DWMWA_USE_IMMERSIVE_DARK_MODE = 20
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'

  FindWindow $0 "#32770" "" $HWNDPARENT
  StrCmp $0 0 done

  System::Call 'dwmapi::DwmSetWindowAttribute(p r0, i 20, *i 1, i 4)'
  StrCpy $1 0
  loop:
    IntCmp $1 32 done
    GetDlgItem $2 $0 $1
    StrCmp $2 0 +3
      System::Call 'uxtheme::SetWindowTheme(p r2, w "DarkMode_Explorer", w 0)'
    IntOp $1 $1 + 1
    Goto loop

  done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!ifdef BUILD_UNINSTALLER
Function un.VerstakApplyDarkChrome
  Push $0
  Push $1
  Push $2

  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'

  FindWindow $0 "#32770" "" $HWNDPARENT
  StrCmp $0 0 done

  System::Call 'dwmapi::DwmSetWindowAttribute(p r0, i 20, *i 1, i 4)'
  StrCpy $1 0
  loop:
    IntCmp $1 32 done
    GetDlgItem $2 $0 $1
    StrCmp $2 0 +3
      System::Call 'uxtheme::SetWindowTheme(p r2, w "DarkMode_Explorer", w 0)'
    IntOp $1 $1 + 1
    Goto loop

  done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Добро пожаловать в Verstak"
  !define MUI_WELCOMEPAGE_TEXT "Мастер установит Verstak — IDE для AI-агентов — на ваш компьютер.$\r$\n$\r$\nРекомендуется закрыть другие приложения перед продолжением.$\r$\n$\r$\nНажмите «Далее», чтобы выбрать папку установки."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakApplyDarkChrome
  !insertmacro MUI_PAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "Папка установки"
  !define MUI_PAGE_HEADER_SUBTEXT "Выберите расположение Verstak"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakApplyDarkChrome
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Установка Verstak"
  !define MUI_PAGE_HEADER_SUBTEXT "Копирование файлов на диск"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakApplyDarkChrome
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Verstak установлен"
  !define MUI_FINISHPAGE_TEXT "IDE для AI-агентов готова к работе. Ярлык появится в меню «Пуск» и на рабочем столе."
  !define MUI_FINISHPAGE_RUN_TEXT "Запустить Verstak"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakApplyDarkChrome

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
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.VerstakApplyDarkChrome
  !insertmacro MUI_UNPAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "Удаление файлов"
  !define MUI_PAGE_HEADER_SUBTEXT "Verstak будет удалён с диска"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.VerstakApplyDarkChrome
!macroend