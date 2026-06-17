; Verstak custom installer UI — borderless chrome + nsDialogs pages
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef VERSTAK_UI_INCLUDED
!define VERSTAK_UI_INCLUDED

Var Verstak.Dialog
Var Verstak.BtnNext
Var Verstak.BtnBack
Var Verstak.BtnCancel
Var Verstak.BtnClose
Var Verstak.RunCheck

Var Verstak.ParentTitlebar
Var Verstak.ParentSidebar
Var Verstak.ParentBtnNext
Var Verstak.ParentBtnBack
Var Verstak.ParentBtnCancel

!define VERSTAK_GWL_STYLE -16
!define VERSTAK_WS_CAPTION 0x00C00000
!define VERSTAK_WS_THICKFRAME 0x00040000
!define VERSTAK_WM_CLOSE 0x0010
!define VERSTAK_BM_CLICK 0x00F5
!define VERSTAK_SW_HIDE 0
!define VERSTAK_SW_SHOW 5
!define VERSTAK_WS_CHILD 0x40000000
!define VERSTAK_WS_VISIBLE 0x10000000
!define VERSTAK_SS_BITMAP 0x0000000E
!define VERSTAK_STM_SETIMAGE 0x0172
!define VERSTAK_IMAGE_BITMAP 0
!define VERSTAK_LR_LOADFROMFILE 0x0010
!define VERSTAK_STATIC_STYLE 0x5000000E

Function VerstakLoadBmpToHwnd
  Exch $1
  Exch
  Exch $0
  System::Call 'user32::LoadImage(p 0, t r0, i 0, i 0, i 0, i ${VERSTAK_LR_LOADFROMFILE}) i .r2'
  SendMessage $1 ${VERSTAK_STM_SETIMAGE} ${VERSTAK_IMAGE_BITMAP} $2
  Pop $0
  Pop $1
FunctionEnd

Function VerstakHideMuiNav
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${VERSTAK_SW_HIDE}
FunctionEnd

Function VerstakHideMuiHeader
  GetDlgItem $0 $HWNDPARENT 1037
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1038
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1044
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1046
  ShowWindow $0 ${VERSTAK_SW_HIDE}
FunctionEnd

Function VerstakApplyBorderless
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i ${VERSTAK_GWL_STYLE}) i .r0'
  IntOp $0 $0 & -12582913
  IntOp $0 $0 & -262145
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, i ${VERSTAK_GWL_STYLE}, i r0)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 0, i 0, i 0x27)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
FunctionEnd

Function VerstakClickClose
  SendMessage $HWNDPARENT ${VERSTAK_WM_CLOSE} 0 0
FunctionEnd

Function VerstakClickNext
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${VERSTAK_BM_CLICK} 0 0
FunctionEnd

Function VerstakClickBack
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${VERSTAK_BM_CLICK} 0 0
FunctionEnd

Function VerstakClickCancel
  GetDlgItem $0 $HWNDPARENT 3
  SendMessage $0 ${VERSTAK_BM_CLICK} 0 0
FunctionEnd

Function VerstakCreateBitmapOverlay
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i ${VERSTAK_STATIC_STYLE}, i r2, i r3, i r4, i r5, p $HWNDPARENT, i 0, p 0, i 0) i .r0'
  Push $0
  Push $1
  Call VerstakLoadBmpToHwnd
  Pop $0
  Push $0
FunctionEnd

Function VerstakDestroyParentChrome
  StrCmp $Verstak.ParentTitlebar "" +2
  System::Call 'user32::DestroyWindow(p $Verstak.ParentTitlebar)'
  StrCpy $Verstak.ParentTitlebar ""
  StrCmp $Verstak.ParentSidebar "" +2
  System::Call 'user32::DestroyWindow(p $Verstak.ParentSidebar)'
  StrCpy $Verstak.ParentSidebar ""
  StrCmp $Verstak.ParentBtnBack "" +2
  System::Call 'user32::DestroyWindow(p $Verstak.ParentBtnBack)'
  StrCpy $Verstak.ParentBtnBack ""
  StrCmp $Verstak.ParentBtnCancel "" +2
  System::Call 'user32::DestroyWindow(p $Verstak.ParentBtnCancel)'
  StrCpy $Verstak.ParentBtnCancel ""
  StrCmp $Verstak.ParentBtnNext "" chromeDone
  System::Call 'user32::DestroyWindow(p $Verstak.ParentBtnNext)'
  StrCpy $Verstak.ParentBtnNext ""
  chromeDone:
FunctionEnd

Function VerstakCreateParentChrome
  Call VerstakDestroyParentChrome

  Push "$PLUGINSDIR\titlebar.bmp"
  Push 0
  Push 0
  Push 396
  Push 40
  Call VerstakCreateBitmapOverlay
  Pop $Verstak.ParentTitlebar

  Push "$PLUGINSDIR\installerSidebar.bmp"
  Push 0
  Push 40
  Push 164
  Push 260
  Call VerstakCreateBitmapOverlay
  Pop $Verstak.ParentSidebar
FunctionEnd

Function VerstakStyleMuiFooter
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${VERSTAK_SW_SHOW}
  System::Call 'user32::SetWindowPos(p r0, p 0, i 12, i 254, i 96, i 34, i 0x14)'
  SetCtlColors $0 0xECEFF4 0x3B4252
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${VERSTAK_SW_SHOW}
  System::Call 'user32::SetWindowPos(p r0, p 0, i 300, i 254, i 96, i 34, i 0x14)'
  SetCtlColors $0 0xECEFF4 0x3B4252
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${VERSTAK_SW_SHOW}
  System::Call 'user32::SetWindowPos(p r0, p 0, i 384, i 254, i 120, i 34, i 0x14)'
  SetCtlColors $0 0x2E3440 0x88C0D0
FunctionEnd

Function VerstakDirectoryMuiShow
  Call VerstakEnsureChrome
  Call VerstakCreateParentChrome
  Call VerstakStyleMuiFooter
  GetDlgItem $0 $HWNDPARENT 1019
  SetCtlColors $0 0xECEFF4 0x2B313C
FunctionEnd

Function VerstakCreateTitlebar
  ${NSD_CreateBitmap} 0 0 100% 40u ""
  Pop $0
  ${NSD_SetBitmap} $0 "$PLUGINSDIR\titlebar.bmp" $1

  ${NSD_CreateBitmap} 94% 2u 46u 36u ""
  Pop $Verstak.BtnClose
  ${NSD_SetBitmap} $Verstak.BtnClose "$PLUGINSDIR\btn-close.bmp" $1
  ${NSD_OnClick} $Verstak.BtnClose VerstakClickClose
FunctionEnd

Function VerstakCreateSidebar
  ${NSD_CreateBitmap} 0 40u 164u 260u ""
  Pop $0
  ${NSD_SetBitmap} $0 "$PLUGINSDIR\installerSidebar.bmp" $1
FunctionEnd

Function VerstakCreateFooter
  StrCmp $Verstak.BtnNext "" 0 footerReuse

  ${NSD_CreateBitmap} 12u -46u 96u 34u ""
  Pop $Verstak.BtnBack
  ${NSD_SetBitmap} $Verstak.BtnBack "$PLUGINSDIR\btn-back.bmp" $1
  ${NSD_OnClick} $Verstak.BtnBack VerstakClickBack

  ${NSD_CreateBitmap} -108u -46u 96u 34u ""
  Pop $Verstak.BtnCancel
  ${NSD_SetBitmap} $Verstak.BtnCancel "$PLUGINSDIR\btn-cancel.bmp" $1
  ${NSD_OnClick} $Verstak.BtnCancel VerstakClickCancel

  ${NSD_CreateBitmap} -20u -46u 120u 34u ""
  Pop $Verstak.BtnNext
  ${NSD_SetBitmap} $Verstak.BtnNext "$PLUGINSDIR\btn-next.bmp" $1
  ${NSD_OnClick} $Verstak.BtnNext VerstakClickNext
  Return

  footerReuse:
  ShowWindow $Verstak.BtnBack ${VERSTAK_SW_SHOW}
  ShowWindow $Verstak.BtnCancel ${VERSTAK_SW_SHOW}
  ShowWindow $Verstak.BtnNext ${VERSTAK_SW_SHOW}
FunctionEnd

Function VerstakSetFooterPrimary
  Exch $0
  ${NSD_SetBitmap} $Verstak.BtnNext "$PLUGINSDIR\$0" $1
  Pop $0
FunctionEnd

Function VerstakStyleField
  Pop $0
  SetCtlColors $0 0xECEFF4 0x2B313C
FunctionEnd

Function VerstakEnsureChrome
  Call VerstakApplyBorderless
  Call VerstakHideMuiNav
  Call VerstakHideMuiHeader
FunctionEnd

Function VerstakPageInit
  Call VerstakEnsureChrome
  nsDialogs::Create 1018
  Pop $Verstak.Dialog
  Call VerstakCreateTitlebar
  Call VerstakCreateSidebar
FunctionEnd

Function VerstakWelcomeCreate
  Call VerstakPageInit
  ${NSD_CreateLabel} 180u 58u 280u 22u "Добро пожаловать в Verstak"
  Pop $0
  ${NSD_CreateLabel} 180u 88u 280u 120u "Мастер установит Verstak — IDE для AI-агентов — на ваш компьютер.$\r$\n$\r$\nРекомендуется закрыть другие приложения перед продолжением."
  Pop $0
  Call VerstakCreateFooter
  ShowWindow $Verstak.BtnBack ${VERSTAK_SW_HIDE}
  nsDialogs::Show
FunctionEnd

Function VerstakWelcomeLeave
FunctionEnd

Function VerstakInstFilesPre
  StrLen $0 "${APP_FILENAME}"
  StrCpy $1 $INSTDIR -$0
  StrCmp $1 "${APP_FILENAME}" instDone
  StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  instDone:
FunctionEnd

Function VerstakInstFilesShow
  Call VerstakInstFilesPre
  Call VerstakEnsureChrome
  Call VerstakCreateParentChrome
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${VERSTAK_SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${VERSTAK_SW_SHOW}
  System::Call 'user32::SetWindowPos(p r0, p 0, i 384, i 254, i 96, i 34, i 0x14)'
  SetCtlColors $0 0xECEFF4 0x3B4252
  GetDlgItem $0 $HWNDPARENT 1004
  SetCtlColors $0 0xECEFF4 0x2E3440
  GetDlgItem $0 $HWNDPARENT 1006
  SetCtlColors $0 0xD8DEE9 0x2E3440
  GetDlgItem $0 $HWNDPARENT 1007
  SetCtlColors $0 0x2E3440 0x88C0D0
FunctionEnd

Function VerstakInstFilesLeave
  Call VerstakDestroyParentChrome
FunctionEnd

Function VerstakFinishCreate
  Call VerstakPageInit
  ${NSD_CreateLabel} 180u 58u 280u 22u "Verstak установлен"
  Pop $0
  ${NSD_CreateLabel} 180u 88u 280u 72u "IDE для AI-агентов готова к работе. Ярлык появится в меню «Пуск» и на рабочем столе."
  Pop $0
  ${NSD_CreateCheckbox} 180u 170u 280u 14u "Запустить Verstak"
  Pop $Verstak.RunCheck
  ${NSD_Check} $Verstak.RunCheck
  Push $Verstak.RunCheck
  Call VerstakStyleField
  Call VerstakCreateFooter
  ShowWindow $Verstak.BtnBack ${VERSTAK_SW_HIDE}
  ShowWindow $Verstak.BtnCancel ${VERSTAK_SW_HIDE}
  Push "btn-finish.bmp"
  Call VerstakSetFooterPrimary
  nsDialogs::Show
FunctionEnd

Function VerstakFinishLeave
  ${NSD_GetState} $Verstak.RunCheck $0
  ${If} $0 == ${BST_CHECKED}
    Call StartApp
  ${EndIf}
FunctionEnd

!endif