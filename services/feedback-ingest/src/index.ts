import { handleFeedback, type IngestEnv } from "./handler.js";

export default {
  fetch(request: Request, env: IngestEnv): Promise<Response> {
    return handleFeedback(request, env);
  }
};
