import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getWorkspaceFolder(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    return workspaceFolder;
}

export function getVSCodeDir(startPath: string | null): string {
    const workspaceRoot = getWorkspaceFolder();
    if (!startPath) {
        return workspaceRoot;
    }

    let currentPath = startPath;
    while (currentPath && currentPath.length >= workspaceRoot.length) {
        const vscodePath = path.join(currentPath, '.vscode');
        if (fs.existsSync(vscodePath)) {
            return vscodePath;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    return workspaceRoot;
}

export function getSettingsPath(startPath: string | null): string {
    const vscodeDir = getVSCodeDir(startPath);
    return path.join(vscodeDir, 'settings.json');
}
