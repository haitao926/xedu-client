import {
    getEntryKindForFile,
    isBlocklyFile,
    isDirectory,
    isHtmlFile,
    isNotebookFile,
    isPythonScriptFile,
    isScratchFile,
    sortFiles,
} from './file-utils.js';

const CODE_FILE_EXTENSIONS = new Set([
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp',
    '.go', '.rs', '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.toml',
    '.md', '.txt', '.sql', '.sh', '.bat', '.ps1',
]);

function flattenFiles(files, bucket = []) {
    if (!Array.isArray(files)) return bucket;
    files.forEach((file) => {
        if (!file) return;
        bucket.push(file);
        if (Array.isArray(file.children) && file.children.length) {
            flattenFiles(file.children, bucket);
        }
    });
    return bucket;
}

function getFileExtension(filePath = '') {
    const text = (filePath || '').toString().toLowerCase();
    const dot = text.lastIndexOf('.');
    return dot < 0 ? '' : text.slice(dot);
}

export function getExperimentFileOverview(exp) {
    const sourceFiles = Array.isArray(exp?.files) ? exp.files : [];
    const topLevelFolders = sortFiles(sourceFiles.filter((file) => isDirectory(file)));
    const flatFiles = flattenFiles(sourceFiles, []);
    const allFiles = flatFiles.filter((file) => file && !isDirectory(file) && (file.path || file.name));
    const htmlFiles = allFiles.filter((file) => isHtmlFile(file));
    const scratchFiles = allFiles.filter((file) => isScratchFile(file));
    const blocklyFiles = allFiles.filter((file) => isBlocklyFile(file));
    const notebookFiles = allFiles.filter((file) => isNotebookFile(file));
    const pythonFiles = allFiles.filter((file) => isPythonScriptFile(file));
    const primaryPythonFile = notebookFiles[0] || pythonFiles[0] || null;
    const primaryBlocklyFile = blocklyFiles[0] || null;
    const primaryScratchFile = scratchFiles[0] || null;
    const codeFiles = allFiles.filter((file) => {
        if (isHtmlFile(file) || isNotebookFile(file) || isBlocklyFile(file)) return false;
        return CODE_FILE_EXTENSIONS.has(getFileExtension(file.path || file.name || ''));
    });
    const otherFiles = allFiles.filter((file) => {
        if (htmlFiles.includes(file) || scratchFiles.includes(file) || blocklyFiles.includes(file)) return false;
        if (notebookFiles.includes(file) || codeFiles.includes(file)) return false;
        return true;
    });
    const primaryEntry =
        (htmlFiles[0] && { file: htmlFiles[0], kind: 'html' }) ||
        (primaryScratchFile && { file: primaryScratchFile, kind: 'scratch' }) ||
        (primaryBlocklyFile && { file: primaryBlocklyFile, kind: 'blockly' }) ||
        (primaryPythonFile && { file: primaryPythonFile, kind: getEntryKindForFile(primaryPythonFile) }) ||
        (allFiles[0] && { file: allFiles[0], kind: getEntryKindForFile(allFiles[0]) }) ||
        null;
    return {
        allFiles,
        htmlFiles,
        scratchFiles,
        blocklyFiles,
        notebookFiles,
        pythonFiles,
        codeFiles,
        otherFiles,
        topLevelFolders,
        primaryPythonFile,
        primaryBlocklyFile,
        primaryScratchFile,
        primaryEntry,
    };
}
