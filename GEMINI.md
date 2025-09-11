# GEMINI.md

## Project Overview

This is an open-source AI chatbot application built with Next.js and the Vercel AI SDK. It's designed to connect to various AI models and supports the Model Context Protocol (MCP) for extending its capabilities with tools. The user interface is built with shadcn/ui and Tailwind CSS, providing a modern and responsive experience. The application uses Drizzle ORM for database interactions.

The core of the application is the chat interface, which allows users to interact with different AI models. The application supports a wide range of models from providers like OpenAI, Google, Anthropic, Groq, and XAI.

## Building and Running

### Prerequisites

- Node.js and pnpm
- An environment file with the necessary API keys for the AI models you want to use. You can create a `.env.local` file from the `.env.example` file.

### Key Commands

- **Install dependencies:**
  ```bash
  pnpm install
  ```

- **Run in development mode:**
  ```bash
  pnpm dev
  ```
  The application will be available at `http://localhost:3000`.

- **Build for production:**
  ```bash
  pnpm build
  ```

- **Run in production mode:**
  ```bash
  pnpm start
  ```

- **Lint the code:**
  ```bash
  pnpm lint
  ```

- **Database migrations:**
  - **Generate migrations:**
    ```bash
    pnpm db:generate
    ```
  - **Apply migrations:**
    ```bash
    pnpm db:migrate
    ```
  - **Push schema changes (for development):**
    ```bash
    pnpm db:push
    ```
  - **Open Drizzle Studio:**
    ```bash
    pnpm db:studio
    ```

## Development Conventions

- **Framework:** The project is built with Next.js and uses the App Router.
- **UI:** The UI is built with shadcn/ui and Tailwind CSS.
- **AI:** The application uses the Vercel AI SDK to interact with various AI models.
- **Database:** Drizzle ORM is used for database interactions.
- **API:** API routes are located in the `app/api` directory.
- **Components:** Reusable components are located in the `components` directory.
- **Styling:** Global styles are in `app/globals.css`.
- **Linting:** The project uses ESLint for code linting.
