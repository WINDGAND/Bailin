import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BubbleApp } from "./BubbleApp.js";
import { FeedbackProvider } from "../shared/feedback.js";
import { KeyboardScope } from "../shared/keyboard.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <KeyboardScope>
        <FeedbackProvider>
          <BubbleApp />
        </FeedbackProvider>
      </KeyboardScope>
    </StrictMode>
  );
}
