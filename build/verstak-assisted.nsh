!include UAC.nsh

!ifndef INSTALL_MODE_PER_ALL_USERS
  !include multiUserUi.nsh
!endif

!ifndef BUILD_UNINSTALLER

  !insertmacro MUI_PAGE_INIT

  !insertmacro skipPageIfUpdated
  PageEx custom
    PageCallbacks VerstakWelcomeCreate VerstakWelcomeLeave
  PageExEnd

  !ifmacrodef licensePage
    !insertmacro skipPageIfUpdated
    !insertmacro licensePage
  !endif

  !ifndef INSTALL_MODE_PER_ALL_USERS
    !insertmacro PAGE_INSTALL_MODE
  !endif

  !ifdef allowToChangeInstallationDirectory
    !insertmacro skipPageIfUpdated
    PageEx custom
      PageCallbacks VerstakDirCreate VerstakDirLeave
    PageExEnd

    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW VerstakInstFilesShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerstakInstFilesLeave
  !endif

  !ifmacrodef customPageAfterChangeDir
    !insertmacro customPageAfterChangeDir
  !endif

  !insertmacro MUI_PAGE_INSTFILES

  !insertmacro skipPageIfUpdated
  PageEx custom
    PageCallbacks VerstakFinishCreate VerstakFinishLeave
  PageExEnd

!else
  !ifndef removeDefaultUninstallWelcomePage
    !ifmacrodef customUnWelcomePage
      !insertmacro customUnWelcomePage
    !else
      !insertmacro MUI_UNPAGE_WELCOME
    !endif
  !endif
  !ifndef INSTALL_MODE_PER_ALL_USERS
    !insertmacro PAGE_INSTALL_MODE
  !endif
  !insertmacro MUI_UNPAGE_INSTFILES
  !ifmacrodef customUninstallPage
    !insertmacro customUninstallPage
  !endif
  !insertmacro MUI_UNPAGE_FINISH
!endif

!macro initMultiUser
  !ifdef INSTALL_MODE_PER_ALL_USERS
    !insertmacro setInstallModePerAllUsers
  !else
    ${If} ${UAC_IsInnerInstance}
    ${AndIfNot} ${UAC_IsAdmin}
      SetErrorLevel 0x666666
      Quit
    ${endIf}

    !ifndef MULTIUSER_INIT_TEXT_ADMINREQUIRED
      !define MULTIUSER_INIT_TEXT_ADMINREQUIRED "$(^Caption) requires administrator privileges."
    !endif

    !ifndef MULTIUSER_INIT_TEXT_POWERREQUIRED
      !define MULTIUSER_INIT_TEXT_POWERREQUIRED "$(^Caption) requires at least Power User privileges."
    !endif

    !ifndef MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE
      !define MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE "Your user account does not have sufficient privileges to install $(^Name) for all users of this computer."
    !endif

    StrCpy $hasPerMachineInstallation "0"
    StrCpy $hasPerUserInstallation "0"

    ReadRegStr $perMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $perMachineInstallationFolder != ""
      StrCpy $hasPerMachineInstallation "1"
    ${endif}

    ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $perUserInstallationFolder != ""
      StrCpy $hasPerUserInstallation "1"
    ${endif}

    ${GetParameters} $R0
    ${GetOptions} $R0 "/allusers" $R1
    ${IfNot} ${Errors}
      StrCpy $hasPerMachineInstallation "1"
      StrCpy $hasPerUserInstallation "0"
    ${EndIf}

    ${GetOptions} $R0 "/currentuser" $R1
    ${IfNot} ${Errors}
      StrCpy $hasPerMachineInstallation "0"
      StrCpy $hasPerUserInstallation "1"
    ${EndIf}

    ${if} $hasPerUserInstallation == "1"
    ${andif} $hasPerMachineInstallation == "0"
      !insertmacro setInstallModePerUser
    ${elseif} $hasPerUserInstallation == "0"
      ${andif} $hasPerMachineInstallation == "1"
      !insertmacro setInstallModePerAllUsers
    ${else}
      !ifdef INSTALL_MODE_PER_ALL_USERS
        !insertmacro setInstallModePerAllUsers
      !else
        !ifdef INSTALL_MODE_PER_ALL_USERS_DEFAULT
          !insertmacro setInstallModePerAllUsers
        !else
          !insertmacro setInstallModePerUser
        !endif
      !endif
    ${endif}
  !endif
!macroend