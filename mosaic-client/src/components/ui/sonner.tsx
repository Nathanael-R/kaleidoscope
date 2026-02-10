import { Toaster as Sonner, type ToasterProps } from "sonner"
import { usePreviewStore } from "@/store/preview-store"

const Toaster = ({ ...props }: ToasterProps) => {
  const { darkMode } = usePreviewStore()

  return (
    <Sonner
      theme={darkMode ? "dark" : "light"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
