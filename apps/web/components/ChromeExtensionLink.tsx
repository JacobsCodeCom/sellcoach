import type { ReactNode } from "react";
import { CHROME_EXTENSION_INSTALL_URL } from "@/lib/repo";

function ChromeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#fff" />
      <path
        fill="#EA4335"
        d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L3.34 5A10 10 0 0 1 12 2Z"
      />
      <path
        fill="#FBBC04"
        d="M3.34 5 7.67 12.5A5 5 0 0 0 12 17v5A10 10 0 0 1 3.34 5Z"
      />
      <path
        fill="#34A853"
        d="M12 22v-5a5 5 0 0 0 4.33-2.5H20.66A10 10 0 0 1 12 22Z"
      />
      <circle cx="12" cy="12" r="4.25" fill="#fff" />
      <circle cx="12" cy="12" r="3" fill="#4285F4" />
    </svg>
  );
}

type Props = {
  className?: string;
  children?: ReactNode;
};

/** Install link for signed-in users who record / learn in the Mira Chrome extension. */
export function ChromeExtensionLink({ className, children = "Get Mira for Chrome" }: Props) {
  const external = /^https?:\/\//i.test(CHROME_EXTENSION_INSTALL_URL);
  return (
    <a
      className={className}
      href={CHROME_EXTENSION_INSTALL_URL}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <ChromeIcon className="chrome-ext-icon" />
      <span>{children}</span>
    </a>
  );
}
