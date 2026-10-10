import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import type { PiProfile } from "./types.js";

/** One mutable model catalog is shared by both Harness instances. Credentials stay in provider auth, never in Pi documents. */
export class ProfileModels {
  readonly models = createModels();

  register(profile: PiProfile): void {
    const api =
      profile.requestType === "chat"
        ? "openai-completions"
        : "openai-responses";
    const providerId = `hcode-${profile.id}`;
    this.models.setProvider(
      createProvider({
        id: providerId,
        name: profile.name,
        baseUrl: profile.baseUrl,
        auth: {
          apiKey: {
            name: profile.name,
            resolve: async () => ({
              auth: { apiKey: profile.apiKey },
              source: "hcode profile",
            }),
          },
        },
        models: [
          {
            id: profile.model,
            name: profile.name,
            provider: providerId,
            api,
            baseUrl: profile.baseUrl,
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 128000,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
        api: {
          "openai-completions": openAICompletionsApi(),
          "openai-responses": openAIResponsesApi(),
        },
      }),
    );
  }
}
