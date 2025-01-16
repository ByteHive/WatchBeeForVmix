const chokidar = require('chokidar');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Get the directory where the executable is located
const getExeDir = () => {
    // When packaged with pkg, process.pkg is defined
    if (process.pkg) {
        return path.dirname(process.execPath);
    }
    return __dirname;
};

// Load configuration
let config;
try {
    const configPath = path.join(getExeDir(), 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    // Default configuration if config.json is not found
    config = {
        folderToWatch: './media',
        vmixUrl: 'http://localhost:8088',
        playlistName: 'List',
        supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg']
    };
    
    // Create default config file if it doesn't exist
    try {
        fs.writeFileSync(
            path.join(getExeDir(), 'config.json'), 
            JSON.stringify(config, null, 2)
        );
        console.log('Created default config.json');
    } catch (writeError) {
        console.error('Failed to create default config.json:', writeError.message);
    }
}

// Initialize watcher
const watcher = chokidar.watch(config.folderToWatch, {
    ignored: /(^|[\/\\])\../, // ignore hidden files
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

// Helper function to parse XML response
async function getVmixState() {
    try {
        const response = await axios.get(`${config.vmixUrl}/api`);
        return response.data;
    } catch (error) {
        console.error(`Error getting vMix state: ${error.message}`);
        return null;
    }
}

// Helper function to find list items for a specific input
function findListItems(xmlText, absolutePath) {
    try {
        const listMatch = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<list>([\s\S]*?)<\/list>/g);
        
        if (listMatch) {
            for (const list of listMatch) {
                const items = list.match(/<item[^>]*>(.*?)<\/item>/g);
                if (items) {
                    const index = items.findIndex(item => item.includes(absolutePath)) + 1;
                    if (index > 0) {
                        const titleMatch = list.match(/title="([^"]*?)"/);
                        const inputName = titleMatch ? titleMatch[1] : 'List';
                        return { index, inputName };
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`Error parsing XML: ${error.message}`);
        return null;
    }
}

// Helper function to add file to vMix playlist
async function addToVmixPlaylist(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    if (!config.supportedExtensions.includes(extension)) {
        console.log(`Ignoring file ${filePath} - unsupported format`);
        return;
    }

    try {
        const absolutePath = path.resolve(filePath);
        const encodedPath = encodeURIComponent(absolutePath);
        const url = `${config.vmixUrl}/api/?Function=ListAdd&Input=${config.playlistName}&Value=${encodedPath}`;
        await axios.get(url);
        console.log(`Added ${absolutePath} to vMix playlist`);
    } catch (error) {
        console.error(`Error adding file to vMix: ${error.message}`);
    }
}

// Helper function to remove file from vMix playlist
async function removeFromVmixPlaylist(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        
        const xmlState = await getVmixState();
        if (!xmlState) return;
        
        const fileInfo = findListItems(xmlState, absolutePath);
        
        if (fileInfo) {
            const url = `${config.vmixUrl}/api/?Function=ListRemove&Input=${encodeURIComponent(fileInfo.inputName)}&Value=${fileInfo.index}`;
            await axios.get(url);
            console.log(`Removed ${absolutePath} from vMix playlist "${fileInfo.inputName}" at index ${fileInfo.index}`);
        } else {
            console.log(`File ${absolutePath} not found in any vMix playlist`);
        }
    } catch (error) {
        console.error(`Error removing file from vMix: ${error.message}`);
    }
}

// Watch for file events
watcher
    .on('add', path => {
        console.log(`File ${path} has been added`);
        addToVmixPlaylist(path);
    })
    .on('unlink', path => {
        console.log(`File ${path} has been removed`);
        removeFromVmixPlaylist(path);
    })
    .on('change', path => {
        console.log(`File ${path} has been changed`);
        addToVmixPlaylist(path);
    })
    .on('rename', (oldPath, newPath) => {
        console.log(`File renamed from ${oldPath} to ${newPath}`);
        removeFromVmixPlaylist(oldPath);
        addToVmixPlaylist(newPath);
    })
    .on('error', error => {
        console.error(`Watcher error: ${error}`);
    });

// Log that we're running
console.log('Configuration:', config);
console.log(`Watching ${config.folderToWatch} for changes...`);
console.log(`vMix API URL: ${config.vmixUrl}`);
console.log(`Supported file types: ${config.supportedExtensions.join(', ')}`);