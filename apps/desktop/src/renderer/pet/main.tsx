import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PetApp } from "./PetApp.js";
import { FeedbackProvider } from "../shared/feedback.js";
import { KeyboardScope } from "../shared/keyboard.js";
import { I18nProvider } from "../shared/i18n/index.js";
import { ThemeProvider } from "../shared/theme/index.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <ThemeProvider>
          <KeyboardScope>
            <FeedbackProvider>
              <PetApp />
            </FeedbackProvider>
          </KeyboardScope>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>
  );
}
