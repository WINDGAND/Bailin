import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "./app/SettingsApp.js";
import { FeedbackProvider } from "../shared/feedback.js";
import { KeyboardScope } from "../shared/keyboard.js";
import { I18nProvider } from "../shared/i18n/index.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <KeyboardScope>
          <FeedbackProvider>
            <SettingsApp />
          </FeedbackProvider>
        </KeyboardScope>
      </I18nProvider>
    </StrictMode>
  );
}
