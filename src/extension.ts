import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { outputChannel } from './outputChannel';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface RepoConfig {
    repos: { url: string }[];
}

// Track running debug sessions
let totalLaunchConfigs = 0;
let runningLaunchConfigs = 0;
let statusBarItem: vscode.StatusBarItem;
// Track configurations that are part of the largest compound
let largestCompoundConfigs: Set<string> = new Set();

async function updateStatusBarItem() {
    outputChannel.appendLine(
        `Updating status bar: running=${runningLaunchConfigs}, total=${totalLaunchConfigs}`
    );

    // Always show the status bar item
    statusBarItem.text = `$(debug) ${runningLaunchConfigs}/${totalLaunchConfigs}`;
    statusBarItem.tooltip = `Running ${runningLaunchConfigs} out of ${totalLaunchConfigs}`;
    statusBarItem.backgroundColor =
        runningLaunchConfigs === totalLaunchConfigs && totalLaunchConfigs > 0
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
    statusBarItem.show();
}

async function readRepoConfig(workspaceRoot: string): Promise<RepoConfig> {
    const configPath = path.join(workspaceRoot, 'multi.json');
    const content = await fs.promises.readFile(configPath, 'utf-8');
    return JSON.parse(content);
}

async function getRepoFolders(workspaceRoot: string): Promise<string[]> {
    const config = await readRepoConfig(workspaceRoot);
    return config.repos.map((repo) => {
        // Extract the last part of the URL as the folder name
        const repoUrl = repo.url;
        const folderName = repoUrl.split('/').pop()!;
        return path.join(workspaceRoot, folderName);
    });
}

async function runMultiSync(type: 'vscode' | 'rules' | null, workspaceRoot: string) {
    try {
        const multiPath = vscode.workspace
            .getConfiguration('cursorMulti')
            .get('executablePath', 'multi');
        const cmd = type ? `${multiPath} sync ${type}` : `${multiPath} sync`;
        await execAsync(cmd, { cwd: workspaceRoot });
        outputChannel.appendLine(`Successfully ran ${cmd}`);
    } catch (error) {
        outputChannel.appendLine(
            `Error running ${type ? `multi sync ${type}` : 'multi sync'}: ${error}`
        );
        throw error;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.appendLine('Cursor Multi extension activated');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
        outputChannel.appendLine('No workspace folder found');
        return;
    }

    try {
        const repoFolders = await getRepoFolders(workspaceRoot);

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.name = 'Launch Status';
        statusBarItem.command = 'workbench.action.debug.start'; // Make it clickable to open debug view
        context.subscriptions.push(statusBarItem);
        outputChannel.appendLine('Created status bar item');

        // Initial update to make it visible
        await updateStatusBarItem();

        // Listen for debug sessions starting and ending
        context.subscriptions.push(
            vscode.debug.onDidStartDebugSession((session) => {
                // Only increment if this session is part of the largest compound
                if (largestCompoundConfigs.has(session.name)) {
                    runningLaunchConfigs++;
                    outputChannel.appendLine(
                        `Debug session started: ${session.name}, running count: ${runningLaunchConfigs}`
                    );
                    updateStatusBarItem();
                }
            })
        );

        context.subscriptions.push(
            vscode.debug.onDidTerminateDebugSession((session) => {
                // Only decrement if this session was part of the largest compound
                if (largestCompoundConfigs.has(session.name)) {
                    runningLaunchConfigs = Math.max(0, runningLaunchConfigs - 1);
                    outputChannel.appendLine(
                        `Debug session ended: ${session.name}, running count: ${runningLaunchConfigs}`
                    );
                    updateStatusBarItem();
                }
            })
        );

        // Watch launch.json files for changes to update total count
        const updateTotalConfigs = async () => {
            let total = 0;
            largestCompoundConfigs.clear();

            // Only look at root workspace launch.json
            const launchPath = path.join(workspaceRoot, '.vscode', 'launch.json');
            if (fs.existsSync(launchPath)) {
                try {
                    const content = await fs.promises.readFile(launchPath, 'utf-8');
                    const launchConfig = JSON.parse(content);

                    // Find the compound with the most configurations
                    if (launchConfig.compounds && Array.isArray(launchConfig.compounds)) {
                        let maxConfigsCount = 0;
                        let largestCompound = null;

                        for (const compound of launchConfig.compounds) {
                            if (
                                compound.configurations &&
                                compound.configurations.length > maxConfigsCount
                            ) {
                                maxConfigsCount = compound.configurations.length;
                                largestCompound = compound;
                            }
                        }

                        if (largestCompound) {
                            // Update the total and store the configurations from the largest compound
                            total = maxConfigsCount;
                            largestCompound.configurations.forEach((config: string) => {
                                largestCompoundConfigs.add(config);
                            });
                            outputChannel.appendLine(
                                `Found largest compound with ${maxConfigsCount} configurations in root launch.json`
                            );
                        }
                    }
                } catch (error) {
                    outputChannel.appendLine(`Error reading root launch.json: ${error}`);
                }
            }

            totalLaunchConfigs = total;
            // Reset running count since we're changing what we're tracking
            runningLaunchConfigs = 0;
            outputChannel.appendLine(`Total configurations in largest compound: ${total}`);
            await updateStatusBarItem();
        };

        // Initial count of launch configurations
        await updateTotalConfigs();

        // Modify the file watchers section to separate launch.json watching
        const rootVscodePath = path.join(workspaceRoot, '.vscode');
        if (fs.existsSync(rootVscodePath)) {
            // Watch root launch.json for compound changes
            const launchWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(rootVscodePath, 'launch.json')
            );

            launchWatcher.onDidChange(async () => {
                outputChannel.appendLine(`Root launch configuration changed`);
                await updateTotalConfigs();
            });

            launchWatcher.onDidCreate(async () => {
                outputChannel.appendLine(`Root launch configuration created`);
                await updateTotalConfigs();
            });

            launchWatcher.onDidDelete(async () => {
                outputChannel.appendLine(`Root launch configuration deleted`);
                await updateTotalConfigs();
            });

            context.subscriptions.push(launchWatcher);

            // Watch root extensions.json for changes
            const extensionsWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(rootVscodePath, 'extensions.json')
            );

            extensionsWatcher.onDidChange(async () => {
                outputChannel.appendLine(`Root extensions configuration changed`);
                await runMultiSync('vscode', workspaceRoot);
            });

            extensionsWatcher.onDidCreate(async () => {
                outputChannel.appendLine(`Root extensions configuration created`);
                await runMultiSync('vscode', workspaceRoot);
            });

            extensionsWatcher.onDidDelete(async () => {
                outputChannel.appendLine(`Root extensions configuration deleted`);
                await runMultiSync('vscode', workspaceRoot);
            });

            context.subscriptions.push(extensionsWatcher);
        }

        // Watch subrepo .vscode folders for other changes (keeping existing functionality)
        for (const repoFolder of repoFolders) {
            const vscodePath = path.join(repoFolder, '.vscode');
            if (fs.existsSync(vscodePath)) {
                // Watch .vscode folder
                const vscodeWatcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(vscodePath, '**/*')
                );

                vscodeWatcher.onDidChange(async () => {
                    outputChannel.appendLine(`Changes detected in ${vscodePath}`);
                    await runMultiSync('vscode', workspaceRoot);
                });

                vscodeWatcher.onDidCreate(async () => {
                    outputChannel.appendLine(`New file created in ${vscodePath}`);
                    await runMultiSync('vscode', workspaceRoot);
                });

                vscodeWatcher.onDidDelete(async () => {
                    outputChannel.appendLine(`File deleted in ${vscodePath}`);
                    await runMultiSync('vscode', workspaceRoot);
                });

                context.subscriptions.push(vscodeWatcher);

                // Watch .cursor/rules folder
                const cursorRulesPath = path.join(repoFolder, '.cursor', 'rules');
                if (fs.existsSync(cursorRulesPath)) {
                    const cursorWatcher = vscode.workspace.createFileSystemWatcher(
                        new vscode.RelativePattern(cursorRulesPath, '**/*')
                    );

                    cursorWatcher.onDidChange(async () => {
                        outputChannel.appendLine(`Changes detected in ${cursorRulesPath}`);
                        await runMultiSync('rules', workspaceRoot);
                    });

                    cursorWatcher.onDidCreate(async () => {
                        outputChannel.appendLine(`New file created in ${cursorRulesPath}`);
                        await runMultiSync('rules', workspaceRoot);
                    });

                    cursorWatcher.onDidDelete(async () => {
                        outputChannel.appendLine(`File deleted in ${cursorRulesPath}`);
                        await runMultiSync('rules', workspaceRoot);
                    });

                    context.subscriptions.push(cursorWatcher);
                }
            }
        }

        outputChannel.appendLine(
            'Cursor Multi extension activated with file watchers and debug tracking'
        );

        runMultiSync(null, workspaceRoot);
    } catch (error) {
        outputChannel.appendLine(`Error activating Cursor Multi extension: ${error}`);
    }
}
