const chokidar = require('chokidar');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Configuration
const config = {
    folderToWatch: process.env.WATCH_FOLDER || './media',
    vmixUrl: process.env.VMIX_URL || 'http://localhost:8088',
    playlistName: process.env.VMIX_PLAYLIST_NAME || 'List',
    supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg']
};

// Initialize watcher
const watcher = chokidar.watch(config.folderToWatch, {
    ignored: /(^|[\/\\])\../, // ignore hidden files
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

// Helper function to add file to vMix playlist
async function addToVmixPlaylist(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    if (!config.supportedExtensions.includes(extension)) {
        console.log(`Ignoring file ${filePath} - unsupported format`);
        return;
    }

    try {
        // Convert to absolute path if it isn't already
        const absolutePath = path.resolve(filePath);
        const encodedPath = encodeURIComponent(absolutePath);
        const url = `${config.vmixUrl}/api/?Function=ListAdd&Input=${config.playlistName}&Value=${encodedPath}`;
        await axios.get(url);
        console.log(`Added ${absolutePath} to vMix playlist`);
    } catch (error) {
        console.error(`Error adding file to vMix: ${error.message}`);
    }
}

// Helper function to parse XML response
async function getVmixState() {
    try {
        const response = await axios.get(`${config.vmixUrl}/api`);
        // Response is XML, we'll use a simple way to parse it for now
        const xmlText = response.data;
        return xmlText;
    } catch (error) {
        console.error(`Error getting vMix state: ${error.message}`);
        return null;
    }
}

// Helper function to find list items for a specific input
function findListItems(xmlText, absolutePath) {
    try {
        // Find the VideoList input that contains our file
        const listMatch = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<list>([\s\S]*?)<\/list>/g);
        
        if (listMatch) {
            for (const list of listMatch) {
                // Extract items from the list
                const items = list.match(/<item[^>]*>(.*?)<\/item>/g);
                if (items) {
                    // Find the index of our file (1-based for vMix)
                    const index = items.findIndex(item => item.includes(absolutePath)) + 1;
                    if (index > 0) {
                        // Find the input title/name
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
        
        // Get current vMix state
        const xmlState = await getVmixState();
        if (!xmlState) return;
        
        // Find the file in the lists
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
        // Re-add the file to update it in vMix
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
console.log(`Watching ${config.folderToWatch} for changes...`);
console.log(`vMix API URL: ${config.vmixUrl}`);
console.log(`Supported file types: ${config.supportedExtensions.join(', ')}`);