import { useEffect } from "react";

const APP_NAME = "beans";

/**
 * Sets the document title for the current view.
 *
 * A single-page app keeps whatever title the HTML shipped with unless it says
 * otherwise, so every route here used to be called "beans-frontend". Screen
 * readers announce the document title on navigation — with a constant one,
 * nothing signals that the view changed at all (WCAG 2.4.2).
 *
 * Pass an empty string while the view's own name is still loading; the app
 * name alone is used until it arrives.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
