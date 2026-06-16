; Verstak — фирменный NSIS-установщик (Nord-тема, русский UI)
; !define здесь (не в macro) — до вставки MUI_PAGE_* в assistedInstaller.nsh

!define MUI_BGCOLOR "2E3440"
!define MUI_TEXTCOLOR "ECEFF4"
!define MUI_INSTFILESPAGE_COLORS "2E3440 ECEFF4"

!define MUI_WELCOMEPAGE_BGCOLOR "2E3440"
!define MUI_WELCOMEPAGE_TEXT_COLOR "ECEFF4"
!define MUI_FINISHPAGE_BGCOLOR "2E3440"
!define MUI_FINISHPAGE_TEXT_COLOR "ECEFF4"
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

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Добро пожаловать в Verstak"
  !define MUI_WELCOMEPAGE_TEXT "Мастер установит Verstak — IDE для AI-агентов — на ваш компьютер.$\r$\n$\r$\nРекомендуется закрыть другие приложения перед продолжением.$\r$\n$\r$\nНажмите «Далее», чтобы выбрать папку установки."
  !insertmacro MUI_PAGE_WELCOME
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
!macroend