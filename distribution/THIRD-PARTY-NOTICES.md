# Upstream dependencies

This prototype uses DeepSeek Harness 0.2.0-rc.2 and Cordis 4.0.4, maintained by DeepSeek, plus js-yaml 4.2.0. The optional native Linux worker recipe pins OpenAI Codex 0.153.4 and Anthropic Claude Agent SDK 0.3.263. Native inference and authentication services are configured separately.

The maintained npm locks identify exact transitive versions, tarball URLs and integrity checks. Each installed package retains its own LICENSE and applicable notices; those upstream terms govern the respective package. Inspect them in node_modules before redistributing an installed runtime or worker image. No model weights, account stores or credentials are supplied.

Upstream projects: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), [Cordis](https://github.com/cordiverse/cordis), [js-yaml](https://github.com/nodeca/js-yaml), [OpenAI Codex](https://github.com/openai/codex), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript).
