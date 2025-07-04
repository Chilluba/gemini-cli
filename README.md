# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

This repository contains the Gemini CLI, a command-line AI workflow tool that connects to your
tools, understands your code and accelerates your workflows.

With the Gemini CLI you can:

- Query and edit large codebases in and beyond Gemini's 1M token context window.
- Generate new apps from PDFs or sketches, using Gemini's multimodal capabilities.
- Automate operational tasks, like querying pull requests or handling complex rebases.
- Use tools and MCP servers to connect new capabilities, including [media generation with Imagen,
  Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Ground your queries with the [Google Search](https://ai.google.dev/gemini-api/docs/grounding)
  tool, built in to Gemini.

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 18](https://nodejs.org/en/download) or higher installed.
2. **Run the CLI:** Execute the following command in your terminal:

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

   Or install it with:

   ```bash
   npm install -g @google/gemini-cli
   gemini
   ```

3. **Pick a color theme**
4. **Authenticate:** When prompted, sign in with your personal Google account. This will grant you up to 60 model requests per minute and 1,000 model requests per day using Gemini.

You are now ready to use the Gemini CLI!

### For advanced use or increased limits:

If you need to use a specific model or require a higher request capacity, you can use an API key:

1. Generate a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key.

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

For other authentication methods, including Google Workspace accounts, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once the CLI is running, you can start interacting with Gemini from your shell.

You can start a project from a new directory:

```sh
cd new-project/
gemini
> Write me a Gemini Discord bot that answers questions using a FAQ.md file I will provide
```

Or work with an existing project:

```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> Give me a summary of all of the changes that went in yesterday
```

## Project Planning and Management (✅ Implemented)

Gemini CLI now includes project planning and task management features inspired by agentic workflows. These features help you plan and manage software projects directly from your terminal with AI assistance.

**Key Features:**
✅ Project specification generation with multimedia support  
✅ AI-powered task decomposition and tracking  
✅ Human-in-the-loop workflow with approval checkpoints  
✅ Session state management and project persistence  
✅ Automated error detection with AI-powered suggestions  
✅ Multimodal input processing (images, audio)  

### Project Planning Commands

*   **`gemini spec <initial prompt> [--image /path/to/img.png] [--audio /path/to/audio.wav]`**
    *   Generates a comprehensive project specification (`spec.md`) using AI
    *   Supports multimodal input: images are processed with Gemini Vision API
    *   Audio files are noted for future transcription integration
    *   Interactive approval workflow before proceeding
    *   Example: `gemini spec "Create a React todo app with TypeScript" --image ./mockup.png`

*   **`gemini tasks [--generate]`**
    *   Smart task management with AI-powered epic and task breakdown
    *   Displays existing tasks if `tasks.json` exists
    *   Generates structured tasks from `spec.md` when needed
    *   JSON format with status tracking (pending/in progress/done)
    *   Example: `gemini tasks --generate`

*   **`gemini plan`**
    *   Comprehensive project overview dashboard
    *   Shows complete `spec.md` content
    *   Displays organized task breakdown
    *   Provides next-step guidance
    *   Session state information

### Enhanced Workflow Example

1.  **Generate Project Specification:**
    ```bash
    gemini spec "Build a modern todo list web app with React, TypeScript, and local storage"
    ```
    *(Creates `spec.md` with detailed project breakdown, prompts for approval)*

2.  **Review and Edit:**
    Edit `spec.md` in your preferred editor to refine requirements

3.  **Generate Task Breakdown:**
    ```bash
    gemini tasks --generate
    ```
    *(AI parses `spec.md` into structured epics and tasks, saves to `tasks.json`)*

4.  **Monitor Project Progress:**
    ```bash
    gemini plan
    ```
    *(Complete overview of specification and task status)*

### Advanced Features

**Human-in-the-Loop (HITL):** Interactive approval points ensure you maintain control over the AI-generated content.

**Error Recovery:** Built-in error detection with AI-powered analysis and fix suggestions.

**Session Management:** Automatic state persistence in `.gemini-session.json` for workflow resumption.

**Multimodal Processing:** Support for image analysis (Gemini Vision) and audio file integration.

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `gemini`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Use MCP servers to integrate your local system tools with your enterprise collaboration suite.

```text
> Make me a slide deck showing the git history from the last 7 days, grouped by feature and team member.
```

```text
> Make a full-screen web app for a wall display to show our most interacted-with GitHub issues.
```

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organise my PDF invoices by month of expenditure.
```

### Uninstall

Head over to the [Uninstall](docs/Uninstall.md) guide for uninstallation instructions.

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Gemini CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).
