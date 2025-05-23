import * as fs from 'fs';

export function readJSON(filePath: string, createFileIfMissing = false): any {
    if (!fs.existsSync(filePath)) {
        if (createFileIfMissing) {
            fs.writeFileSync(filePath, '{}');
        } else {
            return null;
        }
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
}

export function writeJSON(filePath: string, data: any): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}
