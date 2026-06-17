declare global {
  interface Window {
    toastApi: {
      onShow: (cb: (payload: {
        title?: string
        body: string
        projectName?: string
        projectPath?: string
        isError?: boolean
        theme?: 'nord' | 'light'
      }) => void) => () => void
      focusMain: (projectPath?: string) => void
      hideWindow: () => void
    }
  }
}

export {}