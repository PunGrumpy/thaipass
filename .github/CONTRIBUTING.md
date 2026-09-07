# Contributing to thaipass

Thank you for your interest in contributing! thaipass is an open-source project, and contributions are welcome! Whether you want to improve the documentation, add new features, or contribute code, here's how you can get involved.

## Source Code

thaipass's source code is hosted on GitHub at [PunGrumpy/thaipass](https://github.com/PunGrumpy/thaipass). The repository contains all source code, build scripts, and documentation.

## Monorepo Structure

thaipass is a monorepo managed with [Bun](https://bun.sh) workspaces and [Turborepo](https://turbo.build/):

- `apps/proxy` - Elysia-based proxy server exposing OpenAI-compatible (`/v1/chat/completions`) and Anthropic-compatible (`/v1/messages`) APIs in front of AI Pass
- `packages/thaipass` - AI SDK provider package that interacts with AI Pass directly without HTTP
- `packages/core` - Shared core logic, models, types, and utilities
- `packages/typescript-config` - Shared TypeScript configuration

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/<your-username>/thaipass.git`
3. Install dependencies: `bun install`
4. Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run checks & tests:
   ```bash
   bun run check
   bun test
   bun run typecheck
   ```
7. Build packages: `bun run build`
8. Commit your changes with clear, descriptive commit messages
9. Push to your fork
10. Submit a Pull Request

## Working in the Monorepo

### Running Commands

From the root directory:

- `bun dev` - Start development servers
- `bun run build` - Build all packages and applications
- `bun test` - Run all tests across the monorepo
- `bun run typecheck` - Run TypeScript type checks
- `bun run check` - Run Ultracite linter and formatter checks
- `bun run fix` - Automatically fix linting and formatting issues
- `bun run lms` - Run LM Studio bridge / local testing helper in `apps/proxy`

From a specific package or app:

- `cd apps/proxy && bun dev` - Run the proxy dev server
- `cd packages/thaipass && bun test` - Run package tests

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. When you make changes that should be released, please create a changeset:

1. Run `bun changeset` in the root directory
2. Select the packages you've changed (use space to select, enter to confirm)
3. Choose the appropriate version bump:
   - `patch` - Bug fixes and minor changes
   - `minor` - New features that don't break existing functionality
   - `major` - Breaking changes
4. Write a clear description of your changes (this will appear in the changelog)
5. Commit the generated changeset file in `.changeset/` with your changes

**When to create a changeset:**

- Bug fixes
- New features
- Breaking changes
- Performance improvements

**When NOT to create a changeset:**

- Internal refactoring with no user-facing changes
- Test updates
- Build or CI configuration changes
- README or documentation updates

## Pull Request Guidelines

- Ensure your PR addresses a specific issue or adds value to the project
- Keep changes focused and atomic
- Follow existing code style and conventions (run `bun run check` / `bun run fix`)
- Include tests if applicable
- **Add a changeset if your changes affect the published packages**
- Update documentation as needed
- Ensure all CI checks pass (`bun run check`, `bun run typecheck`, `bun test`, `bun run build`)
- Write clear commit messages

## Code Style

- Run `bun run fix` before committing to auto-format and lint your code with Ultracite
- Write clear, self-documenting code
- Follow TypeScript best practices

## Reporting Issues and Discussions

### Bugs and Issues

Use the GitHub [issue tracker](https://github.com/PunGrumpy/thaipass/issues) to report bugs:

- Check if the issue already exists before creating a new one
- Provide clear reproduction steps, environment details, and relevant logs

### Feature Requests and Discussions

For ideas, questions, and general discussions, please open a [discussion](https://github.com/PunGrumpy/thaipass/discussions) or submit a feature request issue.

## Code of Conduct

Please note that this project follows a Code of Conduct. By participating, you are expected to uphold this code.

Thank you for contributing!
