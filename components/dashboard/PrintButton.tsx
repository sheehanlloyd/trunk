"use client";

import { Button } from "@/components/shared/Button";

/**
 * "Print report" trigger for the weekly report page. window.print() is the
 * whole share path — the browser's print-to-PDF gives owners a file they can
 * text or email. Hidden in the printout itself via print:hidden.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.print()}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75V4h.75A2.25 2.25 0 0 1 18 6.25v5.5A2.25 2.25 0 0 1 15.75 14H15v2.25c0 .966-.784 1.75-1.75 1.75h-6.5A1.75 1.75 0 0 1 5 16.25V14h-.75A2.25 2.25 0 0 1 2 11.75v-5.5A2.25 2.25 0 0 1 4.25 4H5V2.75Zm1.5 0V4h7V2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25Zm7 9.75h-7v3.75c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25V12.5Z"
          clipRule="evenodd"
        />
      </svg>
      Print report
    </Button>
  );
}
