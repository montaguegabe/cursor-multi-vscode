# VS Code Multi

VS Code Multi is the best way to work with VS Code on multiple Git repos at once. Set up your "sub-repos", for quick access to:

-   Automatic syncing of your `.vscode` folder: `launch.json`, `tasks.json`, `settings.json`

## Installation

You must install the CLI tool first on your system for this extension to work:

### Using `brew` (macOS)

Run:
`brew tap montaguegabe/vscode-multi`
then
`brew install vscode-multi`

### Using `pipx` (macOS, Linux, Windows):

-   Install [pipx](https://github.com/pypa/pipx)
-   Run `pipx install vscode-multi`

## Getting started

To get started, create a new directory that will house all your related repos and run:

```
multi init
```

Then paste in the URLs of all the repositories you want to use with VS Code/Cursor. You can optionally specify descriptions of what they do, which will be used to create a new repo-directories.mdc Cursor rule.

Then open your new repository in VS Code/Cursor!

## Development

To debug, run:
`npm run compile`

To install the extension, run:
`npm run install-extension`

Then reload any VSCode window you want the extension to run on by running the "Developer: Reload Window" command.
